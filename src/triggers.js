// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`, Gladys 5.1+).
//
// Three things HAPPEN to a printer that a scene wants to follow:
//   - `print_state_changed`: printing, paused, completed, failed, stopped...;
//   - `print_progress`: the print reached 25, 50, 75 or 90 %;
//   - `printer_error`: the printer raised an error code.
//
// One event per transition, never one per message: the printer repeats its
// state every second. And no event born from a restart or a reconnection: a
// printer found "printing" when the integration starts was not just started,
// so the first state seen is only remembered (see `memory` in printers.js).
// The offline/unknown states are not print states: they never fire, and the
// state before them is kept, so "printing -> offline -> completed" still fires
// "completed" once the printer is back.
//
// `data` is flat and only carries the keys the manifest declares (fields and
// variables): the core drops any other one.
// -----------------------------------------------------------------------------

import { PRINT_STATES } from './creality/protocol.js';
import { printerIds, printerName } from './devices.js';

export const TRIGGERS = {
  STATE_CHANGED: 'print_state_changed',
  PROGRESS: 'print_progress',
  ERROR: 'printer_error',
};

/** Every trigger key the code fires (test/manifest.test.js checks them). */
export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

/** The progress steps a scene can wait for. */
export const PROGRESS_THRESHOLDS = [25, 50, 75, 90];

const NOT_PRINT_STATES = new Set([PRINT_STATES.OFFLINE, PRINT_STATES.UNKNOWN]);

// States a new print job starts from.
const JOB_START_FROM = new Set([
  PRINT_STATES.IDLE,
  PRINT_STATES.COMPLETED,
  PRINT_STATES.FAILED,
  PRINT_STATES.STOPPED,
]);

function minutes(seconds) {
  return seconds === null ? null : Math.round(seconds / 60);
}

/**
 * The scene events of one status update, updating the entry memory.
 *
 * @param {object} gladys SDK client (for the device external id)
 * @param {object} entry fleet entry, its `status` already updated
 * @returns {Array<{ key: string, data: Record<string, string|number|null> }>}
 */
export function detectEvents(gladys, entry) {
  const { status, memory, printer } = entry;
  const device = printerIds(gladys, printer).device;
  const deviceName = printerName(printer, status);
  const events = [];

  if (!NOT_PRINT_STATES.has(status.state)) {
    const previous = memory.knownState;
    const newJob =
      status.state === PRINT_STATES.PRINTING &&
      (JOB_START_FROM.has(previous) ||
        (memory.fileName !== null && status.fileName !== memory.fileName));

    if (previous !== null && previous !== status.state) {
      events.push({
        key: TRIGGERS.STATE_CHANGED,
        data: {
          device,
          state: status.state,
          device_name: deviceName,
          previous_state: previous,
          file_name: status.fileName,
          progress: status.progress,
        },
      });
    }

    if (previous === null) {
      // First sight of this printer: the steps it already passed are not news.
      memory.thresholds = new Set(
        PROGRESS_THRESHOLDS.filter((step) => (status.progress ?? 0) >= step),
      );
    } else if (newJob) {
      memory.thresholds = new Set();
    }

    if (status.state === PRINT_STATES.PRINTING && status.progress !== null) {
      const reached = PROGRESS_THRESHOLDS.filter(
        (step) => status.progress >= step && !memory.thresholds.has(step),
      );
      // A jump over several steps (the link was down for a while) is one
      // event, for the highest step: three notifications at once help nobody.
      if (reached.length > 0) {
        const step = Math.max(...reached);
        reached.forEach((value) => memory.thresholds.add(value));
        events.push({
          key: TRIGGERS.PROGRESS,
          data: {
            device,
            threshold: String(step),
            device_name: deviceName,
            progress: status.progress,
            file_name: status.fileName,
            time_left: minutes(status.leftSeconds),
          },
        });
      }
    }

    memory.knownState = status.state;
    if (status.fileName !== null) {
      memory.fileName = status.fileName;
    }
  }

  if (status.state !== PRINT_STATES.OFFLINE) {
    const previousError = memory.errorCode;
    if (previousError !== null && previousError === 0 && status.errorCode !== 0) {
      events.push({
        key: TRIGGERS.ERROR,
        data: { device, device_name: deviceName, error_code: status.errorCode },
      });
    }
    memory.errorCode = status.errorCode;
  }

  return events;
}
