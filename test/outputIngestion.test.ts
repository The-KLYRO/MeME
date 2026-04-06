import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { OutputIngestion } from '../src/core/outputIngestion';
import { PatternEngine } from '../src/core/patternEngine';
import { PresetRegistry } from '../src/core/presets';
import { SOUND_EVENT_TYPES, type ClassificationResult, type SessionContext, type SettingsSnapshot } from '../src/core/types';

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

function createWatchSession(): SessionContext {
  return {
    sessionId: 'terminal-watch-1',
    sourceType: 'terminal',
    label: 'vite watch',
    commandLine: 'vite build --watch',
    tool: 'vite',
    searchText: 'vite build --watch vite javascript typescript',
    tags: ['vite', 'watch', 'javascript', 'typescript'],
    reliableLiveCapture: true,
    metadata: {
      terminalName: 'watch'
    }
  };
}

describe('OutputIngestion', () => {
  it('classifies warning and error lines from a long-running watch session before flush', () => {
    const engine = new PatternEngine(new PresetRegistry());
    engine.reload(createSettings());

    const ingestion = new OutputIngestion();
    const classifications: ClassificationResult[] = [];
    const session = createWatchSession();

    ingestion.onLine((line) => {
      const classification = engine.classify(line);
      if (classification.eventType !== 'none') {
        classifications.push(classification);
      }
    });

    ingestion.pushChunk(session, 'webpack compiled with warnings\n');
    ingestion.pushChunk(session, 'ERROR');

    assert.deepEqual(
      classifications.map((classification) => classification.eventType),
      ['warning']
    );

    ingestion.pushChunk(session, ' in src/app.ts\n');

    assert.deepEqual(
      classifications.map((classification) => ({
        eventType: classification.eventType,
        ruleId: classification.matchedRule?.id
      })),
      [
        { eventType: 'warning', ruleId: 'javascript.warning.webpack' },
        { eventType: 'error', ruleId: 'javascript.error.webpack' }
      ]
    );
  });
});
