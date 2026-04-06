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
    const sourceRegistryPath = path.resolve(__dirname, '..', '..', 'media', 'sounds', 'categories.json');
    const categories = JSON.parse(fs.readFileSync(sourceRegistryPath, 'utf8')) as Record<string, string[]>;
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.copyFileSync(sourceRegistryPath, path.join(mediaDir, 'categories.json'));

    for (const fileName of [...new Set(Object.values(categories).flat())]) {
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
      categories.success
    );
    assert.deepEqual(
      snapshot.sounds.info.map((soundPath) => path.basename(soundPath)),
      categories.info
    );
    assert.deepEqual(
      snapshot.sounds.failed.map((soundPath) => path.basename(soundPath)),
      categories.failed
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
