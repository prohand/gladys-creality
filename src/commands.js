// -----------------------------------------------------------------------------
// Orders to a printer, written once and reached from several surfaces: the
// light feature (onSetValue), the `control_print` scene action, the widget
// buttons and the `identify` action.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { commandAllowed, lightCommand, printCommand } from './creality/protocol.js';

const logger = createLogger({ name: 'commands' });

const BLINK_COUNT = 3;
const BLINK_STEP_MS = 700;

/**
 * Send a print command (pause, resume, stop) when it makes sense.
 *
 * @returns {{ sent: boolean, reason: 'sent'|'offline'|'not_allowed', state: string }}
 */
export function sendPrintCommand(fleet, entry, command) {
  const { state } = entry.status;
  if (!entry.connected) {
    return { sent: false, reason: 'offline', state };
  }
  if (!commandAllowed(command, state)) {
    logger.info(`${command} ignored on ${entry.printer.id}: the printer is ${state}`);
    return { sent: false, reason: 'not_allowed', state };
  }
  fleet.send(entry, printCommand(command));
  logger.info(`${command} sent to ${entry.printer.id}`);
  return { sent: true, reason: 'sent', state };
}

/** Switch the printer light. Throws when the printer is not connected. */
export function setLight(fleet, entry, on) {
  fleet.send(entry, lightCommand(on));
}

/**
 * Make a printer signal itself: blink its light, then put it back as it was.
 * Resolves `false` when the printer is not connected.
 */
export async function blinkLight(fleet, entry, { sleep = defaultSleep } = {}) {
  if (!entry.connected) {
    return false;
  }
  const initial = entry.status.light === 1;
  for (let i = 0; i < BLINK_COUNT; i += 1) {
    setLight(fleet, entry, !initial);
    await sleep(BLINK_STEP_MS);
    setLight(fleet, entry, initial);
    await sleep(BLINK_STEP_MS);
  }
  return true;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
