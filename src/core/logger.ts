import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;

  public constructor(name = 'MeME') {
    this.channel = vscode.window.createOutputChannel(name);
  }

  public info(message: string): void {
    this.append('INFO', message);
  }

  public warn(message: string): void {
    this.append('WARN', message);
  }

  public error(message: string): void {
    this.append('ERROR', message);
  }

  public debug(message: string): void {
    this.append('DEBUG', message);
  }

  public show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }

  public dispose(): void {
    this.channel.dispose();
  }

  private append(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}
