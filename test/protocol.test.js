import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINT_STATES,
  commandAllowed,
  heartbeatMessage,
  lightCommand,
  mergeRaw,
  normalizeStatus,
  offlineStatus,
  printCommand,
} from '../src/creality/protocol.js';
import { K1_MAX_STATUS } from './helpers/fakePrinter.js';

test('a full status reads as numbers, rounded, with the file name only', () => {
  const status = normalizeStatus({
    ...K1_MAX_STATUS,
    state: 1,
    printProgress: '42',
    printFileName: '/usr/data/printer_data/gcodes/benchy.gcode',
    printLeftTime: '3600',
  });
  assert.equal(status.state, PRINT_STATES.PRINTING);
  assert.equal(status.progress, 42);
  assert.equal(status.nozzleTemp, 24.9);
  assert.equal(status.bedTemp, 23.5);
  assert.equal(status.chamberTemp, 22);
  assert.equal(status.fileName, 'benchy.gcode');
  assert.equal(status.leftSeconds, 3600);
  assert.equal(status.light, 0);
  assert.equal(status.model, 'K1 Max');
});

test('every state code maps, an unknown one reads as unknown', () => {
  const states = [0, 1, 2, 3, 4, 5, 42, undefined].map((state) => normalizeStatus({ state }).state);
  assert.deepEqual(states, [
    'idle',
    'printing',
    'completed',
    'failed',
    'stopped',
    'paused',
    'unknown',
    'unknown',
  ]);
});

test('missing fields stay null, never 0', () => {
  const status = normalizeStatus({ state: 0 });
  assert.equal(status.chamberTemp, null);
  assert.equal(status.progress, null);
  assert.equal(status.fileName, null);
  assert.equal(status.errorCode, 0);
});

test('messages only carry what changed: they are merged', () => {
  const raw = mergeRaw(mergeRaw({}, { state: 1, nozzleTemp: 200 }), { nozzleTemp: 210 });
  assert.deepEqual(raw, { state: 1, nozzleTemp: 210 });
  assert.equal(mergeRaw(raw, 'ok'), raw);
  assert.equal(mergeRaw(raw, [1]), raw);
});

test('the offline status keeps the identity of the printer', () => {
  const status = offlineStatus(normalizeStatus(K1_MAX_STATUS));
  assert.equal(status.state, PRINT_STATES.OFFLINE);
  assert.equal(status.model, 'K1 Max');
  assert.equal(status.nozzleTemp, null);
});

test('the commands are the set messages the printers understand', () => {
  assert.deepEqual(lightCommand(true), { method: 'set', params: { lightSw: 1 } });
  assert.deepEqual(printCommand('pause'), { method: 'set', params: { pause: 1 } });
  assert.deepEqual(printCommand('resume'), { method: 'set', params: { pause: 0 } });
  assert.deepEqual(printCommand('stop'), { method: 'set', params: { stop: 1 } });
  assert.throws(() => printCommand('explode'), /Unknown print command/);
  assert.deepEqual(heartbeatMessage(new Date('2026-01-01T00:00:00Z')), {
    ModeCode: 'heart_beat',
    msg: '2026-01-01T00:00:00.000Z',
  });
});

test('a command is only sent in a state where it does something', () => {
  assert.equal(commandAllowed('pause', 'printing'), true);
  assert.equal(commandAllowed('pause', 'paused'), false);
  assert.equal(commandAllowed('resume', 'paused'), true);
  assert.equal(commandAllowed('resume', 'printing'), false);
  assert.equal(commandAllowed('stop', 'printing'), true);
  assert.equal(commandAllowed('stop', 'paused'), true);
  assert.equal(commandAllowed('stop', 'idle'), false);
  assert.equal(commandAllowed('other', 'printing'), false);
});
