import { type IngestedLine, type SessionContext } from './types';
import { normalizeNewlines, stripAnsi } from './text';

type LineListener = (line: IngestedLine) => void;

export class OutputIngestion {
  private readonly buffers = new Map<string, string>();
  private readonly listeners = new Set<LineListener>();

  public onLine(listener: LineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public pushChunk(session: SessionContext, chunk: string | Buffer, timestamp = Date.now()): void {
    const sanitized = stripAnsi(normalizeNewlines(String(chunk)).replace(/\u0000/g, ''));
    const combined = `${this.buffers.get(session.sessionId) ?? ''}${sanitized}`;
    const lines = combined.split('\n');
    const trailing = lines.pop() ?? '';
    this.buffers.set(session.sessionId, trailing);

    for (const line of lines) {
      this.emitLine({
        session,
        line,
        rawLine: line,
        timestamp
      });
    }
  }

  public flush(session: SessionContext, timestamp = Date.now()): void {
    const trailing = this.buffers.get(session.sessionId);
    if (trailing && trailing.length > 0) {
      this.emitLine({
        session,
        line: trailing,
        rawLine: trailing,
        timestamp
      });
    }

    this.buffers.delete(session.sessionId);
  }

  private emitLine(line: IngestedLine): void {
    for (const listener of this.listeners) {
      listener(line);
    }
  }
}
