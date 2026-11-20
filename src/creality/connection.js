// -----------------------------------------------------------------------------
// One WebSocket link to one printer, kept alive for the life of the
// integration.
//
// - Reconnects by itself, with a growing delay (2 s, 4 s... up to 1 min): a
//   printer switched off at night comes back in the morning without anyone
//   touching Gladys.
// - Sends a heartbeat every 10 s, like the Creality apps do: a silent client
//   is dropped by the printer.
// - Treats a link that stays silent for a minute as dead: a printer that lost
//   its power never closes the socket, and without this the integration would
//   show the last temperatures forever.
//
// It knows nothing about Gladys: it emits `open`, `close` and `message` (the
// parsed JSON object), and `src/printers.js` does the rest. The WebSocket
// class and the timers are injected so the tests run without a network.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { heartbeatMessage } from './protocol.js';

const CONNECT_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 10_000;
const SILENCE_TIMEOUT_MS = 60_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

/** Text of a WebSocket message, whatever the runtime handed over. */
function messageText(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
}

export class PrinterConnection extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host printer address
   * @param {number} options.port WebSocket port (9999)
   * @param {typeof WebSocket} [options.WebSocketImpl]
   * @param {{ debug: Function, info: Function, warn: Function }} options.logger
   * @param {{ setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function }} [options.timers]
   */
  constructor({ host, port, WebSocketImpl = globalThis.WebSocket, logger, timers = globalThis }) {
    super();
    this.url = `ws://${host}:${port}/`;
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
    this.timers = timers;
    this.socket = null;
    this.isOpen = false;
    this.stopped = true;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.connectTimer = null;
    this.heartbeatTimer = null;
    this.silenceTimer = null;
  }

  get connected() {
    return this.isOpen;
  }

  /** Open the link, and keep it open until stop(). */
  start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.open();
  }

  /** Close the link for good (config change, shutdown). */
  stop() {
    this.stopped = true;
    this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.closeSocket();
  }

  /**
   * Send one JSON message. Throws when the printer is not connected: the
   * caller says so to the user rather than queuing an order that could run
   * hours later.
   */
  send(message) {
    if (!this.isOpen || !this.socket) {
      throw new Error(`Printer ${this.url} is not connected`);
    }
    this.socket.send(JSON.stringify(message));
  }

  open() {
    let socket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch (err) {
      this.logger.warn(`Cannot open ${this.url}: ${err.message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.connectTimer = this.timers.setTimeout(() => {
      this.logger.debug(`${this.url}: no answer within ${CONNECT_TIMEOUT_MS / 1000} s`);
      this.closeSocket();
      this.handleClose(socket);
    }, CONNECT_TIMEOUT_MS);

    socket.addEventListener('open', () => {
      if (socket !== this.socket) {
        return;
      }
      this.timers.clearTimeout(this.connectTimer);
      this.isOpen = true;
      this.attempt = 0;
      this.logger.info(`Connected to ${this.url}`);
      this.heartbeatTimer = this.timers.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
      this.armSilenceTimer();
      this.emit('open');
    });

    socket.addEventListener('message', (event) => {
      if (socket !== this.socket) {
        return;
      }
      this.armSilenceTimer();
      const text = messageText(event.data);
      // The printer answers the heartbeat with a bare "ok".
      if (text.trim() === 'ok') {
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.logger.debug(`${this.url}: ignored a message that is not JSON`);
        return;
      }
      this.emit('message', parsed);
    });

    socket.addEventListener('error', (event) => {
      this.logger.debug(`${this.url}: socket error ${event?.message ?? ''}`.trim());
    });

    socket.addEventListener('close', () => this.handleClose(socket));
  }

  heartbeat() {
    try {
      this.send(heartbeatMessage());
    } catch (err) {
      this.logger.debug(`${this.url}: heartbeat not sent (${err.message})`);
    }
  }

  armSilenceTimer() {
    this.timers.clearTimeout(this.silenceTimer);
    this.silenceTimer = this.timers.setTimeout(() => {
      this.logger.warn(`${this.url}: silent for ${SILENCE_TIMEOUT_MS / 1000} s, reconnecting`);
      const socket = this.socket;
      this.closeSocket();
      this.handleClose(socket);
    }, SILENCE_TIMEOUT_MS);
  }

  handleClose(socket) {
    if (socket !== this.socket && this.socket !== null) {
      return;
    }
    const wasOpen = this.isOpen;
    this.clearLinkTimers();
    this.isOpen = false;
    this.socket = null;
    if (wasOpen) {
      this.logger.info(`Disconnected from ${this.url}`);
      this.emit('close');
    }
    if (!this.stopped) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.logger.debug(`${this.url}: next attempt in ${delay / 1000} s`);
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) {
        this.open();
      }
    }, delay);
  }

  clearLinkTimers() {
    this.timers.clearTimeout(this.connectTimer);
    this.timers.clearInterval(this.heartbeatTimer);
    this.timers.clearTimeout(this.silenceTimer);
    this.connectTimer = null;
    this.heartbeatTimer = null;
    this.silenceTimer = null;
  }

  closeSocket() {
    const socket = this.socket;
    const wasOpen = this.isOpen;
    this.clearLinkTimers();
    this.isOpen = false;
    this.socket = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        // Already closed: nothing to do.
      }
    }
    if (wasOpen) {
      this.emit('close');
    }
  }
}
