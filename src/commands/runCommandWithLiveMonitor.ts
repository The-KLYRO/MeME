import * as cp from 'node:child_process';
import * as vscode from 'vscode';
import type { Logger } from '../core/logger';
import { type OutputIngestion } from '../core/outputIngestion';
import { type SessionTracker } from '../core/sessionTracker';
import { toTerminalChunk } from '../core/text';
import { type SourceType, type TrackedSession } from '../core/types';

type MonitoredExecutionRequest =
  | {
      kind: 'shell';
      label: string;
      sourceType: SourceType;
      commandLine: string;
      cwd?: string;
      env?: Record<string, string | undefined>;
      metadata?: Record<string, string | undefined>;
    }
  | {
      kind: 'process';
      label: string;
      sourceType: SourceType;
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string | undefined>;
      metadata?: Record<string, string | undefined>;
    };

export interface MonitoredRunnerDependencies {
  sessionTracker: SessionTracker;
  outputIngestion: OutputIngestion;
  logger: Logger;
  onSessionStarted: (session: TrackedSession) => void | Promise<void>;
  onSessionFinished: (sessionId: string, exitCode?: number) => void | Promise<void>;
}

export class MonitoredTerminalRunner {
  private runCounter = 0;

  public constructor(private readonly dependencies: MonitoredRunnerDependencies) {}

  public async promptAndRunCommand(): Promise<void> {
    const commandLine = await vscode.window.showInputBox({
      title: 'Run Command With Live Monitor',
      prompt: 'Enter a shell command to run with guaranteed live monitoring.',
      ignoreFocusOut: true
    });

    if (!commandLine || commandLine.trim().length === 0) {
      return;
    }

    await this.run({
      kind: 'shell',
      label: commandLine.trim(),
      sourceType: 'terminal',
      commandLine: commandLine.trim(),
      cwd: getDefaultCwd(),
      metadata: {
        origin: 'runCommandWithLiveMonitor'
      }
    });
  }

  public async pickAndRunTask(): Promise<void> {
    const tasks = await vscode.tasks.fetchTasks();
    if (tasks.length === 0) {
      void vscode.window.showWarningMessage('No tasks were found to run with live monitoring.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      tasks.map((task) => ({
        label: task.name,
        description: task.definition.type,
        task
      })),
      {
        title: 'Run Task With Live Monitor',
        matchOnDescription: true,
        ignoreFocusOut: true
      }
    );

    if (!picked) {
      return;
    }

    const request = toMonitoredRequest(picked.task);
    if (!request) {
      this.dependencies.logger.warn(`task '${picked.task.name}' could not be wrapped for live monitoring; unsupported execution type`);
      void vscode.window.showWarningMessage('This task cannot be wrapped for reliable live monitoring. Use shell/process tasks or shell integration.');
      return;
    }

    await this.run(request);
  }

  public async attachToRunningTask(): Promise<void> {
    const executions = vscode.tasks.taskExecutions;
    if (executions.length === 0) {
      void vscode.window.showWarningMessage('No running task is available to attach.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      executions.map((execution) => ({
        label: execution.task.name,
        description: execution.task.definition.type,
        execution
      })),
      {
        title: 'Attach Monitor To Task',
        matchOnDescription: true,
        ignoreFocusOut: true
      }
    );

    if (!picked) {
      return;
    }

    const session = this.dependencies.sessionTracker.getOrCreateForObject(picked.execution, {
      sourceType: 'task',
      label: picked.execution.task.name,
      tool: picked.execution.task.definition.type,
      reliableLiveCapture: false,
      metadata: {
        taskName: picked.execution.task.name,
        taskType: picked.execution.task.definition.type,
        attached: 'true'
      }
    });

    this.dependencies.logger.info(
      `attached task monitor session=${session.sessionId} task='${picked.execution.task.name}' liveTextCapture=dependsOnShellIntegrationOrDiagnostics`
    );
    await this.dependencies.onSessionStarted(session);
  }

  public async run(request: MonitoredExecutionRequest): Promise<void> {
    const key = `monitored-${++this.runCounter}-${Date.now()}`;
    const session = this.dependencies.sessionTracker.getOrCreateForString(key, {
      sourceType: request.sourceType,
      label: request.label,
      commandLine: request.kind === 'shell' ? request.commandLine : `${request.command} ${request.args.join(' ')}`.trim(),
      tool: request.label,
      reliableLiveCapture: true,
      metadata: request.metadata
    });

    const pty = new MonitoredPseudoterminal({
      request,
      session,
      outputIngestion: this.dependencies.outputIngestion,
      logger: this.dependencies.logger,
      onStarted: this.dependencies.onSessionStarted,
      onFinished: this.dependencies.onSessionFinished
    });

    const terminal = vscode.window.createTerminal({
      name: `Meme Monitor: ${request.label}`,
      pty,
      isTransient: true
    });

    terminal.show(true);
  }
}

class MonitoredPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number>();
  private process?: cp.ChildProcessWithoutNullStreams;
  private finished = false;

  public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  public readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;

  public constructor(
    private readonly options: {
      request: MonitoredExecutionRequest;
      session: TrackedSession;
      outputIngestion: OutputIngestion;
      logger: Logger;
      onStarted: (session: TrackedSession) => void | Promise<void>;
      onFinished: (sessionId: string, exitCode?: number) => void | Promise<void>;
    }
  ) {}

  public open(): void {
    void this.options.onStarted(this.options.session);
    this.writeEmitter.fire(toTerminalChunk(`$ ${this.options.session.commandLine ?? this.options.session.label}\n`));
    this.process = spawnRequest(this.options.request);

    this.process.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.writeEmitter.fire(toTerminalChunk(text));
      this.options.outputIngestion.pushChunk(this.options.session, text);
    });

    this.process.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.writeEmitter.fire(toTerminalChunk(text));
      this.options.outputIngestion.pushChunk(this.options.session, text);
    });

    this.process.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.error(`monitored execution error session=${this.options.session.sessionId} ${message}`);
      this.writeEmitter.fire(toTerminalChunk(`${message}\n`));
      this.finish(1);
    });

    this.process.on('close', (exitCode) => {
      this.finish(exitCode ?? undefined);
    });
  }

  public close(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
  }

  public handleInput(data: string): void {
    this.process?.stdin.write(data);
  }

  private finish(exitCode?: number): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.options.outputIngestion.flush(this.options.session);
    void this.options.onFinished(this.options.session.sessionId, exitCode);
    this.closeEmitter.fire(exitCode ?? 0);
  }
}

function spawnRequest(request: MonitoredExecutionRequest): cp.ChildProcessWithoutNullStreams {
  const env = {
    ...process.env,
    ...request.env
  };

  if (request.kind === 'process') {
    return cp.spawn(request.command, request.args, {
      cwd: request.cwd,
      env,
      stdio: 'pipe',
      windowsHide: true
    });
  }

  const shellPath = vscode.env.shell || defaultShell();
  const shellArgs = shellArguments(shellPath, request.commandLine);
  return cp.spawn(shellPath, shellArgs, {
    cwd: request.cwd,
    env,
    stdio: 'pipe',
    windowsHide: true
  });
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
  }

  return process.env.SHELL ?? '/bin/bash';
}

function shellArguments(shellPath: string, commandLine: string): string[] {
  const lower = shellPath.toLowerCase();
  if (process.platform === 'win32') {
    if (lower.includes('pwsh') || lower.includes('powershell')) {
      return ['-NoLogo', '-NoProfile', '-Command', commandLine];
    }

    return ['/d', '/s', '/c', commandLine];
  }

  return ['-lc', commandLine];
}

function toMonitoredRequest(task: vscode.Task): MonitoredExecutionRequest | undefined {
  const execution = task.execution;
  if (!execution) {
    return undefined;
  }

  if (execution instanceof vscode.ShellExecution) {
    const commandLine = execution.commandLine ?? renderShellCommand(execution.command, execution.args ?? []);
    if (!commandLine) {
      return undefined;
    }

    return {
      kind: 'shell',
      label: task.name,
      sourceType: 'task',
      commandLine,
      cwd: execution.options?.cwd,
      env: execution.options?.env,
      metadata: {
        taskName: task.name,
        taskType: task.definition.type
      }
    };
  }

  if (execution instanceof vscode.ProcessExecution) {
    return {
      kind: 'process',
      label: task.name,
      sourceType: 'task',
      command: execution.process,
      args: execution.args,
      cwd: execution.options?.cwd,
      env: execution.options?.env,
      metadata: {
        taskName: task.name,
        taskType: task.definition.type
      }
    };
  }

  return undefined;
}

function renderShellCommand(
  command: string | vscode.ShellQuotedString | undefined,
  args: Array<string | vscode.ShellQuotedString>
): string | undefined {
  if (!command) {
    return undefined;
  }

  return [renderShellToken(command), ...args.map((arg) => renderShellToken(arg))].join(' ');
}

function renderShellToken(value: string | vscode.ShellQuotedString): string {
  const raw = typeof value === 'string' ? value : value.value;
  if (/\s/.test(raw)) {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }

  return raw;
}

function getDefaultCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export type { MonitoredExecutionRequest };
