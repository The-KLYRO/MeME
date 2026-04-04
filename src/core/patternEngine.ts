import {
  CLASSIFICATION_EVENT_PRIORITY,
  DEFAULT_RULE_PRIORITY,
  type ClassificationResult,
  type CustomRuleConfig,
  type IngestedLine,
  type NormalizedRule,
  type PatternRuleDefinition,
  type RuleEventType,
  type SettingsSnapshot
} from './types';
import type { PresetRegistry } from './presets';
import { BUILTIN_PRESETS } from './presets';

export interface PatternEngineIssueSink {
  warn(message: string): void;
}

export class PatternEngine {
  private rules: NormalizedRule[] = [];

  public constructor(private readonly presets: PresetRegistry, private readonly issueSink?: PatternEngineIssueSink) {}

  public reload(snapshot: SettingsSnapshot): void {
    const builtInRules = this.presets.getRules(snapshot).map((rule) => normalizeRule(rule, findPresetId(rule.id), this.issueSink));
    const customRules = snapshot.customRules.map((rule) => normalizeCustomRule(rule, this.issueSink));

    this.rules = [...builtInRules, ...customRules]
      .filter((rule): rule is NormalizedRule => rule !== undefined && rule.enabled)
      .sort((left, right) => {
        const eventDelta = CLASSIFICATION_EVENT_PRIORITY[right.eventType] - CLASSIFICATION_EVENT_PRIORITY[left.eventType];
        if (eventDelta !== 0) {
          return eventDelta;
        }

        const priorityDelta = right.priority - left.priority;
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return left.sortIndex - right.sortIndex;
      });
  }

  public classify(input: IngestedLine): ClassificationResult {
    for (const rule of this.rules) {
      if (!matchesSource(rule, input.session.sourceType)) {
        continue;
      }

      if (!matchesAppliesTo(rule, input.session.searchText)) {
        continue;
      }

      if (rule.compiledExcludeRegex?.test(input.line)) {
        continue;
      }

      const matched = rule.matcher === 'regex' ? Boolean(rule.compiledRegex?.test(input.line)) : contains(input.line, rule.contains ?? '', rule.caseSensitive);

      if (!matched) {
        continue;
      }

      return {
        eventType: rule.eventType,
        matchedRule: rule,
        session: input.session,
        line: input.line,
        timestamp: input.timestamp
      };
    }

    return {
      eventType: 'none',
      session: input.session,
      line: input.line,
      timestamp: input.timestamp
    };
  }

  public getRules(): readonly NormalizedRule[] {
    return this.rules;
  }
}

function normalizeRule(rule: PatternRuleDefinition, presetId: string, issueSink?: PatternEngineIssueSink): NormalizedRule | undefined {
  return compileRule(
    {
      id: rule.id,
      enabled: rule.enabled ?? true,
      appliesTo: rule.appliesTo ?? [],
      sourceType: rule.sourceType,
      regex: rule.regex,
      contains: rule.contains,
      excludeRegex: rule.excludeRegex,
      eventType: rule.eventType,
      priority: rule.priority ?? DEFAULT_RULE_PRIORITY,
      cooldownMs: rule.cooldownMs,
      caseSensitive: rule.caseSensitive ?? false
    },
    presetId,
    issueSink
  );
}

function normalizeCustomRule(rule: CustomRuleConfig, issueSink?: PatternEngineIssueSink): NormalizedRule | undefined {
  return compileRule(rule, 'custom', issueSink);
}

function compileRule(rule: CustomRuleConfig, presetId: string, issueSink?: PatternEngineIssueSink): NormalizedRule | undefined {
  try {
    const flags = rule.caseSensitive ? '' : 'i';
    const matcher = rule.regex ? 'regex' : 'contains';

    return {
      ...rule,
      presetId,
      matcher,
      compiledRegex: rule.regex ? new RegExp(rule.regex, flags) : undefined,
      compiledExcludeRegex: rule.excludeRegex ? new RegExp(rule.excludeRegex, flags) : undefined,
      sortIndex: nextSortIndex++
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issueSink?.warn(`Rule '${rule.id}' failed to compile and was skipped: ${message}`);
    return undefined;
  }
}

function matchesSource(rule: NormalizedRule, sourceType: string): boolean {
  return !rule.sourceType || rule.sourceType === sourceType;
}

function matchesAppliesTo(rule: NormalizedRule, searchText: string): boolean {
  if (rule.appliesTo.length === 0) {
    return true;
  }

  const haystack = rule.caseSensitive ? searchText : searchText.toLowerCase();
  return rule.appliesTo.some((needle) => contains(haystack, needle, rule.caseSensitive));
}

function contains(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (caseSensitive) {
    return haystack.includes(needle);
  }

  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function findPresetId(ruleId: string): string {
  const preset = BUILTIN_PRESETS.find((candidate) => ruleId.startsWith(`${candidate.id}.`));
  return preset?.id ?? 'generic';
}

let nextSortIndex = 0;

export function compareEventPriority(left: RuleEventType, right: RuleEventType): number {
  return CLASSIFICATION_EVENT_PRIORITY[right] - CLASSIFICATION_EVENT_PRIORITY[left];
}
