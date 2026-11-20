import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { parsePrinters } from '../src/config.js';
import { normalizeStatus, offlineStatus } from '../src/creality/protocol.js';
import {
  FEATURES,
  buildDiscoveredDevices,
  printerIds,
  printerName,
  printerStates,
  transportEntries,
} from '../src/devices.js';
import { K1_MAX_STATUS } from './helpers/fakePrinter.js';

const { printers } = parsePrinters('Workshop=192.168.1.40, 192.168.1.41');
const entries = printers.map((printer) => ({
  printer,
  status: normalizeStatus(K1_MAX_STATUS),
  connected: printer.host === '192.168.1.40',
}));

test('the fake Gladys accepts the discovery payload, camera included', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  // The fake Gladys refuses what the host API refuses (category, type, unit,
  // missing min/max/name/read_only/has_feedback) with the same 400.
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, entries, { camera: true }));
  assert.equal(gladys.fake.discoveredDevices.length, 4);
});

test('every feature carries name, min, max, read_only and has_feedback', () => {
  const gladys = createFakeGladys();
  for (const device of buildDiscoveredDevices(gladys, entries, { camera: true })) {
    for (const feature of device.features) {
      for (const key of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[key], undefined, `${feature.external_id}: ${key}`);
      }
    }
  }
});

test('the printer temperatures are probes, kept out of the room average', () => {
  const gladys = createFakeGladys();
  const [device] = buildDiscoveredDevices(gladys, entries, { camera: false });
  const temperatures = device.features.filter((f) => f.category === 'temperature-sensor');
  assert.equal(temperatures.length, 3);
  for (const feature of temperatures) {
    assert.equal(feature.type, DEVICE_FEATURE_TYPES.TEMPERATURE_SENSOR.PROBE);
  }
});

test('the camera device exists only when the camera option is on', () => {
  const gladys = createFakeGladys();
  assert.equal(buildDiscoveredDevices(gladys, entries, { camera: false }).length, 2);
  assert.equal(buildDiscoveredDevices(gladys, entries, { camera: true }).length, 4);
});

test('a printer is named by the user, else by its model and address', () => {
  assert.equal(printerName(printers[0], null), 'Workshop');
  assert.equal(
    printerName(printers[1], normalizeStatus(K1_MAX_STATUS)),
    'Creality K1 Max (192.168.1.41)',
  );
  assert.equal(printerName(printers[1], null), 'Creality (192.168.1.41)');
});

test('the states split into discrete and continuous, missing values left out', () => {
  const gladys = createFakeGladys();
  const ids = printerIds(gladys, printers[0]);
  const status = normalizeStatus({ ...K1_MAX_STATUS, boxTemp: undefined, printLeftTime: 125 });
  const { discrete, continuous } = printerStates(gladys, printers[0], status);
  assert.deepEqual(
    discrete.map((s) => [s.device_feature_external_id, s.state ?? s.text]),
    [
      [ids.feature(FEATURES.STATE), 'idle'],
      [ids.feature(FEATURES.LIGHT), 0],
      [ids.feature(FEATURES.FILE), '-'],
    ],
  );
  const byFeature = Object.fromEntries(
    continuous.map((s) => [s.device_feature_external_id, s.state]),
  );
  assert.equal(byFeature[ids.feature(FEATURES.TIME_LEFT)], 2, 'seconds -> minutes');
  assert.equal(byFeature[ids.feature(FEATURES.CHAMBER)], undefined, 'no chamber, no state');
});

test('an unreachable printer only publishes its state', () => {
  const gladys = createFakeGladys();
  const { discrete, continuous } = printerStates(gladys, printers[0], offlineStatus(null));
  assert.deepEqual(
    discrete.map((s) => s.text),
    ['offline'],
  );
  assert.deepEqual(continuous, []);
});

test('the transport badge is local when connected, unreachable otherwise', () => {
  const gladys = createFakeGladys();
  const badges = transportEntries(gladys, entries, { camera: true }).map((e) => e.transport);
  assert.deepEqual(badges, ['local', 'local', 'unreachable', 'unreachable']);
});
