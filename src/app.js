// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client.
//
// `createApp(gladys)` registers every handler on the SDK client and returns
// the pieces the tests drive. index.js passes it the real client; the tests
// pass the SDK's fake Gladys and a fake printer WebSocket, so the whole path —
// printer message -> states, scene events, widget — runs without a network.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createActions } from './actions.js';
import { setLight } from './commands.js';
import { normalizeConfig, parsePrinters } from './config.js';
import { FEATURES, buildDiscoveredDevices, printerIds, transportEntries } from './devices.js';
import { localize } from './i18n.js';
import { applyLogLevel } from './logging.js';
import { PrinterFleet } from './printers.js';
import { createPublisher } from './publisher.js';
import { createSceneActions } from './scenes.js';
import { createSnapshots } from './snapshots.js';
import { TEXTS } from './texts.js';
import { detectEvents } from './triggers.js';
import { createWidgets, refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'app' });

const REACHABLE = {
  en: (n, total) => `${n} of ${total} printers reachable.`,
  fr: (n, total) => `${n} imprimante(s) joignable(s) sur ${total}.`,
  de: (n, total) => `${n} von ${total} Druckern erreichbar.`,
  es: (n, total) => `${n} de ${total} impresoras accesibles.`,
};

/**
 * @param {object} gladys SDK client (GladysIntegration or the fake Gladys)
 * @param {object} [options] injected by the tests
 * @param {typeof WebSocket} [options.WebSocketImpl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.timers]
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 */
export function createApp(gladys, { WebSocketImpl, fetchImpl, timers, now, sleep } = {}) {
  let config = normalizeConfig();
  const getConfig = () => config;

  const fleet = new PrinterFleet({ WebSocketImpl, timers });
  const publisher = createPublisher(gladys, { now });
  const snapshots = createSnapshots(gladys, fleet, { fetchImpl, timers });
  const context = { gladys, fleet, snapshots, getConfig };
  const sceneActions = createSceneActions(context);
  const widgets = createWidgets(context);
  const actions = createActions({ ...context, fetchImpl, sleep, timers });

  let lastConnectionStatus = null;

  async function publishDevices() {
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, fleet.list(), config));
  }

  async function publishTransports() {
    const entries = transportEntries(gladys, fleet.list(), config);
    if (entries.length > 0) {
      await gladys.publishTransports(entries);
    }
  }

  // The status shown in the Configuration screen, sent only when it changes.
  async function reportConnection() {
    const entries = fleet.list();
    const reachable = entries.filter((entry) => entry.connected).length;
    let status;
    if (entries.length === 0) {
      status = [false, TEXTS.noPrinter];
    } else if (reachable === 0) {
      status = [false, TEXTS.noneReachable];
    } else if (reachable < entries.length) {
      status = [true, localize((language) => REACHABLE[language](reachable, entries.length))];
    } else {
      status = [true];
    }
    const key = JSON.stringify(status);
    if (key === lastConnectionStatus) {
      return;
    }
    lastConnectionStatus = key;
    await gladys.setConnectionStatus(...status);
  }

  async function applyConfig(next) {
    config = next;
    applyLogLevel(config);
    const { printers, invalid } = parsePrinters(config.printers);
    for (const entry of invalid) {
      logger.warn(`Ignored printer entry "${entry}": not an address`);
    }
    const removed = fleet
      .list()
      .filter((entry) => !printers.some((p) => p.id === entry.printer.id));
    removed.forEach((entry) => publisher.forget(entry.printer.id));
    fleet.configure(printers);
    fleet.startAll();
    snapshots.start(config);
    await publishDevices();
    await publishTransports();
    await reportConnection();
    refreshWidgets(gladys);
  }

  // --- Printer events ---------------------------------------------------------

  fleet.on('status', (entry, previous) => {
    // Computed now, before any await: the printer keeps talking meanwhile.
    const events = detectEvents(gladys, entry);
    const stateChanged = previous.state !== entry.status.state;
    const widgetChanged =
      stateChanged ||
      previous.light !== entry.status.light ||
      previous.errorCode !== entry.status.errorCode ||
      previous.fileName !== entry.status.fileName;
    const learnedModel = Boolean(entry.status.model) && entry.status.model !== previous.model;

    (async () => {
      await publisher.publish(entry, config, { stateChanged });
      for (const { key, data } of events) {
        logger.info(`Scene event ${key} <- ${entry.printer.id} ${JSON.stringify(data)}`);
        await gladys
          .publishSceneEvent(key, data)
          .catch((err) => logger.warn(`Scene event ${key} refused: ${err.message}`));
      }
      if (widgetChanged) {
        refreshWidgets(gladys);
      }
      // The discovery list names a printer by its model once it is known.
      if (learnedModel && !entry.printer.name) {
        await publishDevices();
      }
    })().catch((err) => logger.error(`Status of ${entry.printer.id} not handled`, err));
  });

  fleet.on('connection', () => {
    (async () => {
      await publishTransports();
      await reportConnection();
      refreshWidgets(gladys);
    })().catch((err) => logger.error('Connection change not handled', err));
  });

  // --- Gladys handlers ----------------------------------------------------------

  gladys.onScanRequest(async () => {
    await publishDevices();
  });

  gladys.onSetValue(async (device, feature, value) => {
    const entry = fleet.findByExternalId(gladys, device.external_id);
    if (!entry) {
      throw new Error(`Not a configured printer: ${device.external_id}`);
    }
    if (feature.external_id !== printerIds(gladys, entry.printer).feature(FEATURES.LIGHT)) {
      throw new Error(`Feature ${feature.external_id} cannot be controlled`);
    }
    // No state published here: the printer pushes `lightSw` back once done,
    // and that confirmed value is what Gladys shows (has_feedback).
    setLight(fleet, entry, Number(value) === 1);
  });

  gladys.onGetImage(async (device) => {
    const entry = fleet.findByExternalId(gladys, device.external_id);
    if (!entry) {
      throw new Error(`Not a configured printer: ${device.external_id}`);
    }
    if (!config.camera) {
      throw new Error('The camera option is off');
    }
    return snapshots.capture(entry, config);
  });

  for (const [key, handler] of Object.entries(actions)) {
    gladys.onAction(key, (fields) => handler(fields));
  }

  for (const [key, handler] of Object.entries(sceneActions)) {
    gladys.onSceneAction(key, (fields) => handler(fields));
  }

  for (const [key, widget] of Object.entries(widgets)) {
    gladys.onWidgetGet(key, (request) => widget.get(request));
    gladys.onWidgetAction(key, (actionKey, params) => widget.action(actionKey, params));
  }
  gladys.onWidgetGetImage(async (imageKey) => snapshots.imageForKey(imageKey));

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    await applyConfig(normalizeConfig(newConfig));
  });

  gladys.on('connected', async () => {
    // A Gladys that restarted forgot the status: send it again.
    lastConnectionStatus = null;
    try {
      await applyConfig(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
          de: 'Initialisierung fehlgeschlagen, prüfe die Protokolle der Integration.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  function stop() {
    snapshots.stop();
    fleet.stopAll();
  }

  return { gladys, fleet, snapshots, getConfig, stop };
}
