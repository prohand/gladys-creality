// -----------------------------------------------------------------------------
// Entry point of the Creality integration for Gladys Assistant.
//
// SDK wiring only: the integration itself lives in src/app.js, which registers
// every handler BEFORE connect(). The Gladys supervisor injects
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and GLADYS_INTEGRATION_SELECTOR
// into the container; the SDK reads them, so `new GladysIntegration()` is
// enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const app = createApp(gladys);

// SIGTERM/SIGINT from the supervisor: close the printer links, then the SDK
// disconnects cleanly and exits with code 0.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the Creality integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
