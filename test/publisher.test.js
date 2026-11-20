import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig, parsePrinters } from '../src/config.js';
import { normalizeStatus } from '../src/creality/protocol.js';
import { FEATURES, printerIds } from '../src/devices.js';
import { createPublisher } from '../src/publisher.js';
import { K1_MAX_STATUS } from './helpers/fakePrinter.js';

test('moving values wait for the refresh interval, state changes do not', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  let clock = 0;
  const publisher = createPublisher(gladys, { now: () => clock });
  const [printer] = parsePrinters('192.168.1.40').printers;
  const ids = printerIds(gladys, printer);
  const config = normalizeConfig({ refresh_interval: 30 });
  const entry = { printer, status: normalizeStatus(K1_MAX_STATUS) };
  const nozzle = () => gladys.fake.lastState(ids.feature(FEATURES.NOZZLE));

  await publisher.publish(entry, config);
  assert.equal(nozzle(), 24.9, 'the first call publishes everything');

  entry.status = normalizeStatus({ ...K1_MAX_STATUS, nozzleTemp: 100 });
  clock = 10_000;
  await publisher.publish(entry, config);
  assert.equal(nozzle(), 24.9, 'not yet: 10 s < 30 s');

  clock = 30_000;
  await publisher.publish(entry, config);
  assert.equal(nozzle(), 100, 'published at the interval');

  entry.status = normalizeStatus({ ...K1_MAX_STATUS, state: 1, nozzleTemp: 200 });
  clock = 31_000;
  await publisher.publish(entry, config, { stateChanged: true });
  assert.equal(nozzle(), 200, 'a state change publishes everything at once');
});

test('a refused publication is logged, not thrown', async (t) => {
  const gladys = createFakeGladys();
  t.mock.method(gladys, 'publishChangedStates', async () => {
    throw new Error('429');
  });
  const publisher = createPublisher(gladys);
  const [printer] = parsePrinters('192.168.1.40').printers;
  await publisher.publish({ printer, status: normalizeStatus(K1_MAX_STATUS) }, normalizeConfig());
});
