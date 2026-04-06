import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { PatternEngine } from '../src/core/patternEngine';
import { PresetRegistry } from '../src/core/presets';
import { SOUND_EVENT_TYPES, type IngestedLine, type SettingsSnapshot } from '../src/core/types';

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
    sounds: Object.fromEntries(SOUND_EVENT_TYPES.map((eventType) => [eventType, [`${eventType}.wav`]])) as SettingsSnapshot['sounds'],
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

  it('classifies npm lifecycle failures as javascript workflow failures', () => {
    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(createSettings());

    const result = engine.classify(line('npm ERR! Missing script: "build"', 'npm run build javascript'));
    assert.equal(result.eventType, 'failed');
    assert.equal(result.matchedRule?.id, 'javascript.failed.npm-script');
  });

  it('classifies npm install completion as success', () => {
    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(createSettings());

    const result = engine.classify(line('added 15 packages, and audited 15 packages in 2s', 'npm install javascript'));
    assert.equal(result.eventType, 'success');
    assert.equal(result.matchedRule?.id, 'javascript.success.npm-install');
  });

  it('classifies lowercase npm warnings and errors from newer npm output', () => {
    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(createSettings());

    const warningResult = engine.classify(line('npm warn deprecated left-pad@1.3.0: use String.prototype.padStart()', 'npm install javascript'));
    assert.equal(warningResult.eventType, 'warning');
    assert.equal(warningResult.matchedRule?.id, 'javascript.warning.npm');

    const errorResult = engine.classify(line('npm error code E404', 'npm install javascript'));
    assert.equal(errorResult.eventType, 'failed');
    assert.equal(errorResult.matchedRule?.id, 'javascript.failed.npm-usage');
  });
});
