import * as vscode from 'vscode';
import type { AudioEngine } from '../core/audioEngine';
import type { Logger } from '../core/logger';
import type { SettingsRegistry } from '../core/settings';
import type { StatusController } from '../core/statusController';
import { COMMAND_IDS, MUTE_STATE_KEY } from './commandIds';
import type { MonitoredTerminalRunner } from './runCommandWithLiveMonitor';

export interface CommandDependencies {
  context: vscode.ExtensionContext;
  settings: SettingsRegistry;
  audio: AudioEngine;
  logger: Logger;
  status: StatusController;
  monitoredRunner: MonitoredTerminalRunner;
  reloadAll: (_reason: string) => void | Promise<void>;
  refreshStatus: () => void;
}

export function registerCommands(dependencies: CommandDependencies): vscode.Disposable[] {
  const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('memeSounds');

  return [
    vscode.commands.registerCommand(COMMAND_IDS.enable, async () => {
      await config().update('enabled', true, vscode.ConfigurationTarget.Global);
      await dependencies.reloadAll('command:enable');
    }),
    vscode.commands.registerCommand(COMMAND_IDS.disable, async () => {
      await config().update('enabled', false, vscode.ConfigurationTarget.Global);
      await dependencies.reloadAll('command:disable');
    }),
    vscode.commands.registerCommand(COMMAND_IDS.toggleMute, async () => {
      const nextMuted = !dependencies.audio.isMuted();
      dependencies.audio.setMuted(nextMuted);
      await dependencies.context.globalState.update(MUTE_STATE_KEY, nextMuted);
      dependencies.status.setMuted(nextMuted);
      dependencies.refreshStatus();
      dependencies.logger.info(`mute toggled muted=${nextMuted}`);
    }),
    vscode.commands.registerCommand(COMMAND_IDS.testSuccessSound, async () => {
      await playTestSound('success', dependencies);
    }),
    vscode.commands.registerCommand(COMMAND_IDS.testWarningSound, async () => {
      await playTestSound('warning', dependencies);
    }),
    vscode.commands.registerCommand(COMMAND_IDS.testErrorSound, async () => {
      await playTestSound('error', dependencies);
    }),
    vscode.commands.registerCommand(COMMAND_IDS.testFailedSound, async () => {
      await playTestSound('failed', dependencies);
    }),
    vscode.commands.registerCommand(COMMAND_IDS.runCommandWithLiveMonitor, async () => {
      await dependencies.monitoredRunner.promptAndRunCommand();
    }),
    vscode.commands.registerCommand(COMMAND_IDS.runTaskWithLiveMonitor, async () => {
      await dependencies.monitoredRunner.pickAndRunTask();
    }),
    vscode.commands.registerCommand(COMMAND_IDS.attachMonitorToTask, async () => {
      await dependencies.monitoredRunner.attachToRunningTask();
    }),
    vscode.commands.registerCommand(COMMAND_IDS.reloadPresets, async () => {
      await dependencies.reloadAll('command:reloadPresets');
    }),
    vscode.commands.registerCommand(COMMAND_IDS.openOutputLog, () => {
      dependencies.logger.show(false);
    })
  ];
}

async function playTestSound(eventType: 'success' | 'warning' | 'error' | 'failed', dependencies: CommandDependencies): Promise<void> {
  const result = await dependencies.audio.play(eventType);
  dependencies.logger.info(`test playback event=${eventType} played=${result.played} reason=${result.reason ?? 'ok'}`);
}
