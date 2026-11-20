// -----------------------------------------------------------------------------
// Camera snapshots: the periodic push, the on-demand capture, and the last
// image of each printer kept for the dashboard widget.
//
// - Every minute, each reachable printer is asked for a still image, pushed to
//   its Gladys camera device (`publishCameraImage`, 12 images/minute allowed:
//   one a minute is far below). A printer that is not reachable is skipped.
// - `capture` takes a fresh one at once: the dashboard live view, the
//   `take_snapshot` scene action.
// - The widget shows the last image by key: the key changes with every image,
//   because the core caches a widget image one hour by key.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fetchSnapshot, toCameraImage } from './creality/camera.js';
import { cameraIds } from './devices.js';

const logger = createLogger({ name: 'snapshots' });

const SNAPSHOT_INTERVAL_MS = 60_000;

/** Largest image the core takes for a widget. */
const MAX_WIDGET_IMAGE_BYTES = 300 * 1024;

/**
 * @param {object} gladys SDK client
 * @param {object} fleet PrinterFleet
 * @param {{ fetchImpl?: typeof fetch, timers?: object }} [options]
 */
export function createSnapshots(gladys, fleet, { fetchImpl, timers = globalThis } = {}) {
  /** printer id -> { key, bytes } */
  const last = new Map();
  let sequence = 0;
  let interval = null;

  async function capture(entry, config) {
    const bytes = await fetchSnapshot({
      host: entry.printer.host,
      port: config.camera_port,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    sequence += 1;
    if (bytes.length <= MAX_WIDGET_IMAGE_BYTES) {
      last.set(entry.printer.id, { key: `snapshot-${entry.printer.id}-${sequence}`, bytes });
    }
    return toCameraImage(bytes);
  }

  async function pushAll(config) {
    for (const entry of fleet.list()) {
      if (!entry.connected) {
        continue;
      }
      try {
        const image = await capture(entry, config);
        await gladys.publishCameraImage(cameraIds(gladys, entry.printer).device, image);
      } catch (err) {
        logger.debug(`No snapshot from ${entry.printer.id}: ${err.message}`);
      }
    }
  }

  return {
    capture,

    /** Start (or restart) the periodic push, when the camera option is on. */
    start(config) {
      this.stop();
      if (!config.camera) {
        return;
      }
      interval = timers.setInterval(() => {
        pushAll(config).catch((err) => logger.warn(`Snapshot loop failed: ${err.message}`));
      }, SNAPSHOT_INTERVAL_MS);
    },

    stop() {
      timers.clearInterval(interval);
      interval = null;
    },

    /** Key of the last image of a printer, for the widget content. */
    lastKey(printerId) {
      return last.get(printerId)?.key ?? null;
    },

    /** Raw base64 of a widget image key, for onWidgetGetImage. */
    imageForKey(key) {
      for (const image of last.values()) {
        if (image.key === key) {
          return image.bytes.toString('base64');
        }
      }
      throw new Error(`Unknown or expired image: ${key}`);
    },

    pushAll,
  };
}
