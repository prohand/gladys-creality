// -----------------------------------------------------------------------------
// The local protocol of the Creality OS printers (K1, K1C, K1 Max, K1 SE, K2,
// Ender-3 V3, Ender-3 V3 KE, Hi...).
//
// Those printers serve a WebSocket on port 9999 of the LAN. Nothing to log in
// to: the printer pushes JSON objects, each one carrying ONLY the fields that
// changed, and accepts `{ "method": "set", "params": {...} }` commands. Creality
// does not document it: the field names below are the ones the printers send
// and the community integrations read (Home Assistant, Moonraker bridges). So
// the code is tolerant on purpose: numbers may arrive as strings
// ("25.330000"), a field may be missing on a model (no chamber on a K1C), and
// an unknown state code reads as `unknown`, never as a crash.
// -----------------------------------------------------------------------------

/** The print states this integration knows, as published to Gladys. */
export const PRINT_STATES = {
  IDLE: 'idle',
  PRINTING: 'printing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

// `state` field of the printer -> print state.
const STATE_CODES = {
  0: PRINT_STATES.IDLE,
  1: PRINT_STATES.PRINTING,
  2: PRINT_STATES.COMPLETED,
  3: PRINT_STATES.FAILED,
  4: PRINT_STATES.STOPPED,
  5: PRINT_STATES.PAUSED,
};

/** The states during which a print job exists (it can be paused or stopped). */
export const ACTIVE_STATES = new Set([PRINT_STATES.PRINTING, PRINT_STATES.PAUSED]);

/** A finite number from a number or a numeric string, else `null`. */
function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Round to one decimal: the printers send 6 decimals of noise. */
function round1(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

/** The file name without its folder: the printer sends a full path. */
function baseName(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    return null;
  }
  return path.split('/').filter(Boolean).pop() ?? null;
}

/**
 * Merge one pushed message into the raw state of the printer. The printer
 * only sends the fields that changed, so the state is the sum of every
 * message since the connection.
 */
export function mergeRaw(raw, message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return raw;
  }
  return { ...raw, ...message };
}

/**
 * The normalized status of a printer, from its merged raw state.
 *
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   state: string, progress: number|null, nozzleTemp: number|null,
 *   nozzleTarget: number|null, bedTemp: number|null, bedTarget: number|null,
 *   chamberTemp: number|null, fileName: string|null, elapsedSeconds: number|null,
 *   leftSeconds: number|null, light: number|null, errorCode: number,
 *   model: string|null, hostname: string|null, firmware: string|null,
 *   layer: number|null, totalLayers: number|null
 * }}
 */
export function normalizeStatus(raw = {}) {
  const code = toNumber(raw.state);
  const progress = toNumber(raw.printProgress);
  const light = toNumber(raw.lightSw);
  const errorCode = toNumber(raw.err?.errcode) ?? 0;
  return {
    state: code === null ? PRINT_STATES.UNKNOWN : (STATE_CODES[code] ?? PRINT_STATES.UNKNOWN),
    progress: progress === null ? null : Math.min(100, Math.max(0, Math.round(progress))),
    nozzleTemp: round1(toNumber(raw.nozzleTemp)),
    nozzleTarget: round1(toNumber(raw.targetNozzleTemp)),
    bedTemp: round1(toNumber(raw.bedTemp0)),
    bedTarget: round1(toNumber(raw.targetBedTemp0)),
    chamberTemp: round1(toNumber(raw.boxTemp)),
    fileName: baseName(raw.printFileName),
    elapsedSeconds: toNumber(raw.printJobTime),
    leftSeconds: toNumber(raw.printLeftTime),
    light: light === null ? null : light ? 1 : 0,
    errorCode,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : null,
    hostname: typeof raw.hostname === 'string' && raw.hostname.trim() ? raw.hostname.trim() : null,
    firmware:
      typeof raw.modelVersion === 'string' && raw.modelVersion.trim()
        ? raw.modelVersion.trim()
        : null,
    layer: toNumber(raw.layer),
    totalLayers: toNumber(raw.TotalLayer),
  };
}

/** The status of a printer the integration cannot reach. */
export function offlineStatus(previous) {
  return { ...normalizeStatus({}), ...pickIdentity(previous), state: PRINT_STATES.OFFLINE };
}

function pickIdentity(status) {
  return status
    ? { model: status.model, hostname: status.hostname, firmware: status.firmware }
    : {};
}

// --- Commands ----------------------------------------------------------------

/** The print commands the scene action and the widget can send. */
export const PRINT_COMMANDS = {
  PAUSE: 'pause',
  RESUME: 'resume',
  STOP: 'stop',
};

/** `set` message switching the printer light on (1) or off (0). */
export function lightCommand(on) {
  return { method: 'set', params: { lightSw: on ? 1 : 0 } };
}

/** `set` message of a print command (pause, resume, stop). */
export function printCommand(command) {
  switch (command) {
    case PRINT_COMMANDS.PAUSE:
      return { method: 'set', params: { pause: 1 } };
    case PRINT_COMMANDS.RESUME:
      return { method: 'set', params: { pause: 0 } };
    case PRINT_COMMANDS.STOP:
      return { method: 'set', params: { stop: 1 } };
    default:
      throw new Error(`Unknown print command: ${command}`);
  }
}

/**
 * Whether a command makes sense in a state: pausing a printer that does not
 * print does nothing on the printer, so the integration says it instead of
 * sending it.
 */
export function commandAllowed(command, state) {
  switch (command) {
    case PRINT_COMMANDS.PAUSE:
      return state === PRINT_STATES.PRINTING;
    case PRINT_COMMANDS.RESUME:
      return state === PRINT_STATES.PAUSED;
    case PRINT_COMMANDS.STOP:
      return ACTIVE_STATES.has(state);
    default:
      return false;
  }
}

/** Heartbeat message: the printer closes a silent socket after a while. */
export function heartbeatMessage(now = new Date()) {
  return { ModeCode: 'heart_beat', msg: now.toISOString() };
}
