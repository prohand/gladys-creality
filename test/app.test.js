// -----------------------------------------------------------------------------
// The whole integration, end to end: the SDK's fake Gladys on one side, fake
// printer WebSockets on the other. No network, no real timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { FEATURES } from '../src/devices.js';
import {
  K1_MAX_STATUS,
  createFakePrinters,
  fakeFetch,
  fakeJpeg,
  flush,
} from './helpers/fakePrinter.js';

const PRINTER = 'printer';
const HOST = '192.168.1.40';

// The last transport badge Gladys received for a device.
function transportOf(gladys, externalId) {
  return gladys.fake.transports.filter((entry) => entry.device_external_id === externalId).at(-1)
    ?.transport;
}

async function start(t, config = {}, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const printers = createFakePrinters();
  const gladys = createFakeGladys({ config: { printers: `K1 Max=${HOST}`, ...config } });
  const fetch = fakeFetch(options.jpeg);
  let clock = 0;
  const app = createApp(gladys, {
    WebSocketImpl: printers.FakeWebSocket,
    fetchImpl: fetch.fetchImpl,
    now: () => clock,
    sleep: async () => {},
  });
  t.after(() => app.stop());
  await gladys.connect();
  const ids = gladys.externalIds(PRINTER, '192-168-1-40');
  return {
    app,
    gladys,
    printers,
    fetch,
    ids,
    advance(ms) {
      clock += ms;
    },
    socket: () => printers.socketFor(HOST),
    async online(status = K1_MAX_STATUS) {
      const socket = printers.socketFor(HOST);
      socket.accept();
      socket.push(status);
      await flush();
      await flush();
      return socket;
    },
  };
}

test('the configured printers are published and their links opened', async (t) => {
  const { gladys, ids, socket } = await start(t);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, ids.device);
  assert.equal(device.name, 'K1 Max');
  assert.ok(socket(), 'a WebSocket was opened to the printer');
  assert.equal(socket().url, `ws://${HOST}:9999/`);
});

test('without a printer, the Configuration screen says what to do', async (t) => {
  const { gladys } = await start(t, { printers: '' });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucune imprimante/);
});

test('a printer that answers is local, and its readings reach Gladys', async (t) => {
  const { gladys, ids, online } = await start(t);
  await online();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(transportOf(gladys, ids.device), 'local');
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.NOZZLE)), 24.9);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.BED)), 23.5);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.CHAMBER)), 22);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.LIGHT)), 0);
  const state = gladys.fake.states.find(
    (entry) => entry.device_feature_external_id === ids.feature(FEATURES.STATE),
  );
  assert.equal(state.text, 'idle');
});

test('a print going on fires the scene triggers once, in order', async (t) => {
  const { gladys, online, socket, advance } = await start(t);
  await online();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first state seen is not news');

  socket().push({ state: 1, printFileName: '/usr/data/printer_data/gcodes/benchy.gcode' });
  await flush();
  advance(5_000);
  socket().push({ printProgress: 30, printLeftTime: 3600 });
  await flush();
  socket().push({ printProgress: 31 });
  await flush();
  socket().push({ state: 2, printProgress: 100 });
  await flush();

  const events = gladys.fake.sceneEvents.map(({ key, data }) => [
    key,
    data.state ?? data.threshold,
  ]);
  assert.deepEqual(events, [
    ['print_state_changed', 'printing'],
    ['print_progress', '25'],
    ['print_state_changed', 'completed'],
  ]);
  assert.equal(gladys.fake.sceneEvents[0].data.file_name, 'benchy.gcode');
  assert.equal(gladys.fake.sceneEvents[0].data.device_name, 'K1 Max');
});

test('a dropped link marks the printer unreachable, and it comes back', async (t) => {
  const { gladys, ids, online, socket, printers } = await start(t);
  await online();
  socket().drop();
  await flush();
  assert.equal(transportOf(gladys, ids.device), 'unreachable');
  assert.equal(gladys.fake.connectionStatus.connected, false);

  t.mock.timers.tick(2_000);
  assert.equal(printers.sockets.length, 2, 'a new link is opened after 2 s');
  await online();
  assert.equal(transportOf(gladys, ids.device), 'local');
});

test('switching the light from Gladys sends lightSw to the printer', async (t) => {
  const { gladys, ids, online } = await start(t);
  const socket = await online();
  const [device] = gladys.fake.discoveredDevices;
  const light = device.features.find((f) => f.external_id === ids.feature(FEATURES.LIGHT));
  const ack = await gladys.fake.setValue(device, light, 1);
  assert.equal(ack.success, true);
  assert.deepEqual(socket.orders.at(-1), { method: 'set', params: { lightSw: 1 } });
});

test('switching the light of an unreachable printer fails with a message', async (t) => {
  const { gladys, ids } = await start(t);
  const [device] = gladys.fake.discoveredDevices;
  const light = device.features.find((f) => f.external_id === ids.feature(FEATURES.LIGHT));
  const ack = await gladys.fake.setValue(device, light, 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /not connected/);
});

test('the control_print scene action pauses a print and says so in its outputs', async (t) => {
  const { gladys, ids, online } = await start(t);
  const socket = await online({ ...K1_MAX_STATUS, state: 1, printProgress: 40 });
  const ack = await gladys.fake.sceneAction('control_print', {
    device: ids.device,
    command: 'pause',
  });
  assert.deepEqual(ack.data.outputs, { sent: true, state: 'printing' });
  assert.deepEqual(socket.orders.at(-1), { method: 'set', params: { pause: 1 } });

  const resume = await gladys.fake.sceneAction('control_print', {
    device: ids.device,
    command: 'resume',
  });
  assert.deepEqual(resume.data.outputs, { sent: false, state: 'printing' }, 'nothing to resume');
});

test('take_snapshot publishes a camera image when the camera is on', async (t) => {
  const { gladys, ids, online, fetch } = await start(t, { camera: true });
  await online();
  const ack = await gladys.fake.sceneAction('take_snapshot', { device: ids.device });
  assert.deepEqual(ack.data.outputs, { captured: true });
  assert.deepEqual(fetch.calls, [`http://${HOST}:8080/?action=snapshot`]);
  const camera = gladys.externalIds('camera', '192-168-1-40').device;
  assert.equal(gladys.fake.cameraImages.at(-1).device_external_id, camera);
});

test('take_snapshot reports no image when the camera is off', async (t) => {
  const { gladys, ids, online } = await start(t);
  await online();
  const ack = await gladys.fake.sceneAction('take_snapshot', { device: ids.device });
  assert.deepEqual(ack.data.outputs, { captured: false });
});

test('the camera device answers a fresh capture', async (t) => {
  const { gladys, online } = await start(t, { camera: true });
  await online();
  const camera = gladys.fake.discoveredDevices.find((device) =>
    device.external_id.includes(':camera:'),
  );
  const ack = await gladys.fake.getImage(camera);
  assert.equal(ack.success, true);
  assert.match(ack.data.image, /^image\/jpg;base64,/);
});

test('a snapshot over 150 KB is refused with a clear message', async (t) => {
  const { gladys, online } = await start(t, { camera: true }, { jpeg: fakeJpeg(200 * 1024) });
  await online();
  const camera = gladys.fake.discoveredDevices.find((device) =>
    device.external_id.includes(':camera:'),
  );
  const ack = await gladys.fake.getImage(camera);
  assert.equal(ack.success, false);
  assert.match(ack.error, /150 KB/);
});

test('the widget shows the printer and its buttons reach the printer', async (t) => {
  const { gladys, ids, online } = await start(t, { camera: true });
  const socket = await online({ ...K1_MAX_STATUS, state: 1, printProgress: 40 });
  await gladys.fake.sceneAction('take_snapshot', { device: ids.device });

  const ack = await gladys.fake.widgetGet('printer', { settings: { device: ids.device } });
  assert.equal(ack.success, true);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const image = content.components.find((component) => component.type === 'image');
  assert.ok(image, 'the last snapshot is shown');

  const imageAck = await gladys.fake.widgetGetImage(image.key);
  assert.equal(imageAck.success, true);

  const pause = content.components.find((c) => c.type === 'button' && c.action?.key === 'pause');
  const toast = await gladys.fake.widgetAction('printer', 'pause', pause.action.params, {
    settings: {},
  });
  assert.equal(toast.success, true);
  assert.deepEqual(socket.orders.at(-1), { method: 'set', params: { pause: 1 } });
});

test('Test the connection lists every printer and the invalid entries', async (t) => {
  const { gladys, online } = await start(t, { printers: `K1 Max=${HOST}, not an address!` });
  await online();
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  const message = ack.data.message ?? ack.data;
  assert.match(message.en, /✓ K1 Max: reachable, K1 Max, Idle, nozzle 24.9 °C, bed 23.5 °C/);
  assert.match(message.fr, /✗ "not an address!": Ce n'est pas une adresse/);
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.equal(typeof message[language], 'string');
  }
});

test('Identify blinks the light, then puts it back', async (t) => {
  const { gladys, ids, online } = await start(t);
  const socket = await online();
  const ack = await gladys.fake.action('identify', { device: ids.device });
  assert.equal(ack.success, true);
  const lights = socket.orders.map((order) => order.params.lightSw);
  assert.deepEqual(lights, [1, 0, 1, 0, 1, 0]);
});

test('a new configuration closes the removed printers and opens the new ones', async (t) => {
  const { gladys, online, printers } = await start(t);
  const first = await online();
  await gladys.fake.configUpdated({ printers: '192.168.1.41' });
  assert.equal(first.closed, true);
  assert.ok(printers.socketFor('192.168.1.41'), 'the new printer is connected');
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [gladys.externalIds(PRINTER, '192-168-1-41').device],
  );
});
