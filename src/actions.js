// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
//   - `test_connection`: one line per printer (reachable or not, model, state,
//     temperatures, camera), plus the entries of the list that are not an
//     address. Waits a few seconds for the links still opening: the button is
//     usually clicked right after saving the configuration.
//   - `identify`: blink the light of the chosen printer.
//
// The answer is shown under the button, in the reader's language.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { blinkLight } from './commands.js';
import { fetchSnapshot } from './creality/camera.js';
import { parsePrinters } from './config.js';
import { printerName } from './devices.js';
import { localize, pick } from './i18n.js';
import { STATE_LABELS, TEXTS } from './texts.js';

const logger = createLogger({ name: 'actions' });

const WAIT_FOR_PRINTERS_MS = 5_000;

const WORDS = {
  reachable: { en: 'reachable', fr: 'joignable', de: 'erreichbar', es: 'accesible' },
  unreachable: {
    en: 'not reachable on port',
    fr: 'injoignable sur le port',
    de: 'nicht erreichbar auf Port',
    es: 'inaccesible en el puerto',
  },
  nozzle: { en: 'nozzle', fr: 'buse', de: 'Düse', es: 'boquilla' },
  bed: { en: 'bed', fr: 'plateau', de: 'Bett', es: 'cama' },
  camera: { en: 'camera', fr: 'caméra', de: 'Kamera', es: 'cámara' },
  cameraOk: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  cameraFailed: { en: 'no image', fr: "pas d'image", de: 'kein Bild', es: 'sin imagen' },
  invalid: {
    en: 'Not an address, ignored',
    fr: "Ce n'est pas une adresse, ignoré",
    de: 'Keine Adresse, ignoriert',
    es: 'No es una dirección, ignorada',
  },
};

function temperatures(status, language) {
  const parts = [];
  if (status.nozzleTemp !== null) {
    parts.push(`${pick(language, WORDS.nozzle)} ${status.nozzleTemp} °C`);
  }
  if (status.bedTemp !== null) {
    parts.push(`${pick(language, WORDS.bed)} ${status.bedTemp} °C`);
  }
  return parts.join(', ');
}

/**
 * @param {{ gladys: object, fleet: object, getConfig: () => object, fetchImpl?: typeof fetch, sleep?: Function, timers?: object }} context
 */
export function createActions({ gladys, fleet, getConfig, fetchImpl, sleep, timers }) {
  return {
    async test_connection() {
      const config = getConfig();
      const { invalid } = parsePrinters(config.printers);
      const entries = fleet.list();
      if (entries.length === 0 && invalid.length === 0) {
        return TEXTS.noPrinter;
      }
      await Promise.all(
        entries.map((entry) => fleet.waitForStatus(entry, WAIT_FOR_PRINTERS_MS, timers)),
      );

      const cameras = new Map();
      if (config.camera) {
        for (const entry of entries.filter((item) => item.connected)) {
          try {
            const bytes = await fetchSnapshot({
              host: entry.printer.host,
              port: config.camera_port,
              ...(fetchImpl ? { fetchImpl } : {}),
            });
            cameras.set(entry.printer.id, `${Math.round(bytes.length / 1024)} KB`);
          } catch (err) {
            logger.info(`Camera test of ${entry.printer.id}: ${err.message}`);
            cameras.set(entry.printer.id, null);
          }
        }
      }

      return localize((language) => {
        const lines = entries.map(({ printer, status, connected }) => {
          const name = printerName(printer, status);
          if (!connected) {
            return `✗ ${name}: ${pick(language, WORDS.unreachable)} ${printer.port}`;
          }
          const details = [
            pick(language, WORDS.reachable),
            status.model,
            pick(language, STATE_LABELS[status.state]),
            temperatures(status, language),
          ].filter(Boolean);
          if (cameras.has(printer.id)) {
            const size = cameras.get(printer.id);
            details.push(
              `${pick(language, WORDS.camera)} ${size ? `${pick(language, WORDS.cameraOk)} (${size})` : pick(language, WORDS.cameraFailed)}`,
            );
          }
          return `✓ ${name}: ${details.join(', ')}`;
        });
        for (const entry of invalid) {
          lines.push(`✗ "${entry}": ${pick(language, WORDS.invalid)}`);
        }
        return lines.join('\n');
      });
    },

    async identify(fields) {
      const entry = fleet.findByExternalId(gladys, fields.device);
      if (!entry) {
        return TEXTS.unknownDevice;
      }
      logger.info(`Action identify <- ${entry.printer.id}`);
      const blinked = await blinkLight(fleet, entry, sleep ? { sleep } : {});
      return blinked ? TEXTS.blinking : TEXTS.offline;
    },
  };
}

/** Manifest action keys the code handles (test/manifest.test.js). */
export const ACTION_KEYS = ['test_connection', 'identify'];
