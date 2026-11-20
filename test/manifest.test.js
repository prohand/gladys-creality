// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest shape, but nothing there knows
// which handlers the code registers: these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEYS } from '../src/actions.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_ACTION_KEYS } from '../src/scenes.js';
import { SCENE_TRIGGER_KEYS } from '../src/triggers.js';
import { WIDGET_KEYS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

/** Whether the minimum of `gladys_version` is at least major.minor. */
function floorAtLeast(wantedMajor, wantedMinor) {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  const [major, minor] = match.slice(1).map(Number);
  return major > wantedMajor || (major === wantedMajor && minor >= wantedMinor);
}

test('the code handles every action, scene action and widget, and nothing more', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), [...ACTION_KEYS].sort());
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), [...SCENE_ACTION_KEYS].sort());
  assert.deepEqual(keysOf(manifest.widgets).sort(), [...WIDGET_KEYS].sort());
});

test('every scene trigger the code fires is declared, and every declared one is fired', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('the Gladys floor covers every field the manifest declares', () => {
  // Older cores reject unknown manifest fields: `categories` needs 4.86, the
  // widgets and scene declarations 5.1, `keywords` / `countries` 5.3.
  assert.ok(floorAtLeast(5, 1), `got ${manifest.gladys_version}`);
  if (['keywords', 'countries', 'music'].some((field) => field in manifest)) {
    assert.ok(floorAtLeast(5, 3), `keywords need 5.3.0, got ${manifest.gladys_version}`);
  }
});

test('the integration works over the local network only', () => {
  // The printers are reached on the LAN, never through Creality Cloud: one
  // transport, so Gladys shows no "prefer local" toggle.
  assert.deepEqual(manifest.transports, ['local']);
});

test('no countries field: Creality printers are sold worldwide', () => {
  // Absent = worldwide in the store. Declaring countries would hide the
  // integration from the catalog of every other country (search aside).
  assert.equal(manifest.countries, undefined);
});

test('the categories and keywords follow the store rules', () => {
  assert.deepEqual(manifest.categories, ['appliances']);
  const { keywords } = manifest;
  assert.ok(keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of keywords) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('config_schema defaults match DEFAULT_CONFIG, and every key is known', () => {
  for (const field of manifest.config_schema.filter((f) => f.type !== 'section')) {
    assert.ok(field.key in DEFAULT_CONFIG, `config key "${field.key}" unknown to the code`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamic.length > 0);
  for (const field of dynamic) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-creality:${manifest.version}`);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  // Gladys shows the reader's language and falls back to English: a text
  // missing one shows up in English in the middle of a translated screen. The
  // store accepts any two-letter key, so nothing else catches it.
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.equal(typeof text[language], 'string', `${path}.${language}`);
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the catalog description holds 10 to 100 characters in every language', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length} characters`);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
  }
});

test('the user documentation exists in the four languages', async () => {
  // en and fr are mandatory for the store (300 characters at least), de and es
  // are shown to the users of those languages when present.
  for (const language of LANGUAGES) {
    const text = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    assert.ok(text.length >= 300, `docs/${language}.md is too short`);
  }
});
