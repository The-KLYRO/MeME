const ANSI_PATTERN = new RegExp(
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|(?:[A-Za-z0-9]*(?:;[A-Za-z0-9]*)*)?\\u0007)',
  'g'
);

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function toTerminalChunk(input: string): string {
  return normalizeNewlines(input).replace(/\n/g, '\r\n');
}

export function truncate(input: string, length = 160): string {
  if (input.length <= length) {
    return input;
  }

  return `${input.slice(0, Math.max(0, length - 3))}...`;
}
