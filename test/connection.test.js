import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrinterConnection } from '../src/creality/connection.js';
import { createFakePrinters } from './helpers/fakePrinter.js';

const silent = { debug() {}, info() {}, warn() {} };

function connect(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const printers = createFakePrinters();
  const connection = new PrinterConnection({
    host: '192.168.1.40',
    port: 9999,
    WebSocketImpl: printers.FakeWebSocket,
    logger: silent,
  });
  const events = [];
  connection.on('open', () => events.push('open'));
  connection.on('close', () => events.push('close'));
  connection.on('message', (message) => events.push(message));
  t.after(() => connection.stop());
  connection.start();
  return { connection, printers, events, socket: () => printers.sockets.at(-1) };
}

test('messages are parsed, the heartbeat answer is skipped', (t) => {
  const { socket, events } = connect(t);
  socket().accept();
  socket().push({ state: 1 });
  socket().push('ok');
  socket().push('not json');
  assert.deepEqual(events, ['open', { state: 1 }]);
});

test('a heartbeat is sent every 10 s', (t) => {
  const { socket } = connect(t);
  socket().accept();
  t.mock.timers.tick(10_000);
  socket().push({ state: 0 });
  t.mock.timers.tick(10_000);
  assert.equal(socket().sent.filter((m) => m.ModeCode === 'heart_beat').length, 2);
});

test('sending to a printer that is not connected throws', (t) => {
  const { connection } = connect(t);
  assert.equal(connection.connected, false);
  assert.throws(() => connection.send({ method: 'set' }), /not connected/);
});

test('a lost link is reopened with a growing delay', (t) => {
  const { printers, events, socket } = connect(t);
  socket().accept();
  socket().drop();
  assert.deepEqual(events, ['open', 'close']);
  t.mock.timers.tick(1_999);
  assert.equal(printers.sockets.length, 1);
  t.mock.timers.tick(1);
  assert.equal(printers.sockets.length, 2, 'retried after 2 s');
  socket().drop();
  t.mock.timers.tick(4_000);
  assert.equal(printers.sockets.length, 3, 'then after 4 s');
});

test('a printer that never answers is retried after the connect timeout', (t) => {
  const { printers } = connect(t);
  t.mock.timers.tick(10_000);
  assert.equal(printers.sockets[0].closed, true);
  t.mock.timers.tick(2_000);
  assert.equal(printers.sockets.length, 2);
});

test('a link silent for a minute is treated as dead', (t) => {
  const { printers, events, socket } = connect(t);
  socket().accept();
  t.mock.timers.tick(59_999);
  assert.deepEqual(events, ['open']);
  t.mock.timers.tick(1);
  assert.deepEqual(events, ['open', 'close']);
  t.mock.timers.tick(2_000);
  assert.equal(printers.sockets.length, 2);
});

test('stop closes the link for good', (t) => {
  const { connection, printers, socket } = connect(t);
  socket().accept();
  connection.stop();
  assert.equal(socket().closed, true);
  t.mock.timers.tick(120_000);
  assert.equal(printers.sockets.length, 1, 'no reconnection after stop');
});
