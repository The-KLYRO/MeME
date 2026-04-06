import * as vscode from 'vscode';
import { AudioEngine } from './core/audioEngine';
import { DebounceAndCooldown } from './core/cooldown';
import { Logger } from './core/logger';
import { OutputIngestion } from './core/outputIngestion';
import { PatternEngine } from './core/patternEngine';
import { PresetRegistry } from './core/presets';
import { shouldIgnoreSession } from './core/sessionFilter';
import { SessionTracker } from './core/sessionTracker';
import { SettingsRegistry } from './core/settings';
import { StatusController } from './core/statusController';
import { truncate } from './core/text';
import { type LifecycleEventType, type RuleEventType, type SessionContext, type SoundEventType, type TrackedSession } from './core/types';
import { MUTE_STATE_KEY } from './commands/commandIds';
import { registerCommands } from './commands';
import { MonitoredTerminalRunner } from './commands/runCommandWithLiveMonitor';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new Logger('MeME');
  context.subscriptions.push(logger);

  const settings = new SettingsRegistry({
    extensionPath: context.extensionPath,
    getConfig: () => vscode.workspace.getConfiguration('memeSounds'),
    getWorkspaceFolders: () => vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
    onIssue: (message) => logger.warn(`config issue ${message}`)
  });

  const presets = new PresetRegistry();
  const audio = new AudioEngine(logger);
  const cooldown = new DebounceAndCooldown(settings.getSnapshot().cooldownMs);
  const patternEngine = new PatternEngine(presets, logger);
  const sessionTracker = new SessionTracker();
  const outputIngestion = new OutputIngestion();
  const status = new StatusController(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100));
  context.subscriptions.push(status);

  const startedSessions = new Set<string>();
  const finishedSessions = new Set<string>();

  const refreshStatus = (): void => {
    status.refresh(settings.getSnapshot(), sessionTracker.getActiveSessions());
  };

  const logSound = (eventType: SoundEventType, session: TrackedSession, played: boolean, reason?: string): void => {
    logger.info(`sound ${played ? 'played' : 'skipped'} session=${session.sessionId} event=${eventType} reason=${reason ?? 'ok'}`);
  };

  const playSoundEvent = async (session: TrackedSession, eventType: SoundEventType): Promise<void> => {
    sessionTracker.markEvent(session.sessionId, eventType);
    status.rememberEvent(session, eventType);
    refreshStatus();
    if (!settings.getSnapshot().enabled) {
      logSound(eventType, session, false, 'disabled');
      return;
    }

    const result = await audio.play(eventType);
    logSound(eventType, session, result.played, result.reason);
  };

  const onSessionStarted = async (session: TrackedSession): Promise<void> => {
    if (startedSessions.has(session.sessionId)) {
      return;
    }

    startedSessions.add(session.sessionId);
    logger.info(
      `session created id=${session.sessionId} source=${session.sourceType} label='${session.label}' reliableLiveCapture=${session.reliableLiveCapture}`
    );
    await playSoundEvent(session, 'started');
  };

  const onSessionFinished = async (sessionId: string, exitCode?: number): Promise<void> => {
    if (finishedSessions.has(sessionId)) {
      return;
    }

    finishedSessions.add(sessionId);
    const session = sessionTracker.finish(sessionId, exitCode);
    if (!session) {
      return;
    }

    cooldown.resetSession(sessionId);
    logger.info(`session finished id=${session.sessionId} exitCode=${exitCode ?? 'undefined'} failed=${session.failureDetected}`);

    if (session.failureDetected) {
      if (session.lastEventType !== 'failed' && settings.getSnapshot().enabled) {
        await playSoundEvent(session, 'failed');
      } else {
        refreshStatus();
      }
      return;
    }

    await playSoundEvent(session, 'finished');
  };

  const classifyEvent = async (eventType: RuleEventType, session: TrackedSession, reason: string, cooldownMs?: number): Promise<void> => {
    const snapshot = settings.getSnapshot();
    sessionTracker.markEvent(session.sessionId, eventType, reason);
    status.rememberEvent(session, eventType);
    refreshStatus();

    if (!snapshot.enabled) {
      logSound(eventType, session, false, 'disabled');
      return;
    }

    const decision = cooldown.shouldAllow({
      sessionId: session.sessionId,
      eventType,
      cooldownMs
    });
    if (!decision.allowed) {
      logger.info(
        `sound skipped by cooldown session=${session.sessionId} event=${eventType} reason=${decision.reason} collapsed=${decision.collapseCount}`
      );
      logSound(eventType, session, false, decision.reason);
      return;
    }

    const result = await audio.play(eventType);
    logSound(eventType, session, result.played, result.reason);
  };

  outputIngestion.onLine((ingestedLine) => {
    void (async () => {
      const classification = patternEngine.classify(ingestedLine);
      if (classification.eventType === 'none' || !classification.matchedRule) {
        return;
      }

      const session = sessionTracker.get(ingestedLine.session.sessionId);
      if (!session) {
        return;
      }

      logger.info(
        `preset matched session=${session.sessionId} preset=${classification.matchedRule.presetId} rule=${classification.matchedRule.id}`
      );
      logger.info(
        `line classified session=${session.sessionId} event=${classification.eventType} rule=${classification.matchedRule.id} line='${truncate(classification.line)}'`
      );
      await classifyEvent(
        classification.eventType,
        session,
        classification.matchedRule.id,
        classification.matchedRule.cooldownMs ?? settings.getSnapshot().cooldownMs
      );
    })();
  });

  const reloadAll = async (reason: string): Promise<void> => {
    const snapshot = settings.reload();
    cooldown.setDefaultCooldown(snapshot.cooldownMs);
    patternEngine.reload(snapshot);
    await audio.applySettings(snapshot);
    refreshStatus();
    logger.info(`settings reloaded reason=${reason} customRules=${snapshot.customRules.length}`);
  };

  await reloadAll('activate');
  audio.setMuted(context.globalState.get<boolean>(MUTE_STATE_KEY, false));
  status.setMuted(audio.isMuted());
  refreshStatus();

  const monitoredRunner = new MonitoredTerminalRunner({
    sessionTracker,
    outputIngestion,
    logger,
    onSessionStarted,
    onSessionFinished
  });

  context.subscriptions.push(
    ...registerCommands({
      context,
      settings,
      audio,
      logger,
      status,
      monitoredRunner,
      reloadAll,
      refreshStatus
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('memeSounds')) {
        void reloadAll('configuration');
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((event) => {
      if (!settings.getSnapshot().enableTerminalMonitoring) {
        return;
      }

      const seed = {
        sourceType: 'terminal' as const,
        label: event.terminal.name,
        commandLine: event.execution.commandLine.value,
        tool: event.execution.commandLine.value,
        reliableLiveCapture: true,
        metadata: {
          terminalName: event.terminal.name,
          cwd: event.execution.cwd?.fsPath,
          commandLineTrusted: String(event.execution.commandLine.isTrusted),
          commandLineConfidence: String(event.execution.commandLine.confidence)
        }
      };

      if (shouldIgnoreSession(seed)) {
        logger.info(`terminal monitoring ignored label='${event.terminal.name}' command='${event.execution.commandLine.value}'`);
        return;
      }

      const session = sessionTracker.getOrCreateForObject(event.execution, seed);

      void onSessionStarted(session);
      void consumeShellExecution(event.execution, session, outputIngestion, logger);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      if (!settings.getSnapshot().enableTerminalMonitoring) {
        return;
      }

      const seed = {
        sourceType: 'terminal' as const,
        label: event.terminal.name,
        commandLine: event.execution.commandLine.value,
        tool: event.execution.commandLine.value,
        reliableLiveCapture: true,
        metadata: {
          terminalName: event.terminal.name,
          cwd: event.execution.cwd?.fsPath
        }
      };

      if (shouldIgnoreSession(seed)) {
        return;
      }

      const session = sessionTracker.getOrCreateForObject(event.execution, seed);

      outputIngestion.flush(session);
      void onSessionFinished(session.sessionId, event.exitCode);
    })
  );

  context.subscriptions.push(
    vscode.tasks.onDidStartTaskProcess((event) => {
      if (!settings.getSnapshot().enableTaskMonitoring) {
        return;
      }

      const task = event.execution.task;
      const session = sessionTracker.getOrCreateForObject(event.execution, {
        sourceType: 'task',
        label: task.name,
        tool: task.definition.type,
        reliableLiveCapture: false,
        metadata: {
          taskName: task.name,
          taskType: task.definition.type,
          processId: String(event.processId)
        }
      });

      void onSessionStarted(session);
    })
  );

  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess((event) => {
      if (!settings.getSnapshot().enableTaskMonitoring) {
        return;
      }

      const task = event.execution.task;
      const session = sessionTracker.getOrCreateForObject(event.execution, {
        sourceType: 'task',
        label: task.name,
        tool: task.definition.type,
        reliableLiveCapture: false,
        metadata: {
          taskName: task.name,
          taskType: task.definition.type
        }
      });

      void onSessionFinished(session.sessionId, event.exitCode);
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((debugSession) => {
      if (!settings.getSnapshot().enableDebugMonitoring) {
        return;
      }

      const session = sessionTracker.getOrCreateForObject(debugSession, {
        sourceType: 'debug',
        label: debugSession.name,
        tool: debugSession.type,
        reliableLiveCapture: true,
        metadata: {
          debugType: debugSession.type,
          configurationName: typeof debugSession.configuration.name === 'string' ? debugSession.configuration.name : undefined
        }
      });

      void onSessionStarted(session);
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((debugSession) => {
      if (!settings.getSnapshot().enableDebugMonitoring) {
        return;
      }

      const session = sessionTracker.getOrCreateForObject(debugSession, {
        sourceType: 'debug',
        label: debugSession.name,
        tool: debugSession.type,
        reliableLiveCapture: true,
        metadata: {
          debugType: debugSession.type
        }
      });

      outputIngestion.flush(session);
      void onSessionFinished(session.sessionId, undefined);
    })
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', {
      createDebugAdapterTracker(debugSession) {
        return {
          onDidSendMessage: (message: unknown) => {
            if (!settings.getSnapshot().enableDebugMonitoring) {
              return;
            }

            const event = message as {
              type?: string;
              event?: string;
              body?: {
                output?: string;
              };
            };
            if (event.type !== 'event' || event.event !== 'output' || typeof event.body?.output !== 'string') {
              return;
            }

            const session = sessionTracker.getOrCreateForObject(debugSession, {
              sourceType: 'debug',
              label: debugSession.name,
              tool: debugSession.type,
              reliableLiveCapture: true,
              metadata: {
                debugType: debugSession.type
              }
            });

            outputIngestion.pushChunk(session, event.body.output);
          }
        };
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((event) => {
      if (!settings.getSnapshot().enableDiagnosticsSignal) {
        return;
      }

      const activeSessions = sessionTracker.getActiveSessions();
      if (activeSessions.length !== 1) {
        if (activeSessions.length > 1) {
          logger.info(`diagnostics signal skipped because ${activeSessions.length} sessions are active`);
        }
        return;
      }

      const session = activeSessions[0];
      if (!session) {
        return;
      }

      const worst = worstDiagnosticSeverity(event.uris);
      if (worst === undefined) {
        return;
      }

      logger.info(`diagnostics signal session=${session.sessionId} event=${worst}`);
      void classifyEvent(worst, session, `diagnostics:${worst}`, settings.getSnapshot().cooldownMs);
    })
  );
}

export function deactivate(): void {
  // No-op.
}

async function consumeShellExecution(
  execution: vscode.TerminalShellExecution,
  session: SessionContext,
  outputIngestion: OutputIngestion,
  logger: Logger
): Promise<void> {
  try {
    for await (const chunk of execution.read()) {
      outputIngestion.pushChunk(session, chunk);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`terminal shell execution read failed session=${session.sessionId} ${message}`);
  }
}

function worstDiagnosticSeverity(uris: readonly vscode.Uri[]): RuleEventType | undefined {
  let sawWarning = false;
  for (const uri of uris) {
    for (const diagnostic of vscode.languages.getDiagnostics(uri)) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
        return 'error';
      }

      if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
        sawWarning = true;
      }
    }
  }

  return sawWarning ? 'warning' : undefined;
}
