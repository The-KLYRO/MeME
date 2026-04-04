export interface SessionFilterInput {
  label: string;
  commandLine?: string;
  tool?: string;
  metadata?: Record<string, string | undefined>;
}

const IGNORED_SESSION_MARKERS = ['opencode'] as const;

export function shouldIgnoreSession(input: SessionFilterInput): boolean {
  const haystack = [input.label, input.commandLine, input.tool, ...Object.values(input.metadata ?? {})]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  return IGNORED_SESSION_MARKERS.some((marker) => haystack.includes(marker));
}
