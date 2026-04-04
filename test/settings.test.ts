import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'mocha';
import { SettingsRegistry, validateCustomRules } from '../src/core/settings';

describe('SettingsRegistry', () => {
  it('drops invalid custom regex rules', () => {
    const issues: string[] = [];
    const rules = validateCustomRules(
      [
        {
          id: 'broken',
          regex: '(',
          eventType: 'error'
        }
      ],
      (message) => issues.push(message)
    );

    assert.equal(rules.length, 0);
    assert.equal(issues.length, 1);
  });

  it('resolves bundled default sound paths when unset', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meme-sounds-'));
    const mediaDir = path.join(tempRoot, 'media', 'sounds');
    fs.mkdirSync(mediaDir, { recursive: true });
    for (const fileName of [
      'started.wav',
      'success.wav',
      'warning.wav',
      'error.wav',
      'failed.wav',
      'noice.wav',
      'oh_my_god_wow.wav',
      'yeah_boy.wav',
      'yeet.wav',
      'what.wav',
      'enemy_spotted.wav',
      'technologya.wav',
      'oh_hell_no_man.wav',
      'nope_meme.wav',
      'omaiga_meme.wav',
      'get_out.wav',
      'faaaa.wav'
    ]) {
      fs.writeFileSync(path.join(mediaDir, fileName), 'fake');
    }

    const registry = new SettingsRegistry({
      extensionPath: tempRoot,
      getConfig: () => ({
        get<T>(_section: string, defaultValue?: T): T {
          return defaultValue as T;
        }
      }),
      getWorkspaceFolders: () => [],
      onIssue: () => undefined
    });

    const snapshot = registry.getSnapshot();
    assert.deepEqual(
      snapshot.sounds.success.map((soundPath) => path.basename(soundPath)),
      ['success.wav', 'noice.wav', 'oh_my_god_wow.wav', 'yeah_boy.wav', 'yeet.wav']
    );
    assert.deepEqual(
      snapshot.sounds.failed.map((soundPath) => path.basename(soundPath)),
      ['failed.wav', 'get_out.wav', 'faaaa.wav']
    );
  });

  it('normalizes valid custom rules', () => {
    const rules = validateCustomRules([
      {
        id: 'custom-1',
        contains: 'panic:',
        eventType: 'failed',
        priority: 200,
        appliesTo: ['go']
      }
    ]);

    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.priority, 200);
    assert.deepEqual(rules[0]?.appliesTo, ['go']);
  });
});
