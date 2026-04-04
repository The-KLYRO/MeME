import { type CooldownDecision, type RuleEventType } from './types';

interface CooldownRecord {
  at: number;
  collapseCount: number;
}

export class DebounceAndCooldown {
  private readonly perSessionEvent = new Map<string, CooldownRecord>();
  private readonly perEvent = new Map<RuleEventType, CooldownRecord>();
  private defaultCooldownMs: number;

  public constructor(defaultCooldownMs: number) {
    this.defaultCooldownMs = defaultCooldownMs;
  }

  public setDefaultCooldown(cooldownMs: number): void {
    this.defaultCooldownMs = cooldownMs;
  }

  public shouldAllow(input: {
    sessionId: string;
    eventType: RuleEventType;
    cooldownMs?: number;
    now?: number;
  }): CooldownDecision {
    const cooldownMs = input.cooldownMs ?? this.defaultCooldownMs;
    const now = input.now ?? Date.now();
    const sessionKey = `${input.sessionId}:${input.eventType}`;
    const sessionRecord = this.perSessionEvent.get(sessionKey);

    if (sessionRecord && now - sessionRecord.at < cooldownMs) {
      sessionRecord.collapseCount += 1;
      return {
        allowed: false,
        reason: 'sessionCooldown',
        collapseCount: sessionRecord.collapseCount
      };
    }

    const eventRecord = this.perEvent.get(input.eventType);
    if (eventRecord && now - eventRecord.at < cooldownMs) {
      eventRecord.collapseCount += 1;
      this.perSessionEvent.set(sessionKey, { at: now, collapseCount: 0 });
      return {
        allowed: false,
        reason: 'eventCooldown',
        collapseCount: eventRecord.collapseCount
      };
    }

    const collapsedFromSession = sessionRecord?.collapseCount ?? 0;
    const collapsedFromEvent = eventRecord?.collapseCount ?? 0;
    this.perSessionEvent.set(sessionKey, { at: now, collapseCount: 0 });
    this.perEvent.set(input.eventType, { at: now, collapseCount: 0 });
    return {
      allowed: true,
      collapseCount: Math.max(collapsedFromSession, collapsedFromEvent)
    };
  }

  public resetSession(sessionId: string): void {
    for (const key of this.perSessionEvent.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.perSessionEvent.delete(key);
      }
    }
  }
}
