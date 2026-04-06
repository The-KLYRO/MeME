import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'mocha';
import { buildTaskDefinitionRequest } from '../src/commands/monitoredTaskRequest';

describe('buildTaskDefinitionRequest', () => {
  it('creates a monitored shell request for npm tasks', () => {
    const scopePath = path.resolve('workspace-root');
    const request = buildTaskDefinitionRequest({
      taskName: 'build',
      definitionType: 'npm',
      definition: {
        type: 'npm',
        script: 'build',
        path: 'client'
      },
      scopePath
    });

    assert.ok(request);
    assert.equal(request?.kind, 'shell');
    assert.equal(request?.commandLine, 'npm run build');
    assert.equal(request?.cwd, path.resolve(scopePath, 'client'));
    assert.equal(request?.metadata?.npmScript, 'build');
  });

  it('preserves npm task arguments for workflows that start with npm run', () => {
    const request = buildTaskDefinitionRequest({
      taskName: 'test watch',
      definitionType: 'npm',
      definition: {
        type: 'npm',
        script: 'test',
        args: ['--watch', '--runInBand']
      },
      scopePath: path.resolve('workspace-root')
    });

    assert.equal(request?.kind, 'shell');
    assert.equal(request?.kind === 'shell' ? request.commandLine : undefined, 'npm run test -- --watch --runInBand');
  });

  it('returns undefined when an npm task has no script', () => {
    const request = buildTaskDefinitionRequest({
      taskName: 'broken',
      definitionType: 'npm',
      definition: {
        type: 'npm'
      },
      scopePath: path.resolve('workspace-root')
    });

    assert.equal(request, undefined);
  });
});
