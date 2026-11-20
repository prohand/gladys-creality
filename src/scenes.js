// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
//   - `control_print`: pause, resume or stop the print of a printer;
//   - `take_snapshot`: publish a fresh camera image, for the core's "send a
//     camera image" action that usually follows.
//
// The fields arrive RESOLVED (scene variables substituted, validated by the
// core); a `"source": "devices"` field is the chosen device external id, the
// printer device or its camera. A printer that is unreachable, or a pause
// asked while nothing prints, is an OUTPUT (`sent: false`), not a failure: a
// scene action is never a condition, the scene author gates on the output.
// Only a device that is not a configured printer fails the action.
// Never fire a scene event from here: a scene bound to it would loop.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { sendPrintCommand } from './commands.js';
import { PRINT_COMMANDS } from './creality/protocol.js';
import { cameraIds } from './devices.js';

const logger = createLogger({ name: 'scenes' });

/**
 * @param {{ gladys: object, fleet: object, snapshots: object, getConfig: () => object }} context
 */
export function createSceneActions({ gladys, fleet, snapshots, getConfig }) {
  function printerOf(externalId) {
    const entry = fleet.findByExternalId(gladys, externalId);
    if (!entry) {
      throw new Error(`Not a configured printer: ${externalId}`);
    }
    return entry;
  }

  return {
    async control_print(fields) {
      const entry = printerOf(fields.device);
      const command = fields.command;
      if (!Object.values(PRINT_COMMANDS).includes(command)) {
        throw new Error(`Unknown print command: ${command}`);
      }
      logger.info(`Scene action control_print <- ${entry.printer.id} ${command}`);
      const { sent, state } = sendPrintCommand(fleet, entry, command);
      return { sent, state };
    },

    async take_snapshot(fields) {
      const entry = printerOf(fields.device);
      const config = getConfig();
      if (!config.camera || !entry.connected) {
        return { captured: false };
      }
      try {
        const image = await snapshots.capture(entry, config);
        await gladys.publishCameraImage(cameraIds(gladys, entry.printer).device, image);
        return { captured: true };
      } catch (err) {
        logger.warn(`Snapshot of ${entry.printer.id} failed: ${err.message}`);
        return { captured: false };
      }
    },
  };
}

/** The scene action keys the code handles (test/manifest.test.js). */
export const SCENE_ACTION_KEYS = ['control_print', 'take_snapshot'];
