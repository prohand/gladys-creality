// -----------------------------------------------------------------------------
// The log level, switchable from the Configuration screen.
//
// The SDK logger re-reads `process.env.LOG_LEVEL` on every line, so writing
// that variable is enough: it takes effect at once, for every logger already
// created, the SDK's own connection logs included. No restart.
//
// An operator who set `LOG_LEVEL` on the container keeps it: their value is
// the baseline, read once at startup, and comes back when the switch goes off.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'logging' });

const BASELINE = process.env.LOG_LEVEL;

/**
 * Apply the log level a configuration asks for.
 * @param {{ debug_logs: boolean }} config
 * @returns {string} the level in force afterwards
 */
export function applyLogLevel(config) {
  const wanted = config?.debug_logs ? 'debug' : BASELINE;
  const current = process.env.LOG_LEVEL;
  if (wanted === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = wanted;
  }
  if (current !== process.env.LOG_LEVEL) {
    logger.info(
      config?.debug_logs
        ? 'Detailed logs turned on: every order sent to the printers is logged'
        : `Detailed logs turned off (level: ${process.env.LOG_LEVEL ?? 'info'})`,
    );
  }
  return process.env.LOG_LEVEL ?? 'info';
}
