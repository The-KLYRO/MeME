# Manual Validation Matrix

Validate each workflow with either shell integration enabled or the monitored run commands.

| Workflow | Expected live signal | Verify |
| --- | --- | --- |
| `cargo build` | warning/error/finished | line detected before exit, no duplicate fail/finish |
| `cargo test` | success/failed | pass/fail summary triggers instantly |
| `python script.py` | error/finished | traceback lines trigger during run |
| `pytest` | success/failed/warning | summary lines trigger live |
| `npm run build` | warning/error/failed | bundler/compiler output triggers live |
| `tsc -w` | success/error | watcher stays active and still emits sounds |
| `go test` | pass/fail/error | PASS/FAIL lines trigger live |
| `dotnet build` | warning/error/success | .NET build lines map correctly |
| `g++` compile | warning/error | compiler diagnostics trigger immediately |
| `javac` | warning/error | compiler diagnostics trigger immediately |
| generic shell command | warning/error/success | fallback generic rules work without cross-triggering |

For every validation run, confirm:

- line detected live before process exit
- correct sound played
- cooldown suppresses bursts
- no `finished` sound after `failed`
- multiple concurrent sessions do not cross-trigger incorrectly
- output log shows session id, rule id, and sound decision
