// -----------------------------------------------------------------------------
// The fleet: one live link per configured printer, and what each one said.
//
// Every entry holds the printer (from the config), its connection, the raw
// state merged from every message since the connection (the printer only
// sends what changed), the normalized status, and a small memory the scene
// triggers read (see src/triggers.js).
//
// Events:
//   - `status`     (entry, previousStatus): the status of a printer changed;
//   - `connection` (entry): a printer connected or went unreachable.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createLogger } from '@gladysassistant/integration-sdk';
import { PrinterConnection } from './creality/connection.js';
import { mergeRaw, normalizeStatus, offlineStatus } from './creality/protocol.js';
import { CAMERA_TYPE, PRINTER_TYPE } from './devices.js';

const logger = createLogger({ name: 'printers' });

export class PrinterFleet extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {typeof WebSocket} [options.WebSocketImpl] injected by the tests
   * @param {object} [options.timers] injected by the tests
   */
  constructor({ WebSocketImpl, timers } = {}) {
    super();
    this.WebSocketImpl = WebSocketImpl;
    this.timers = timers;
    /** @type {Map<string, object>} printer id -> entry */
    this.entries = new Map();
  }

  /**
   * Apply a printer list: links of removed or moved printers are closed, new
   * ones opened, the unchanged ones kept (and their status with them).
   */
  configure(printers) {
    const wanted = new Map(printers.map((printer) => [printer.id, printer]));
    for (const [id, entry] of this.entries) {
      const next = wanted.get(id);
      if (!next || next.host !== entry.printer.host || next.port !== entry.printer.port) {
        entry.connection.stop();
        this.entries.delete(id);
      }
    }
    for (const printer of printers) {
      const existing = this.entries.get(printer.id);
      if (existing) {
        // Only the name can differ here: same id means same address.
        existing.printer = printer;
        continue;
      }
      this.entries.set(printer.id, this.createEntry(printer));
    }
  }

  createEntry(printer) {
    const connection = new PrinterConnection({
      host: printer.host,
      port: printer.port,
      ...(this.WebSocketImpl ? { WebSocketImpl: this.WebSocketImpl } : {}),
      ...(this.timers ? { timers: this.timers } : {}),
      logger: createLogger({ name: `printer:${printer.id}` }),
    });
    const entry = {
      printer,
      connection,
      raw: {},
      status: offlineStatus(null),
      connected: false,
      // Read and written by src/triggers.js.
      memory: { knownState: null, thresholds: new Set(), errorCode: null, fileName: null },
    };
    connection.on('open', () => {
      entry.connected = true;
      // A fresh link starts from scratch: the printer sends its full state
      // first, then only what changes.
      entry.raw = {};
      this.emit('connection', entry);
    });
    connection.on('message', (message) => {
      entry.raw = mergeRaw(entry.raw, message);
      const previous = entry.status;
      entry.status = normalizeStatus(entry.raw);
      this.emit('status', entry, previous);
    });
    connection.on('close', () => {
      entry.connected = false;
      const previous = entry.status;
      entry.status = offlineStatus(previous);
      this.emit('connection', entry);
      this.emit('status', entry, previous);
    });
    return entry;
  }

  /** Open every link (after connecting to Gladys). */
  startAll() {
    for (const entry of this.entries.values()) {
      entry.connection.start();
    }
  }

  /** Close every link (shutdown, disconnection from Gladys). */
  stopAll() {
    for (const entry of this.entries.values()) {
      entry.connection.stop();
    }
  }

  /** Every entry, in the order of the configuration. */
  list() {
    return [...this.entries.values()];
  }

  get(id) {
    return this.entries.get(id);
  }

  /**
   * The entry a Gladys device belongs to: its printer device or its camera
   * device. `undefined` for a device of a printer no longer configured.
   */
  findByExternalId(gladys, externalId) {
    if (typeof externalId !== 'string') {
      return undefined;
    }
    return this.list().find(({ printer }) =>
      [PRINTER_TYPE, CAMERA_TYPE].some(
        (type) => gladys.externalIds(type, printer.id).device === externalId,
      ),
    );
  }

  /** Send one message to a printer; throws when it is not connected. */
  send(entry, message) {
    logger.debug(`-> ${entry.printer.id} ${JSON.stringify(message)}`);
    entry.connection.send(message);
  }

  /**
   * Resolve once the printer is connected and has sent its state, or after
   * `timeoutMs`. Used by "Test the connection", which can be clicked right
   * after the configuration was saved, while the links are still opening.
   */
  waitForStatus(entry, timeoutMs, timers = globalThis) {
    if (entry.connected && Object.keys(entry.raw).length > 0) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const onStatus = (updated) => {
        if (updated === entry && entry.connected) {
          done(true);
        }
      };
      const timer = timers.setTimeout(() => done(false), timeoutMs);
      const done = (result) => {
        timers.clearTimeout(timer);
        this.off('status', onStatus);
        resolve(result);
      };
      this.on('status', onStatus);
    });
  }
}
