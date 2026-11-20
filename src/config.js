// -----------------------------------------------------------------------------
// Integration configuration.
//
// The user fills it in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module holds the defaults (they MUST
// match the manifest `default` values: test/manifest.test.js checks it), turns
// the raw object into typed values, and parses the printer list.
// -----------------------------------------------------------------------------

/** The port of the local WebSocket every Creality OS printer serves. */
export const DEFAULT_PRINTER_PORT = 9999;

export const DEFAULT_CONFIG = {
  // One printer per line (or separated by commas): `address` or `name=address`.
  printers: '',
  // Snapshots from the printer camera (K1C, K1 Max, K2...), off by default:
  // a printer without a camera would answer every snapshot with an error.
  camera: false,
  // Port of the camera snapshot server (mjpg-streamer on Creality OS).
  camera_port: 8080,
  // Seconds between two publications of the values that move all the time
  // (temperatures, progress, times). State changes are published at once.
  refresh_interval: 30,
  // Debug level for the logs, switchable from the Configuration screen.
  debug_logs: false,
};

const MIN_REFRESH_INTERVAL = 5;
const MAX_REFRESH_INTERVAL = 600;

/** A number in [min, max], or the fallback when the value is not a number. */
function bounded(value, fallback, min, max) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** A boolean from a form value: `true`, `'true'`, `1` and `'1'` mean on. */
function flag(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Merge the user config with the defaults, with the right types.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    printers: typeof raw.printers === 'string' ? raw.printers : DEFAULT_CONFIG.printers,
    camera: flag(raw.camera, DEFAULT_CONFIG.camera),
    camera_port: bounded(raw.camera_port, DEFAULT_CONFIG.camera_port, 1, 65535),
    refresh_interval: bounded(
      raw.refresh_interval,
      DEFAULT_CONFIG.refresh_interval,
      MIN_REFRESH_INTERVAL,
      MAX_REFRESH_INTERVAL,
    ),
    debug_logs: flag(raw.debug_logs, DEFAULT_CONFIG.debug_logs),
  };
}

// A host name or an IPv4 address. IPv6 goes between brackets: [fe80::1]:9999.
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62})(\.[a-z0-9]([a-z0-9-]{0,62}))*$/i;
const IPV6_PATTERN = /^\[([0-9a-f:.]+)\]$/i;

/**
 * Split `host[:port]` into its parts, or `null` when it is not an address.
 * @param {string} text
 * @returns {{ host: string, port: number } | null}
 */
export function parseAddress(text) {
  const value = text
    .trim()
    .replace(/^wss?:\/\//i, '')
    .replace(/\/+$/, '');
  const ipv6 = value.match(/^(\[[^\]]+\])(?::(\d+))?$/);
  let host;
  let port;
  if (ipv6) {
    [, host, port] = ipv6;
    if (!IPV6_PATTERN.test(host)) {
      return null;
    }
  } else {
    const parts = value.split(':');
    if (parts.length > 2) {
      return null;
    }
    [host, port] = parts;
    if (!HOST_PATTERN.test(host)) {
      return null;
    }
  }
  const portNumber = port === undefined ? DEFAULT_PRINTER_PORT : Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }
  return { host: host.toLowerCase(), port: portNumber };
}

/**
 * The stable id of a printer, built from its address: it becomes the
 * `platformId` of its Gladys external ids, so it must never change for the
 * same printer. That is why the documentation asks for a fixed address (a
 * DHCP reservation): a printer moved to another address is a new device.
 */
export function printerId({ host, port }) {
  const slug = host.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return port === DEFAULT_PRINTER_PORT ? slug : `${slug}-${port}`;
}

/**
 * Parse the `printers` field: one entry per line, comma or semicolon, each
 * `address` or `name=address`. Invalid entries are returned apart, so the
 * "Test the connection" action can name them; duplicates are dropped.
 *
 * @param {string} text
 * @returns {{ printers: Array<{ id: string, name: string|null, host: string, port: number }>, invalid: string[] }}
 */
export function parsePrinters(text = '') {
  const printers = [];
  const invalid = [];
  const seen = new Set();
  for (const raw of String(text).split(/[\n,;]+/)) {
    const entry = raw.trim();
    if (entry === '') {
      continue;
    }
    const separator = entry.lastIndexOf('=');
    const name = separator > 0 ? entry.slice(0, separator).trim() : null;
    const address = parseAddress(separator > 0 ? entry.slice(separator + 1) : entry);
    if (!address) {
      invalid.push(entry);
      continue;
    }
    const id = printerId(address);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    printers.push({ id, name: name || null, ...address });
  }
  return { printers, invalid };
}
