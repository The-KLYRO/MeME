import { type PlaybackEventType, type RuleEventType, type SessionContext, type SourceType, type TrackedSession } from './types';

export interface SessionSeed {
  sourceType: SourceType;
  label: string;
  commandLine?: string;
  tool?: string;
  reliableLiveCapture?: boolean;
  metadata?: Record<string, string | undefined>;
}

export class SessionTracker {
  private counter = 0;
  private readonly sessions = new Map<string, TrackedSession>();
  private readonly objectIndex = new WeakMap<object, string>();
  private readonly stringIndex = new Map<string, string>();

  public getOrCreateForObject(key: object, seed: SessionSeed): TrackedSession {
    const existing = this.objectIndex.get(key);
    if (existing) {
      return this.update(existing, seed);
    }

    const session = this.create(seed);
    this.objectIndex.set(key, session.sessionId);
    return session;
  }

  public getOrCreateForString(key: string, seed: SessionSeed): TrackedSession {
    const existing = this.stringIndex.get(key);
    if (existing) {
      return this.update(existing, seed);
    }

    const session = this.create(seed);
    this.stringIndex.set(key, session.sessionId);
    return session;
  }

  public get(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  public markEvent(sessionId: string, eventType: RuleEventType | PlaybackEventType, ruleId?: string): TrackedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.lastEventType = eventType;
    session.lastRuleId = ruleId;
    if (eventType === 'failed') {
      session.failureDetected = true;
    }
    return session;
  }

  public finish(sessionId: string, exitCode?: number): TrackedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.active = false;
    session.endedAt = Date.now();
    session.exitCode = exitCode;
    if (typeof exitCode === 'number' && exitCode !== 0) {
      session.failureDetected = true;
    }
    return session;
  }

  public getActiveSessions(): TrackedSession[] {
    return [...this.sessions.values()].filter((session) => session.active);
  }

  public all(): TrackedSession[] {
    return [...this.sessions.values()];
  }

  private create(seed: SessionSeed): TrackedSession {
    const sessionId = `${seed.sourceType}-${++this.counter}`;
    const session = buildSession(sessionId, seed);
    this.sessions.set(sessionId, session);
    return session;
  }

  private update(sessionId: string, seed: SessionSeed): TrackedSession {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return this.create(seed);
    }

    current.label = seed.label || current.label;
    current.commandLine = seed.commandLine ?? current.commandLine;
    current.tool = seed.tool ?? current.tool;
    current.reliableLiveCapture = seed.reliableLiveCapture ?? current.reliableLiveCapture;
    current.metadata = {
      ...current.metadata,
      ...seed.metadata
    };
    const derived = deriveSearch(current.label, current.commandLine, current.tool, current.metadata);
    current.tags = derived.tags;
    current.searchText = derived.searchText;
    return current;
  }
}

function buildSession(sessionId: string, seed: SessionSeed): TrackedSession {
  const derived = deriveSearch(seed.label, seed.commandLine, seed.tool, seed.metadata ?? {});
  return {
    sessionId,
    sourceType: seed.sourceType,
    label: seed.label,
    commandLine: seed.commandLine,
    tool: seed.tool,
    searchText: derived.searchText,
    tags: derived.tags,
    reliableLiveCapture: seed.reliableLiveCapture ?? false,
    metadata: seed.metadata ?? {},
    active: true,
    createdAt: Date.now(),
    startedAt: Date.now(),
    failureDetected: false
  };
}

function deriveSearch(
  label: string,
  commandLine: string | undefined,
  tool: string | undefined,
  metadata: Record<string, string | undefined>
): Pick<SessionContext, 'searchText' | 'tags'> {
  const parts = [label, commandLine, tool, ...Object.values(metadata)].filter((value): value is string => Boolean(value));
  const tags = new Set<string>();

  for (const part of parts) {
    for (const token of part.toLowerCase().split(/[^a-z0-9_+.#-]+/).filter(Boolean)) {
      tags.add(token);
    }
  }

  return {
    searchText: parts.join(' ').toLowerCase(),
    tags: [...tags]
  };
}
