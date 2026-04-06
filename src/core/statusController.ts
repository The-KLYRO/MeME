import * as vscode from 'vscode';
import { truncate } from './text';
import { type SettingsSnapshot, type SoundEventType, type TrackedSession } from './types';

type StatusEventType = SoundEventType;

export class StatusController implements vscode.Disposable {
  private lastEvent?: StatusEventType;
  private lastSessionLabel?: string;
  private muted = false;

  public constructor(private readonly item: vscode.StatusBarItem) {
    this.item.command = 'memeSounds.toggleMute';
    this.item.name = 'MeME';
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public rememberEvent(session: TrackedSession, eventType: StatusEventType): void {
    this.lastEvent = eventType;
    this.lastSessionLabel = session.label;
  }

  public refresh(snapshot: SettingsSnapshot, activeSessions: TrackedSession[]): void {
    if (!snapshot.enableStatusBar) {
      this.item.hide();
      return;
    }

    const activeCount = activeSessions.length;
    const icon = this.muted ? '$(mute)' : activeCount > 0 ? '$(radio-tower)' : '$(bell)';
    const tail = this.lastEvent && this.lastSessionLabel ? ` ${this.lastEvent} ${truncate(this.lastSessionLabel, 24)}` : activeCount > 0 ? ` watching ${activeCount}` : ' idle';
    this.item.text = `${icon} MeME${tail}`;
    this.item.tooltip = [
      `Muted: ${this.muted ? 'yes' : 'no'}`,
      `Active sessions: ${activeCount}`,
      this.lastEvent ? `Last event: ${this.lastEvent}${this.lastSessionLabel ? ` in ${this.lastSessionLabel}` : ''}` : 'Last event: none'
    ].join('\n');
    this.item.color = themeColorForEvent(this.lastEvent, this.muted);
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }
}

function themeColorForEvent(eventType: StatusEventType | undefined, muted: boolean): vscode.ThemeColor | undefined {
  if (muted) {
    return new vscode.ThemeColor('disabledForeground');
  }

  if (eventType === 'failed' || eventType === 'error') {
    return new vscode.ThemeColor('statusBarItem.errorForeground');
  }

  if (eventType === 'warning') {
    return new vscode.ThemeColor('statusBarItem.warningForeground');
  }

  return undefined;
}
