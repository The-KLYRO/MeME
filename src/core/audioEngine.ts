import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import { pathToFileURL } from 'node:url';
import type { Logger } from './logger';
import { SOUND_EVENT_TYPES, type SettingsSnapshot, type SoundEventType } from './types';

interface PlaybackResult {
  played: boolean;
  reason?: string;
  soundPath?: string;
}

interface CommandInvocation {
  command: string;
  args: string[];
}

export class AudioEngine {
  private sounds = createSoundRegistry();
  private muted = false;
  private volume = 0.8;
  private maxSimultaneousSounds = 2;
  private readonly activeChildren = new Set<cp.ChildProcess>();

  public constructor(private readonly logger: Logger) {}

  public async applySettings(snapshot: SettingsSnapshot): Promise<void> {
    this.sounds = { ...snapshot.sounds };
    this.volume = Math.min(1, Math.max(0, snapshot.masterVolume / 100));
    this.maxSimultaneousSounds = snapshot.maxSimultaneousSounds;
    this.preload();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public async play(eventType: SoundEventType): Promise<PlaybackResult> {
    const soundPaths = this.sounds[eventType].filter((candidate) => fs.existsSync(candidate));
    const soundPath = pickRandomSoundPath(soundPaths);
    if (this.muted) {
      return { played: false, reason: 'muted', soundPath };
    }

    if (!soundPath) {
      return { played: false, reason: 'missingSound', soundPath };
    }

    if (this.activeChildren.size >= this.maxSimultaneousSounds) {
      return { played: false, reason: 'maxSimultaneousSounds', soundPath };
    }

    const invocations = buildInvocations(soundPath, this.volume);
    return this.spawnFirstAvailable(invocations, soundPath);
  }

  private preload(): void {
    for (const [eventType, soundPaths] of Object.entries(this.sounds)) {
      if (soundPaths.length === 0) {
        this.logger.warn(`audio preload skipped event=${eventType} path=''`);
        continue;
      }

      for (const soundPath of soundPaths) {
        if (!fs.existsSync(soundPath)) {
          this.logger.warn(`audio preload skipped event=${eventType} path='${soundPath}'`);
          continue;
        }

        this.logger.debug(`audio preloaded event=${eventType} path='${soundPath}'`);
      }
    }
  }

  private spawnFirstAvailable(invocations: CommandInvocation[], soundPath: string, index = 0): Promise<PlaybackResult> {
    const invocation = invocations[index];
    if (!invocation) {
      return Promise.resolve({ played: false, reason: `noAudioBackend:${os.platform()}`, soundPath });
    }

    return new Promise((resolve) => {
      const child = cp.spawn(invocation.command, invocation.args, {
        stdio: 'ignore',
        windowsHide: true
      });

      let settled = false;

      child.once('error', (error) => {
        if (settled) {
          return;
        }

        settled = true;
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          void this.spawnFirstAvailable(invocations, soundPath, index + 1).then(resolve);
          return;
        }

        resolve({ played: false, reason: `audioError:${code ?? 'unknown'}`, soundPath });
      });

      child.once('spawn', () => {
        if (settled) {
          return;
        }

        settled = true;
        this.activeChildren.add(child);
        child.unref();
        resolve({ played: true, soundPath });
      });

      child.once('close', () => {
        this.activeChildren.delete(child);
      });
    });
  }
}

function createSoundRegistry(): Record<SoundEventType, string[]> {
  const sounds = {} as Record<SoundEventType, string[]>;
  for (const eventType of SOUND_EVENT_TYPES) {
    sounds[eventType] = [];
  }

  return sounds;
}

function buildInvocations(soundPath: string, volume: number): CommandInvocation[] {
  switch (os.platform()) {
    case 'win32':
      return [buildWindowsInvocation(soundPath, volume)];
    case 'darwin':
      return [
        {
          command: 'afplay',
          args: ['-v', volume.toFixed(2), soundPath]
        }
      ];
    default: {
      const extension = path.extname(soundPath).toLowerCase();
      const linuxInvocations: CommandInvocation[] = [
        {
          command: 'paplay',
          args: [soundPath]
        }
      ];

      if (extension === '.wav') {
        linuxInvocations.push({ command: 'aplay', args: [soundPath] });
      }

      linuxInvocations.push({ command: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet', soundPath] });
      if (extension === '.mp3') {
        linuxInvocations.push({ command: 'mpg123', args: [soundPath] });
      }
      return linuxInvocations;
    }
  }
}

function buildWindowsInvocation(soundPath: string, volume: number): CommandInvocation {
  const uri = pathToFileURL(soundPath).toString();
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    'Add-Type -AssemblyName presentationCore',
    `$uri = [System.Uri]::new('${escapeForPowerShell(uri)}')`,
    '$player = New-Object System.Windows.Media.MediaPlayer',
    `$player.Volume = ${volume.toFixed(2)}`,
    '$wait = New-Object System.Threading.AutoResetEvent($false)',
    '$handler = [System.EventHandler]{ param($sender, $eventArgs) $wait.Set() | Out-Null }',
    '$player.MediaEnded += $handler',
    '$player.MediaFailed += $handler',
    '$player.Open($uri)',
    'Start-Sleep -Milliseconds 25',
    '$player.Play()',
    '$wait.WaitOne(12000) | Out-Null',
    '$player.Stop()',
    '$player.Close()'
  ].join('; ');

  return {
    command: 'powershell.exe',
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encodePowerShell(script)]
  };
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function escapeForPowerShell(input: string): string {
  return input.replace(/'/g, "''");
}

function pickRandomSoundPath(soundPaths: readonly string[]): string | undefined {
  if (soundPaths.length === 0) {
    return undefined;
  }

  const index = Math.floor(Math.random() * soundPaths.length);
  return soundPaths[index];
}

export type { PlaybackResult };
