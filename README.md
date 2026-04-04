# MeME

MeME is a production-focused VS Code extension that plays short local audio cues from runtime output while code is still running.

Most sound extensions only react after a task, terminal command, or debug session exits. This extension watches live output, classifies lines in real time, rate-limits noisy bursts, and plays configurable sounds immediately for success, warning, error, failure, start, and finish signals.

## What It Does

- Watches task lifecycle with `vscode.tasks.onDidStartTaskProcess` and `vscode.tasks.onDidEndTaskProcess`
- Watches debug lifecycle and live debug adapter `output` events
- Watches terminal shell executions with shell integration and consumes live `TerminalShellExecution.read()` output
- Provides a guaranteed monitored execution path with `MeME: Run Command With Live Monitor`
- Supports preset-driven detection for Rust, Python, JavaScript, TypeScript, Go, Java, C/C++, C#, and generic shell workflows
- Uses a deterministic event pipeline: session tracking -> output ingestion -> pattern matching -> cooldown -> audio playback -> status update
- Logs every important decision to the `MeME` output channel

## Why It Is Different

- It reacts to live lines instead of waiting for process exit
- It uses explicit rule matching instead of vague best-effort heuristics
- It keeps language support generic by matching tool output, not language runtimes
- It includes an honest fallback mode for cases where VS Code cannot expose universal raw terminal output

## Supported Workflows

- Rust: `cargo build`, `cargo test`, `cargo run`, `cargo check`
- Python: `python script.py`, `pytest`
- JavaScript / TypeScript: `npm run build`, `vite`, `webpack`, `tsc -w`, `node`
- Go: `go test`, `go build`
- Java: `javac`, Maven, Gradle
- C / C++: `gcc`, `g++`, `clang`, `clang++`, MSVC
- C#: `dotnet build`, `dotnet test`, MSBuild
- Debug sessions that emit DAP `output` events
- Generic shell commands in terminals and tasks

## How Live Monitoring Works

The extension uses layered monitoring.

1. Tasks and debug start/stop events establish session boundaries.
2. Terminal shell integration provides reliable command-level output streams through `TerminalShellExecution.read()`.
3. Debug adapter trackers capture live `output` events from debug sessions.
4. Diagnostics changes provide a secondary warning/error bridge when only Problems updates are available.

If a normal integrated terminal command does not have shell integration output available, VS Code does not expose a universal raw terminal scraping API that can be relied on. In those cases, use the monitored execution command.

## Reliable Monitored Run Mode

Use these commands when you want guaranteed live output capture:

- `MeME: Run Command With Live Monitor`
- `MeME: Run Task With Live Monitor`

These commands launch the process through a dedicated monitored terminal, stream stdout/stderr into the matcher pipeline, and play sounds immediately while the process is still running.

## Settings

Main settings:

- `memeSounds.enabled`
- `memeSounds.masterVolume`
- `memeSounds.cooldownMs`
- `memeSounds.maxSimultaneousSounds`
- `memeSounds.enableStatusBar`
- `memeSounds.enableDiagnosticsSignal`
- `memeSounds.enableTaskMonitoring`
- `memeSounds.enableDebugMonitoring`
- `memeSounds.enableTerminalMonitoring`
- `memeSounds.sound.success`
- `memeSounds.sound.warning`
- `memeSounds.sound.error`
- `memeSounds.sound.failed`
- `memeSounds.sound.started`
- `memeSounds.sound.finished`
- `memeSounds.presets.rust`
- `memeSounds.presets.python`
- `memeSounds.presets.javascript`
- `memeSounds.presets.typescript`
- `memeSounds.presets.go`
- `memeSounds.presets.java`
- `memeSounds.presets.cpp`
- `memeSounds.presets.csharp`
- `memeSounds.customRules`

## Custom Sounds

Bundled defaults live in `media/sounds/`. You can override any sound with an absolute path, a workspace-relative path, or `${workspaceFolder}`.

Example:

```json
{
  "memeSounds.sound.failed": "${workspaceFolder}/.vscode/sounds/bonk.wav",
  "memeSounds.sound.success": "C:/Users/you/Sounds/nice.wav"
}
```

Use short local `.wav` files for the lowest latency on Windows. `.mp3` is supported, but `.wav` is the safest default.

## Custom Patterns

`memeSounds.customRules` layers custom rules on top of built-in presets.

Example:

```json
{
  "memeSounds.customRules": [
    {
      "id": "my-rust-bench-success",
      "enabled": true,
      "appliesTo": ["cargo", "bench"],
      "sourceType": "terminal",
      "regex": "bench: .* ns/iter",
      "eventType": "success",
      "priority": 160,
      "cooldownMs": 1200
    },
    {
      "id": "my-ci-hard-fail",
      "enabled": true,
      "contains": "pipeline failed",
      "excludeRegex": "previous pipeline failed",
      "eventType": "failed",
      "priority": 200
    }
  ]
}
```

## Built-In Preset Examples

Rust examples:

- `error: could not compile`
- `warning: unused variable`
- `Finished dev [unoptimized + debuginfo]`
- `test result: FAILED`

Python examples:

- `Traceback (most recent call last):`
- `SyntaxError:`
- `2 failed, 10 passed`
- `warnings summary`

JavaScript / TypeScript examples:

- `error TS2345:`
- `Compiled successfully`
- `Failed to compile`
- `webpack compiled with warnings`

Go examples:

- `FAIL`
- `PASS`
- `panic:`
- `path/file.go:10:2:`

## Commands

- `MeME: Enable`
- `MeME: Disable`
- `MeME: Toggle Mute`
- `MeME: Test Success Sound`
- `MeME: Test Warning Sound`
- `MeME: Test Error Sound`
- `MeME: Test Failed Sound`
- `MeME: Run Command With Live Monitor`
- `MeME: Run Task With Live Monitor`
- `MeME: Attach Monitor To Task`
- `MeME: Reload Presets`
- `MeME: Open Output Log`

## Output Logging

Open the `MeME` output channel to inspect:

- session creation
- matched preset and rule id
- line classification
- sound played vs skipped
- cooldown suppression reason
- invalid regex or sound path issues

This is the main tool for debugging false positives and false negatives.

## Limitations

- Universal raw output capture for every existing integrated terminal path is not guaranteed by the stable VS Code API.
- Reliable live terminal monitoring depends on shell integration or the monitored run commands.
- Task lifecycle is always tracked, but live task text capture depends on shell integration, debug output, or monitored run mode.
- Diagnostics are intentionally conservative. When multiple sessions are active, diagnostics bridging is skipped to avoid ambiguous cross-triggering.
- Windows is the primary target. macOS and Linux backends are supported structurally, but Windows with short `.wav` clips is the lowest-latency path.

## Validation Matrix

See `docs/manual-validation.md` for the manual validation checklist.

## Development

```bash
npm install
npm run compile
npm run lint
npm test
npx @vscode/vsce package
```
