import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig, parsePrinters } from '../src/config.js';
import { normalizeStatus, offlineStatus } from '../src/creality/protocol.js';
import { buildDiscoveredDevices } from '../src/devices.js';
import { PRINTER_WIDGET, WIDGET_KEYS, createWidgets, refreshWidgets } from '../src/widgets.js';
import { K1_MAX_STATUS } from './helpers/fakePrinter.js';

const gladys = createFakeGladys();

function setup(raw, { connected = true, camera = false, imageKey = null } = {}) {
  const [printer] = parsePrinters('K1 Max=192.168.1.40').printers;
  const entry = {
    printer,
    connected,
    status: raw === 'offline' ? offlineStatus(null) : normalizeStatus(raw),
  };
  const sent = [];
  const fleet = {
    list: () => [entry],
    get: (id) => (id === printer.id ? entry : undefined),
    findByExternalId: () => undefined,
    send: (_entry, message) => sent.push(message),
  };
  const snapshots = { lastKey: () => imageKey };
  const config = normalizeConfig({ camera });
  const widgets = createWidgets({ gladys, fleet, snapshots, getConfig: () => config });
  return { widget: widgets[PRINTER_WIDGET], entry, sent, config };
}

const PRINTING = {
  ...K1_MAX_STATUS,
  state: 1,
  printProgress: 40,
  printFileName: 'a.gcode',
  layer: 12,
  TotalLayer: 300,
  printLeftTime: 3900,
};

for (const [name, raw, options] of [
  ['idle', K1_MAX_STATUS, {}],
  ['printing with a camera image', PRINTING, { camera: true, imageKey: 'snapshot-192-168-1-40-3' }],
  ['paused', { ...PRINTING, state: 5 }, {}],
  ['in error', { ...K1_MAX_STATUS, state: 3, err: { errcode: 2001 } }, {}],
  ['unreachable', 'offline', { connected: false }],
]) {
  test(`the content of a printer ${name} is rendered exactly as sent`, async () => {
    const { widget } = setup(raw, options);
    // [] = nothing the core would drop, truncate or trim to the content budget.
    assert.deepEqual(validateWidgetContent(await widget.get({ settings: {} })), []);
  });
}

test('the live tiles reference features the printer publishes', async () => {
  const { widget, entry, config } = setup(PRINTING);
  const featureIds = new Set(
    buildDiscoveredDevices(gladys, [entry], config).flatMap((device) =>
      device.features.map((feature) => feature.external_id),
    ),
  );
  const tiles = (await widget.get({ settings: {} })).components.filter((c) => c.device_feature);
  assert.ok(tiles.length >= 3);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), `unknown feature ${tile.device_feature}`);
  }
});

test('the buttons follow the state: pause while printing, resume while paused', async () => {
  const actionsOf = async (raw) =>
    (await setup(raw).widget.get({ settings: {} })).components
      .filter((c) => c.type === 'button')
      .map((c) => c.action?.key ?? `light:${c.value}`);
  assert.deepEqual(await actionsOf(PRINTING), ['pause', 'stop', 'light:1']);
  assert.deepEqual(await actionsOf({ ...PRINTING, state: 5, lightSw: 1 }), [
    'resume',
    'stop',
    'light:0',
  ]);
  assert.deepEqual(await actionsOf(K1_MAX_STATUS), ['light:1']);
});

test('stopping a print asks first', async () => {
  const { widget } = setup(PRINTING);
  const stop = (await widget.get({ settings: {} })).components.find(
    (c) => c.action?.key === 'stop',
  );
  assert.equal(stop.action.confirm, true);
});

test('every button action answers a short toast in four languages', async () => {
  const { widget, sent } = setup(PRINTING);
  const buttons = (await widget.get({ settings: {} })).components.filter((c) => c.action);
  for (const { action } of buttons) {
    const toast = await widget.action(action.key, action.params);
    for (const language of ['en', 'fr', 'de', 'es']) {
      assert.ok(toast[language] && toast[language].length <= 200, `${action.key}.${language}`);
    }
  }
  assert.deepEqual(sent, [
    { method: 'set', params: { pause: 1 } },
    { method: 'set', params: { stop: 1 } },
  ]);
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const { widget } = setup(PRINTING);
  await assert.rejects(widget.action('explode', {}), /Unknown widget action/);
});

test('without a printer the widget says what to do', async () => {
  const fleet = { list: () => [], findByExternalId: () => undefined };
  const widgets = createWidgets({
    gladys,
    fleet,
    snapshots: {},
    getConfig: () => normalizeConfig(),
  });
  const content = await widgets[PRINTER_WIDGET].get({ settings: {} });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('refreshWidgets nudges every widget', () => {
  const fresh = createFakeGladys();
  refreshWidgets(fresh);
  assert.deepEqual(fresh.fake.widgetRefreshes, WIDGET_KEYS);
});
