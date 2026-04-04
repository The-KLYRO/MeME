const steps = [
  { delayMs: 400, line: 'vite v5.4.0 ready in 210 ms' },
  { delayMs: 900, line: 'webpack compiled with warnings' },
  { delayMs: 1200, line: 'warning: src/demo.ts uses an unused variable' },
  { delayMs: 1500, line: 'ERROR in src/app.ts' },
  { delayMs: 1900, line: 'error TS2322: Type string is not assignable to type number.' },
  { delayMs: 2400, line: 'webpack compiled with warnings' },
  { delayMs: 2900, line: 'ERROR in src/routes.ts' }
];

for (const step of steps) {
  setTimeout(() => {
    const stream = /error/i.test(step.line) ? process.stderr : process.stdout;
    stream.write(`${step.line}\n`);
  }, step.delayMs);
}

let heartbeat = 0;
setInterval(() => {
  heartbeat += 1;
  process.stdout.write(`[watch] still running ${heartbeat}\n`);
}, 1000);
