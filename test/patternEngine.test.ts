import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { PatternEngine } from '../src/core/patternEngine';
import { PresetRegistry } from '../src/core/presets';
import type { IngestedLine, SettingsSnapshot } from '../src/core/types';

function createSettings(): SettingsSnapshot {
  return {
    enabled: true,
    masterVolume: 80,
    cooldownMs: 500,
    maxSimultaneousSounds: 2,
    enableStatusBar: true,
    enableDiagnosticsSignal: true,
    enableTaskMonitoring: true,
    enableDebugMonitoring: true,
    enableTerminalMonitoring: true,
    sounds: {
      started: ['started.wav'],
      success: ['success.wav'],
      warning: ['warning.wav'],
      error: ['error.wav'],
      failed: ['failed.wav'],
      finished: ['finished.wav']
    },
    presets: {
      rust: true,
      python: true,
      javascript: true,
      typescript: true,
      go: true,
      java: true,
      cpp: true,
      csharp: true
    },
    customRules: [],
    issues: []
  };
}

function line(text: string, searchText = 'cargo build rust'): IngestedLine {
  return {
    session: {
      sessionId: 'terminal-1',
      sourceType: 'terminal',
      label: 'cargo build',
      commandLine: 'cargo build',
      tool: 'cargo',
      searchText,
      tags: ['cargo', 'rust'],
      reliableLiveCapture: true,
      metadata: {}
    },
    line: text,
    rawLine: text,
    timestamp: 1
  };
}

describe('PatternEngine', () => {
  it('prefers failed over success when both match', () => {
    const settings = createSettings();
    settings.customRules = [
      {
        id: 'custom-success',
        enabled: true,
        appliesTo: [],
        contains: 'done',
        eventType: 'success',
        priority: 999,
        caseSensitive: false
      },
      {
        id: 'custom-failed',
        enabled: true,
        appliesTo: [],
        regex: 'failed',
        eventType: 'failed',
        priority: 999,
        caseSensitive: false
      }
    ];

    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(settings);

    const result = engine.classify(line('build done but failed'));
    assert.equal(result.eventType, 'failed');
    assert.equal(result.matchedRule?.id, 'custom-failed');
  });

  it('matches rust preset lines', () => {
    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(createSettings());

    const result = engine.classify(line('Finished dev [unoptimized + debuginfo] target(s) in 0.44s'));
    assert.equal(result.eventType, 'success');
    assert.equal(result.matchedRule?.presetId, 'rust');
  });

  it('filters rules by appliesTo', () => {
    const settings = createSettings();
    settings.customRules = [
      {
        id: 'python-only',
        enabled: true,
        appliesTo: ['pytest'],
        contains: 'boom',
        eventType: 'error',
        priority: 200,
        caseSensitive: false
      }
    ];

    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(settings);

    const rustResult = engine.classify(line('boom', 'cargo test rust'));
    assert.equal(rustResult.eventType, 'none');

    const pythonResult = engine.classify(line('boom', 'pytest python'));
    assert.equal(pythonResult.eventType, 'error');
    assert.equal(pythonResult.matchedRule?.id, 'python-only');
  });

  it('keeps specific preset matches above generic fallback', () => {
    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(createSettings());

    const result = engine.classify(line('error: could not compile `demo` due to previous error(s)'));
    assert.equal(result.eventType, 'failed');
    assert.equal(result.matchedRule?.id, 'rust.failed.compile');
  });
});
