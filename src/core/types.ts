export type SourceType = 'terminal' | 'task' | 'debug';

export type ClassifiedEventType = 'success' | 'warning' | 'error' | 'failed' | 'info' | 'none';

export type PlaybackEventType = 'started' | 'success' | 'warning' | 'error' | 'failed' | 'finished';

export type RuleEventType = Exclude<ClassifiedEventType, 'none'>;

export type PresetToggleKey =
  | 'rust'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp';

export const DEFAULT_RULE_PRIORITY = 100;

export const CLASSIFICATION_EVENT_PRIORITY: Readonly<Record<ClassifiedEventType, number>> = {
  failed: 500,
  error: 400,
  warning: 300,
  success: 200,
  info: 100,
  none: 0
};

export const PLAYABLE_EVENT_TYPES: readonly PlaybackEventType[] = [
  'started',
  'success',
  'warning',
  'error',
  'failed',
  'finished'
];

export interface PatternRuleDefinition {
  id: string;
  enabled?: boolean;
  appliesTo?: string[];
  sourceType?: SourceType;
  regex?: string;
  contains?: string;
  excludeRegex?: string;
  eventType: RuleEventType;
  priority?: number;
  cooldownMs?: number;
  caseSensitive?: boolean;
}

export interface CustomRuleConfig extends PatternRuleDefinition {
  enabled: boolean;
  appliesTo: string[];
  priority: number;
  caseSensitive: boolean;
}

export interface NormalizedRule extends CustomRuleConfig {
  presetId: string;
  matcher: 'regex' | 'contains';
  compiledRegex?: RegExp;
  compiledExcludeRegex?: RegExp;
  sortIndex: number;
}

export interface PresetDefinition {
  id: string;
  label: string;
  settingKey?: PresetToggleKey;
  appliesTo?: string[];
  rules: PatternRuleDefinition[];
}

export interface SettingsSnapshot {
  enabled: boolean;
  masterVolume: number;
  cooldownMs: number;
  maxSimultaneousSounds: number;
  enableStatusBar: boolean;
  enableDiagnosticsSignal: boolean;
  enableTaskMonitoring: boolean;
  enableDebugMonitoring: boolean;
  enableTerminalMonitoring: boolean;
  sounds: Record<PlaybackEventType, string[]>;
  presets: Record<PresetToggleKey, boolean>;
  customRules: CustomRuleConfig[];
  issues: string[];
}

export interface SessionContext {
  sessionId: string;
  sourceType: SourceType;
  label: string;
  commandLine?: string;
  tool?: string;
  searchText: string;
  tags: string[];
  reliableLiveCapture: boolean;
  metadata: Record<string, string | undefined>;
}

export interface TrackedSession extends SessionContext {
  active: boolean;
  createdAt: number;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  failureDetected: boolean;
  lastEventType?: PlaybackEventType | RuleEventType;
  lastRuleId?: string;
}

export interface IngestedLine {
  session: SessionContext;
  line: string;
  rawLine: string;
  timestamp: number;
}

export interface ClassificationResult {
  eventType: ClassifiedEventType;
  matchedRule?: NormalizedRule;
  session: SessionContext;
  line: string;
  timestamp: number;
}

export interface CooldownDecision {
  allowed: boolean;
  reason?: 'sessionCooldown' | 'eventCooldown';
  collapseCount: number;
}
