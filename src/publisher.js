// -----------------------------------------------------------------------------
// Publishing the printer states to Gladys.
//
// A printing K1 pushes a message every second or so. Gladys takes 300 states
// per minute per integration, sized for changes, not for a stream: so the
// values that move all the time (temperatures, progress, times) are published
// at the refresh interval of the config, and only when they changed
// (`publishChangedStates`). The print state, the file and the light are
// published at once: a scene waiting for "completed" must not wait 30 s.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { printerStates } from './devices.js';

const logger = createLogger({ name: 'publisher' });

// Re-send an unchanged value every 30 minutes, so a stable value (a cold bed
// at 21 °C) stays recently dated in Gladys.
const HEARTBEAT_MS = 30 * 60 * 1000;

/**
 * @param {object} gladys SDK client
 * @param {{ now?: () => number }} [options]
 */
export function createPublisher(gladys, { now = Date.now } = {}) {
  const lastContinuous = new Map();

  return {
    /**
     * Publish the states of one printer.
     * @param {object} entry fleet entry (src/printers.js)
     * @param {{ refresh_interval: number }} config
     * @param {{ force?: boolean, stateChanged?: boolean }} [options] publish
     *   everything now (`stateChanged`: the print state just moved)
     */
    async publish(entry, config, { force = false, stateChanged = false } = {}) {
      const { discrete, continuous } = printerStates(gladys, entry.printer, entry.status);
      const last = lastContinuous.get(entry.printer.id);
      const due =
        force ||
        // A state change carries the final values (100 % at "completed").
        stateChanged ||
        last === undefined ||
        now() - last >= config.refresh_interval * 1000;
      const states = due ? [...discrete, ...continuous] : discrete;
      if (due && continuous.length > 0) {
        lastContinuous.set(entry.printer.id, now());
      }
      try {
        await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      } catch (err) {
        // Re-sent by the next call: publishChangedStates only remembers what
        // Gladys accepted.
        logger.warn(`States of ${entry.printer.id} not published: ${err.message}`);
      }
    },

    /** Forget a printer (removed from the config). */
    forget(printerId) {
      lastContinuous.delete(printerId);
    },
  };
}
