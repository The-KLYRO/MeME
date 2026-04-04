import { DEFAULT_RULE_PRIORITY, type PatternRuleDefinition, type PresetDefinition, type SettingsSnapshot } from './types';

function rule(definition: PatternRuleDefinition): PatternRuleDefinition {
  return {
    priority: DEFAULT_RULE_PRIORITY,
    enabled: true,
    caseSensitive: false,
    ...definition
  };
}

export const BUILTIN_PRESETS: readonly PresetDefinition[] = [
  {
    id: 'rust',
    label: 'Rust',
    settingKey: 'rust',
    appliesTo: ['cargo', 'rustc', 'rust'],
    rules: [
      rule({ id: 'rust.failed.compile', regex: 'could not compile', eventType: 'failed', priority: 140 }),
      rule({ id: 'rust.failed.tests', regex: 'test result:\\s+FAILED', eventType: 'failed', priority: 150 }),
      rule({ id: 'rust.error.compiler', regex: '^error(\\[E[0-9]+\\])?:', eventType: 'error', priority: 140 }),
      rule({ id: 'rust.warning.compiler', regex: '^warning:', eventType: 'warning', priority: 140 }),
      rule({ id: 'rust.success.finish', regex: '^Finished .* target\\(s\\) in', eventType: 'success', priority: 130 }),
      rule({ id: 'rust.success.tests', regex: 'test result:\\s+ok', eventType: 'success', priority: 130 })
    ]
  },
  {
    id: 'python',
    label: 'Python',
    settingKey: 'python',
    appliesTo: ['python', 'pytest', 'py', 'tox', 'nox'],
    rules: [
      rule({ id: 'python.failed.pytest-failures', regex: '=+ FAILURES =+', eventType: 'failed', priority: 150 }),
      rule({ id: 'python.failed.summary', regex: '\\b([1-9][0-9]*) failed\\b', eventType: 'failed', priority: 145 }),
      rule({ id: 'python.error.traceback', contains: 'Traceback (most recent call last):', eventType: 'error', priority: 140 }),
      rule({ id: 'python.error.syntax', contains: 'SyntaxError:', eventType: 'error', priority: 140 }),
      rule({ id: 'python.error.pytest-line', regex: '^E\\s{2,}', eventType: 'error', priority: 120 }),
      rule({ id: 'python.warning.summary', contains: 'warnings summary', eventType: 'warning', priority: 120 }),
      rule({ id: 'python.success.pytest', regex: '\\b[0-9]+ passed\\b', eventType: 'success', priority: 130 }),
      rule({ id: 'python.success.ok', regex: '=+ [0-9]+ passed', eventType: 'success', priority: 120 })
    ]
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    settingKey: 'javascript',
    appliesTo: ['node', 'npm', 'pnpm', 'yarn', 'webpack', 'vite', 'jest', 'vitest', 'esbuild'],
    rules: [
      rule({ id: 'javascript.failed.compile', contains: 'Failed to compile', eventType: 'failed', priority: 150 }),
      rule({ id: 'javascript.failed.build', contains: 'Build failed', eventType: 'failed', priority: 145 }),
      rule({ id: 'javascript.failed.webpack', regex: 'webpack compiled with errors', eventType: 'failed', priority: 145 }),
      rule({ id: 'javascript.error.webpack', regex: 'ERROR in', eventType: 'error', priority: 130 }),
      rule({ id: 'javascript.warning.webpack', regex: 'webpack compiled with warnings', eventType: 'warning', priority: 130 }),
      rule({ id: 'javascript.warning.generic', regex: '\\bwarning\\b', eventType: 'warning', priority: 90 }),
      rule({ id: 'javascript.success.compile', contains: 'Compiled successfully', eventType: 'success', priority: 130 }),
      rule({ id: 'javascript.success.webpack', regex: 'webpack compiled successfully', eventType: 'success', priority: 125 }),
      rule({ id: 'javascript.info.vite', contains: 'vite v', eventType: 'info', priority: 90 })
    ]
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    settingKey: 'typescript',
    appliesTo: ['tsc', 'tsx', 'typescript', 'ts-node', 'vite', 'esbuild'],
    rules: [
      rule({ id: 'typescript.failed.compile', contains: 'Failed to compile', eventType: 'failed', priority: 150 }),
      rule({ id: 'typescript.error.compiler', regex: 'error TS[0-9]+:', eventType: 'error', priority: 150 }),
      rule({ id: 'typescript.warning.compiler', regex: '\\bwarning TS[0-9]+:', eventType: 'warning', priority: 135 }),
      rule({ id: 'typescript.success.compiled', contains: 'Compiled successfully', eventType: 'success', priority: 130 }),
      rule({ id: 'typescript.success.zero-errors', regex: 'Found 0 errors', eventType: 'success', priority: 125 }),
      rule({ id: 'typescript.failed.nonzero-errors', regex: 'Found [1-9][0-9]* errors?', eventType: 'failed', priority: 135 })
    ]
  },
  {
    id: 'go',
    label: 'Go',
    settingKey: 'go',
    appliesTo: ['go', 'golang'],
    rules: [
      rule({ id: 'go.failed.tests', regex: '^FAIL\\b', eventType: 'failed', priority: 150 }),
      rule({ id: 'go.error.panic', contains: 'panic:', eventType: 'error', priority: 140 }),
      rule({ id: 'go.failed.build', regex: 'build failed', eventType: 'failed', priority: 140 }),
      rule({ id: 'go.error.compiler', regex: '^[^:\\s]+:\\d+:\\d+:', eventType: 'error', priority: 130 }),
      rule({ id: 'go.success.tests', regex: '^PASS\\b', eventType: 'success', priority: 130 })
    ]
  },
  {
    id: 'java',
    label: 'Java',
    settingKey: 'java',
    appliesTo: ['javac', 'java', 'mvn', 'maven', 'gradle'],
    rules: [
      rule({ id: 'java.failed.maven', contains: 'BUILD FAILURE', eventType: 'failed', priority: 150 }),
      rule({ id: 'java.failed.gradle', contains: 'BUILD FAILED', eventType: 'failed', priority: 150 }),
      rule({ id: 'java.error.compiler', regex: '\\berror:', eventType: 'error', priority: 135 }),
      rule({ id: 'java.warning.compiler', regex: '\\bwarning:', eventType: 'warning', priority: 130 }),
      rule({ id: 'java.failed.tests', regex: 'Failures:\\s*[1-9][0-9]*', eventType: 'failed', priority: 135 }),
      rule({ id: 'java.success.maven', contains: 'BUILD SUCCESS', eventType: 'success', priority: 130 }),
      rule({ id: 'java.success.gradle', contains: 'BUILD SUCCESSFUL', eventType: 'success', priority: 130 })
    ]
  },
  {
    id: 'cpp',
    label: 'C/C++',
    settingKey: 'cpp',
    appliesTo: ['g++', 'gcc', 'clang', 'clang++', 'cl.exe', 'cmake', 'ninja', 'make'],
    rules: [
      rule({ id: 'cpp.failed.collect2', contains: 'collect2: error:', eventType: 'failed', priority: 150 }),
      rule({ id: 'cpp.error.gcc', regex: ':\\d+:\\d+: error:', eventType: 'error', priority: 140 }),
      rule({ id: 'cpp.warning.gcc', regex: ':\\d+:\\d+: warning:', eventType: 'warning', priority: 135 }),
      rule({ id: 'cpp.error.msvc', regex: '\\berror C[0-9]+:', eventType: 'error', priority: 140 }),
      rule({ id: 'cpp.warning.msvc', regex: '\\bwarning C[0-9]+:', eventType: 'warning', priority: 135 }),
      rule({ id: 'cpp.success.zero-issues', regex: '\\b0 warnings?, 0 errors\\b', eventType: 'success', priority: 110 })
    ]
  },
  {
    id: 'csharp',
    label: 'C#',
    settingKey: 'csharp',
    appliesTo: ['dotnet', 'msbuild', 'csc', 'vstest'],
    rules: [
      rule({ id: 'csharp.failed.build', regex: 'Build FAILED\\.', eventType: 'failed', priority: 150 }),
      rule({ id: 'csharp.failed.tests', regex: 'Failed!\\s+- Failed:', eventType: 'failed', priority: 145 }),
      rule({ id: 'csharp.error.compiler', regex: '\\berror (CS|MSB|NU)[0-9]+:', eventType: 'error', priority: 140 }),
      rule({ id: 'csharp.warning.compiler', regex: '\\bwarning (CS|MSB|NU)[0-9]+:', eventType: 'warning', priority: 135 }),
      rule({ id: 'csharp.success.build', regex: 'Build succeeded\\.', eventType: 'success', priority: 130 }),
      rule({ id: 'csharp.success.tests', regex: 'Passed!\\s+- Failed: 0', eventType: 'success', priority: 130 })
    ]
  },
  {
    id: 'generic',
    label: 'Generic',
    rules: [
      rule({ id: 'generic.failed', regex: '\\b(failed|fatal|panic:|segmentation fault|uncaught exception)\\b', eventType: 'failed', priority: 20 }),
      rule({ id: 'generic.error', regex: '\\berror\\b', excludeRegex: '\\b0 errors?\\b', eventType: 'error', priority: 15 }),
      rule({ id: 'generic.exception', regex: '\\bexception\\b', eventType: 'error', priority: 15 }),
      rule({ id: 'generic.warning', regex: '\\bwarning\\b', eventType: 'warning', priority: 10 }),
      rule({ id: 'generic.success', regex: '\\b(success|successful|passed|complete(d)?)\\b', excludeRegex: '\\bnot passed\\b', eventType: 'success', priority: 5 })
    ]
  }
];

export class PresetRegistry {
  public getRules(snapshot: SettingsSnapshot): PatternRuleDefinition[] {
    return BUILTIN_PRESETS.filter((preset) => this.isEnabled(preset, snapshot)).flatMap((preset) =>
      preset.rules.map((ruleDefinition) => ({
        ...ruleDefinition,
        appliesTo: ruleDefinition.appliesTo ?? preset.appliesTo ?? []
      }))
    );
  }

  public getPresets(): readonly PresetDefinition[] {
    return BUILTIN_PRESETS;
  }

  private isEnabled(preset: PresetDefinition, snapshot: SettingsSnapshot): boolean {
    if (!preset.settingKey) {
      return true;
    }

    return snapshot.presets[preset.settingKey];
  }
}
