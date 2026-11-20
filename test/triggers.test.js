import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { parsePrinters } from '../src/config.js';
import { normalizeStatus, offlineStatus } from '../src/creality/protocol.js';
import { TRIGGERS, detectEvents } from '../src/triggers.js';
import { K1_MAX_STATUS } from './helpers/fakePrinter.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const gladys = createFakeGladys();
const [printer] = parsePrinters('K1=192.168.1.40').printers;

function newEntry() {
  return {
    printer,
    status: null,
    memory: { knownState: null, thresholds: new Set(), errorCode: null, fileName: null },
  };
}

// Feed the entry a sequence of raw printer states, collect the events.
function run(entry, ...raws) {
  let raw = {};
  const events = [];
  for (const next of raws) {
    if (next === 'offline') {
      entry.status = offlineStatus(entry.status);
    } else {
      raw = { ...raw, ...next };
      entry.status = normalizeStatus(raw);
    }
    events.push(...detectEvents(gladys, entry));
  }
  return events;
}

const short = (events) =>
  events.map(({ key, data }) => `${key}:${data.state ?? data.threshold ?? data.error_code}`);

test('a print from start to end fires each step once', () => {
  const events = run(
    newEntry(),
    K1_MAX_STATUS,
    { state: 1, printFileName: '/gcodes/a.gcode', printProgress: 0 },
    { printProgress: 10 },
    { printProgress: 26 },
    { printProgress: 27 },
    { printProgress: 51 },
    { state: 5 },
    { state: 1 },
    { printProgress: 76 },
    { printProgress: 91 },
    { state: 2, printProgress: 100 },
  );
  assert.deepEqual(short(events), [
    'print_state_changed:printing',
    'print_progress:25',
    'print_progress:50',
    'print_state_changed:paused',
    'print_state_changed:printing',
    'print_progress:75',
    'print_progress:90',
    'print_state_changed:completed',
  ]);
});

test('a printer found printing at startup fires nothing for what it already did', () => {
  const events = run(
    newEntry(),
    { ...K1_MAX_STATUS, state: 1, printProgress: 60 },
    {
      printProgress: 61,
    },
  );
  assert.deepEqual(short(events), []);
});

test('a jump over several steps is one event, for the highest', () => {
  const events = run(newEntry(), { ...K1_MAX_STATUS, state: 1, printProgress: 10 }, 'offline', {
    state: 1,
    printProgress: 80,
  });
  assert.deepEqual(short(events), ['print_progress:75']);
});

test('offline is not a print state: the state before it is kept', () => {
  const events = run(newEntry(), { ...K1_MAX_STATUS, state: 1, printProgress: 95 }, 'offline', {
    state: 2,
  });
  assert.deepEqual(short(events), ['print_state_changed:completed']);
});

test('a new print starts its steps again', () => {
  const entry = newEntry();
  run(entry, { ...K1_MAX_STATUS, state: 1, printProgress: 99, printFileName: 'a.gcode' });
  const events = run(
    entry,
    { state: 2 },
    { state: 1, printProgress: 30, printFileName: 'b.gcode' },
  );
  assert.deepEqual(short(events), [
    'print_state_changed:completed',
    'print_state_changed:printing',
    'print_progress:25',
  ]);
});

test('an error fires once when it appears', () => {
  const events = run(
    newEntry(),
    K1_MAX_STATUS,
    { err: { errcode: 2001, key: 1 } },
    { nozzleTemp: 30 },
    { err: { errcode: 0, key: 0 } },
  );
  assert.deepEqual(short(events), ['printer_error:2001']);
});

test('the event data only carries keys the manifest declares, all primitives', () => {
  const events = run(
    newEntry(),
    K1_MAX_STATUS,
    { state: 1, printProgress: 30, printFileName: 'a.gcode', printLeftTime: 600 },
    { err: { errcode: 7 } },
  );
  assert.deepEqual(new Set(events.map((e) => e.key)), new Set(Object.values(TRIGGERS)));
  for (const { key, data } of events) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    const declared = [...trigger.fields, ...trigger.variables].map((entry) => entry.key);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name}`);
    }
    // A multi_select filter matches the option values: the data must be one.
    for (const field of trigger.fields.filter((entry) => entry.type === 'multi_select')) {
      assert.ok(
        field.options.some((option) => option.value === data[field.key]),
        `${key}: data.${field.key} "${data[field.key]}" is not an option`,
      );
    }
    assert.equal(data.device, gladys.externalIds('printer', printer.id).device);
  }
});
