import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  parseAddress,
  parsePrinters,
  printerId,
} from '../src/config.js';

test('an empty config gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
});

test('form values are typed, and numbers kept in their range', () => {
  const config = normalizeConfig({
    camera: 'true',
    camera_port: '8081',
    refresh_interval: '2',
    debug_logs: 'false',
  });
  assert.equal(config.camera, true);
  assert.equal(config.camera_port, 8081);
  assert.equal(config.refresh_interval, 5, 'raised to the 5 s minimum');
  assert.equal(config.debug_logs, false);
  assert.equal(normalizeConfig({ refresh_interval: 'abc' }).refresh_interval, 30);
  assert.equal(normalizeConfig({ refresh_interval: 99999 }).refresh_interval, 600);
});

test('an address is a host or IPv4, with an optional port', () => {
  assert.deepEqual(parseAddress('192.168.1.40'), { host: '192.168.1.40', port: 9999 });
  assert.deepEqual(parseAddress(' K1-Max.local:9998 '), { host: 'k1-max.local', port: 9998 });
  assert.deepEqual(parseAddress('ws://192.168.1.40/'), { host: '192.168.1.40', port: 9999 });
  assert.deepEqual(parseAddress('[fe80::1]:9999'), { host: '[fe80::1]', port: 9999 });
  assert.equal(parseAddress('not an address'), null);
  assert.equal(parseAddress('192.168.1.40:70000'), null);
  assert.equal(parseAddress('a:b:c'), null);
});

test('the printer id is built from its address, port only when not the default', () => {
  assert.equal(printerId({ host: '192.168.1.40', port: 9999 }), '192-168-1-40');
  assert.equal(printerId({ host: 'k1.local', port: 9998 }), 'k1-local-9998');
  assert.equal(printerId({ host: '[fe80::1]', port: 9999 }), 'fe80-1');
});

test('the printer list takes commas, semicolons and lines, names and duplicates', () => {
  const { printers, invalid } = parsePrinters(
    'Workshop K1=192.168.1.40, 192.168.1.41\nK2=k2.local:9999; 192.168.1.40, oops!',
  );
  assert.deepEqual(printers, [
    { id: '192-168-1-40', name: 'Workshop K1', host: '192.168.1.40', port: 9999 },
    { id: '192-168-1-41', name: null, host: '192.168.1.41', port: 9999 },
    { id: 'k2-local', name: 'K2', host: 'k2.local', port: 9999 },
  ]);
  assert.deepEqual(invalid, ['oops!']);
  assert.deepEqual(parsePrinters(''), { printers: [], invalid: [] });
});
