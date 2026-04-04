import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { shouldIgnoreSession } from '../src/core/sessionFilter';

describe('shouldIgnoreSession', () => {
  it('ignores OpenCode chat sessions', () => {
    assert.equal(
      shouldIgnoreSession({
        label: 'OpenCode Chat',
        commandLine: 'opencode chat',
        tool: 'opencode',
        metadata: {
          terminalName: 'OpenCode Chat'
        }
      }),
      true
    );
  });

  it('keeps normal build sessions enabled', () => {
    assert.equal(
      shouldIgnoreSession({
        label: 'cargo build',
        commandLine: 'cargo build',
        tool: 'cargo',
        metadata: {
          terminalName: 'build'
        }
      }),
      false
    );
  });
});
