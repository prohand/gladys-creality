// -----------------------------------------------------------------------------
// The changelog helper the Release workflow runs (.github/scripts).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

test('the Unreleased section moves under the released version', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Something.',
    '',
    '[Unreleased]: https://github.com/prohand/gladys-creality/commits/main',
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.0.0', '2026-11-20');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-11-20\n\n### Added\n\n- Something\./,
  );
  assert.match(
    after,
    /\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-creality\/compare\/v1\.0\.0\.\.\.HEAD/,
  );
  assert.match(
    after,
    /\[1\.0\.0\]: https:\/\/github\.com\/prohand\/gladys-creality\/releases\/tag\/v1\.0\.0/,
  );
});

test('the real changelog has an Unreleased section the workflow can roll', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.doesNotMatch(
    text,
    /^## \[\d+\.\d+\.\d+\]/m,
    'versions are written by the Release workflow',
  );
  assert.notEqual(rollChangelog(text, '9.9.9', '2026-01-01'), text);
});
