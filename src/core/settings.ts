import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_RULE_PRIORITY,
  type CustomRuleConfig,
  type SoundEventType,
  SOUND_EVENT_TYPES,
  type PresetToggleKey,
  type SettingsSnapshot,
  type SourceType
} from './types';

export interface ConfigReader {
  get<T>(section: string, defaultValue?: T): T;
}

export interface SettingsRegistryOptions {
  extensionPath: string;
  getConfig: () => ConfigReader;
  getWorkspaceFolders: () => string[];
  onIssue?: (message: string) => void;
}

const PRESET_KEYS: readonly PresetToggleKey[] = [
  'rust',
  'python',
  'javascript',
  'typescript',
  'go',
  'java',
  'cpp',
  'csharp'
];

const SOUND_EVENTS: readonly SoundEventType[] = SOUND_EVENT_TYPES;

export class SettingsRegistry {
  private snapshot: SettingsSnapshot;

  public constructor(private readonly options: SettingsRegistryOptions) {
    this.snapshot = this.reload();
  }

  public reload(): SettingsSnapshot {
    const config = this.options.getConfig();
    const workspaceFolders = this.options.getWorkspaceFolders();
    const issues: string[] = [];
    const onIssue = (message: string): void => {
      issues.push(message);
      this.options.onIssue?.(message);
    };
    const bundledSounds = loadBundledSounds(this.options.extensionPath, onIssue);

    const sounds = createSoundRegistry((eventType) => {
      const configured = config.get<string>(`sound.${eventType}`, '').trim();
      return resolveSoundPath({
        bundled: bundledSounds[eventType],
        configured,
        eventType,
        extensionPath: this.options.extensionPath,
        workspaceFolders,
        onIssue
      });
    });

    const presets = Object.fromEntries(
      PRESET_KEYS.map((presetKey) => [presetKey, config.get<boolean>(`presets.${presetKey}`, true)])
    ) as Record<PresetToggleKey, boolean>;

    const customRules = validateCustomRules(config.get<unknown[]>('customRules', []), onIssue);

    this.snapshot = {
      enabled: config.get<boolean>('enabled', true),
      masterVolume: clampNumber(config.get<number>('masterVolume', 80), 0, 100, 80),
      cooldownMs: clampNumber(config.get<number>('cooldownMs', 900), 0, 60_000, 900),
      maxSimultaneousSounds: clampNumber(config.get<number>('maxSimultaneousSounds', 2), 1, 8, 2),
      enableStatusBar: config.get<boolean>('enableStatusBar', true),
      enableDiagnosticsSignal: config.get<boolean>('enableDiagnosticsSignal', true),
      enableTaskMonitoring: config.get<boolean>('enableTaskMonitoring', true),
      enableDebugMonitoring: config.get<boolean>('enableDebugMonitoring', true),
      enableTerminalMonitoring: config.get<boolean>('enableTerminalMonitoring', true),
      sounds,
      presets,
      customRules,
      issues
    };

    return this.snapshot;
  }

  public getSnapshot(): SettingsSnapshot {
    return this.snapshot;
  }
}

export function validateCustomRules(rawRules: unknown[], onIssue?: (message: string) => void): CustomRuleConfig[] {
  const normalized: CustomRuleConfig[] = [];

  rawRules.forEach((rawRule, index) => {
    if (!isObject(rawRule)) {
      onIssue?.(`customRules[${index}] ignored because it is not an object.`);
      return;
    }

    const id = typeof rawRule.id === 'string' && rawRule.id.trim().length > 0 ? rawRule.id.trim() : `custom-${index + 1}`;
    const enabled = rawRule.enabled === undefined ? true : Boolean(rawRule.enabled);
    const appliesTo = Array.isArray(rawRule.appliesTo)
      ? rawRule.appliesTo.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
      : [];
    const sourceType = parseSourceType(rawRule.sourceType, id, onIssue);
    const regex = typeof rawRule.regex === 'string' && rawRule.regex.trim().length > 0 ? rawRule.regex.trim() : undefined;
    const contains = typeof rawRule.contains === 'string' && rawRule.contains.trim().length > 0 ? rawRule.contains.trim() : undefined;
    const excludeRegex =
      typeof rawRule.excludeRegex === 'string' && rawRule.excludeRegex.trim().length > 0
        ? rawRule.excludeRegex.trim()
        : undefined;
    const eventType = parseEventType(rawRule.eventType, id, onIssue);
    const priority = Number.isFinite(rawRule.priority) ? Number(rawRule.priority) : DEFAULT_RULE_PRIORITY;
    const cooldownMs = Number.isFinite(rawRule.cooldownMs) ? clampNumber(Number(rawRule.cooldownMs), 0, 60_000, 0) : undefined;
    const caseSensitive = rawRule.caseSensitive === undefined ? false : Boolean(rawRule.caseSensitive);

    if (!eventType) {
      return;
    }

    if (!regex && !contains) {
      onIssue?.(`Custom rule '${id}' ignored because it must define either regex or contains.`);
      return;
    }

    if (regex && !isValidRegex(regex, caseSensitive)) {
      onIssue?.(`Custom rule '${id}' ignored because regex is invalid.`);
      return;
    }

    if (excludeRegex && !isValidRegex(excludeRegex, caseSensitive)) {
      onIssue?.(`Custom rule '${id}' ignored because excludeRegex is invalid.`);
      return;
    }

    normalized.push({
      id,
      enabled,
      appliesTo,
      sourceType,
      regex,
      contains,
      excludeRegex,
      eventType,
      priority,
      cooldownMs,
      caseSensitive
    });
  });

  return normalized;
}

export function isValidRegex(pattern: string, caseSensitive: boolean): boolean {
  try {
    const flags = caseSensitive ? '' : 'i';
    void new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

function resolveSoundPath(options: {
  bundled: string[];
  configured: string;
  eventType: SoundEventType;
  extensionPath: string;
  workspaceFolders: string[];
  onIssue: (message: string) => void;
}): string[] {
  if (options.configured.length === 0) {
    return options.bundled;
  }

  const target = resolveUserPath(options.configured, options.workspaceFolders, options.extensionPath);
  const ext = path.extname(target).toLowerCase();

  if (ext !== '.wav' && ext !== '.mp3') {
    options.onIssue(`Sound for '${options.eventType}' must be a .wav or .mp3 file. Falling back to bundled sound.`);
    return options.bundled;
  }

  if (!fs.existsSync(target)) {
    options.onIssue(`Sound for '${options.eventType}' was not found at '${target}'. Falling back to bundled sound.`);
    return options.bundled;
  }

  return [target];
}

function loadBundledSounds(
  extensionPath: string,
  onIssue: (message: string) => void
): Record<SoundEventType, string[]> {
  const registryPath = path.join(extensionPath, 'media', 'sounds', 'categories.json');
  const emptyRegistry = createSoundRegistry(() => []);

  if (!fs.existsSync(registryPath)) {
    onIssue(`Bundled sound registry was not found at '${registryPath}'.`);
    return emptyRegistry;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    onIssue(`Bundled sound registry could not be parsed at '${registryPath}'.`);
    return emptyRegistry;
  }

  if (!isObject(parsed)) {
    onIssue(`Bundled sound registry must be a JSON object at '${registryPath}'.`);
    return emptyRegistry;
  }

  return createSoundRegistry((eventType) => {
    const rawEntries = parsed[eventType];
    if (!Array.isArray(rawEntries)) {
      onIssue(`Bundled sound registry entry '${eventType}' must be an array.`);
      return [];
    }

    const fileNames = rawEntries.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
    const resolved = fileNames
      .map((fileName) => path.join(extensionPath, 'media', 'sounds', fileName))
      .filter((candidate) => fs.existsSync(candidate));

    if (resolved.length === 0) {
      onIssue(`No bundled sounds were found for '${eventType}'.`);
    }

    return resolved;
  });
}

function createSoundRegistry(factory: (eventType: SoundEventType) => string[]): Record<SoundEventType, string[]> {
  const sounds = {} as Record<SoundEventType, string[]>;
  for (const eventType of SOUND_EVENTS) {
    sounds[eventType] = factory(eventType);
  }

  return sounds;
}

function resolveUserPath(rawPath: string, workspaceFolders: string[], extensionPath: string): string {
  const expandedTilde = rawPath.startsWith('~') ? path.join(os.homedir(), rawPath.slice(1)) : rawPath;
  const workspaceRoot = workspaceFolders[0];
  const withWorkspace = workspaceRoot ? expandedTilde.replace(/\$\{workspaceFolder\}/g, workspaceRoot) : expandedTilde;

  if (path.isAbsolute(withWorkspace)) {
    return path.normalize(withWorkspace);
  }

  const basePath = workspaceRoot ?? extensionPath;
  return path.resolve(basePath, withWorkspace);
}

function parseEventType(value: unknown, id: string, onIssue?: (message: string) => void): CustomRuleConfig['eventType'] | undefined {
  if (value === 'success' || value === 'warning' || value === 'error' || value === 'failed' || value === 'info') {
    return value;
  }

  onIssue?.(`Custom rule '${id}' ignored because eventType is invalid.`);
  return undefined;
}

function parseSourceType(value: unknown, id: string, onIssue?: (message: string) => void): SourceType | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'terminal' || value === 'task' || value === 'debug') {
    return value;
  }

  onIssue?.(`Custom rule '${id}' ignored because sourceType is invalid.`);
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
