import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { DebounceAndCooldown } from '../src/core/cooldown';

describe('DebounceAndCooldown', () => {
  it('blocks repeated events in the same session', () => {
    const cooldown = new DebounceAndCooldown(1000);

    const first = cooldown.shouldAllow({ sessionId: 'a', eventType: 'error', now: 1000 });
    const second = cooldown.shouldAllow({ sessionId: 'a', eventType: 'error', now: 1200 });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, false);
    assert.equal(second.reason, 'sessionCooldown');
  });

  it('blocks the same event globally across sessions during cooldown', () => {
    const cooldown = new DebounceAndCooldown(1000);

    cooldown.shouldAllow({ sessionId: 'a', eventType: 'warning', now: 1000 });
    const result = cooldown.shouldAllow({ sessionId: 'b', eventType: 'warning', now: 1300 });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'eventCooldown');
  });

  it('allows different event types immediately', () => {
    const cooldown = new DebounceAndCooldown(1000);

    cooldown.shouldAllow({ sessionId: 'a', eventType: 'warning', now: 1000 });
    const result = cooldown.shouldAllow({ sessionId: 'a', eventType: 'error', now: 1001 });

    assert.equal(result.allowed, true);
  });
});
