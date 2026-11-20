// -----------------------------------------------------------------------------
// A fake printer WebSocket: what `PrinterConnection` gets in place of the
// global WebSocket in the tests. Every socket the code opens is recorded; the
// test plays the printer side with `accept`, `push` and `drop`, and reads the
// orders the code sent in `sent`.
// -----------------------------------------------------------------------------

/** A printer status as a K1 Max sends it right after the connection. */
export const K1_MAX_STATUS = {
  model: 'K1 Max',
  hostname: 'K1Max-4A2B',
  modelVersion: 'printer hw ver:;printer sw ver:;DWIN hw ver:CR4CU220812S11;DWIN sw ver:1.3.3.46;',
  state: 0,
  printProgress: 0,
  nozzleTemp: '24.870000',
  targetNozzleTemp: 0,
  bedTemp0: '23.510000',
  targetBedTemp0: 0,
  boxTemp: 22,
  printFileName: '',
  printJobTime: 0,
  printLeftTime: 0,
  lightSw: 0,
  err: { errcode: 0, key: 0 },
  layer: 0,
  TotalLayer: 0,
};

export function createFakePrinters() {
  const sockets = [];

  class FakeWebSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }

    send(text) {
      this.sent.push(JSON.parse(text));
    }

    close() {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.dispatchEvent(new Event('close'));
    }

    // --- The printer side, driven by the test --------------------------------

    accept() {
      this.dispatchEvent(new Event('open'));
    }

    push(message) {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      this.dispatchEvent(new MessageEvent('message', { data }));
    }

    drop() {
      this.closed = true;
      this.dispatchEvent(new Event('close'));
    }

    /** The orders sent, heartbeats left out. */
    get orders() {
      return this.sent.filter((message) => message.ModeCode !== 'heart_beat');
    }
  }

  return {
    FakeWebSocket,
    sockets,
    /** The last socket opened to an address (`192.168.1.40` or with port). */
    socketFor(host, port = 9999) {
      return sockets.filter((socket) => socket.url === `ws://${host}:${port}/`).at(-1);
    },
  };
}

/** Let the pending promise chains (async listeners) run. */
export function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A JPEG-looking buffer of `size` bytes. */
export function fakeJpeg(size = 2048) {
  const bytes = Buffer.alloc(size, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  return bytes;
}

/** A fetch answering every snapshot request with `bytes`, recording the URLs. */
export function fakeFetch(bytes = fakeJpeg()) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    };
  };
  return { fetchImpl, calls };
}
