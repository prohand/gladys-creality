// -----------------------------------------------------------------------------
// Dashboard widget `printer` (manifest `widgets`, Gladys 5.1+).
//
// One card per printer (the `device` setting picks it; empty = the first one):
//   - a progress gauge and the nozzle / bed tiles, bound to the device
//     features: LIVE, they follow the published states with no refresh;
//   - the last camera image, when the camera option is on;
//   - a status list computed here: state, file, time left, layer, error;
//   - buttons: pause or resume, stop (with a confirmation), and the light.
//
// The content is declarative: the core renders it with its own theme and
// picks the language of every `{ en, fr, de, es }` text. The budget (8
// components, 6 tiles, 1 focal, 1 status, 4 buttons) is checked by the tests
// with `validateWidgetContent`.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { sendPrintCommand } from './commands.js';
import { ACTIVE_STATES, PRINT_COMMANDS, PRINT_STATES } from './creality/protocol.js';
import { FEATURES, printerIds, printerName } from './devices.js';
import { COMMAND_RESULTS, STATE_LABELS, TEXTS, formatDuration } from './texts.js';

const logger = createLogger({ name: 'widgets' });

export const PRINTER_WIDGET = 'printer';

const STATE_COLORS = {
  [PRINT_STATES.IDLE]: WIDGET_COLORS.NEUTRAL,
  [PRINT_STATES.PRINTING]: WIDGET_COLORS.PRIMARY,
  [PRINT_STATES.PAUSED]: WIDGET_COLORS.WARNING,
  [PRINT_STATES.COMPLETED]: WIDGET_COLORS.SUCCESS,
  [PRINT_STATES.FAILED]: WIDGET_COLORS.DANGER,
  [PRINT_STATES.STOPPED]: WIDGET_COLORS.WARNING,
  [PRINT_STATES.OFFLINE]: WIDGET_COLORS.DANGER,
  [PRINT_STATES.UNKNOWN]: WIDGET_COLORS.NEUTRAL,
};

// Status values are capped at 40 characters by the core.
function short(text, max = 40) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * @param {{ gladys: object, fleet: object, snapshots: object, getConfig: () => object }} context
 */
export function createWidgets({ gladys, fleet, snapshots, getConfig }) {
  function chooseEntry(settings) {
    return fleet.findByExternalId(gladys, settings?.device) ?? fleet.list()[0];
  }

  function content(entry, config) {
    const { printer, status } = entry;
    const ids = printerIds(gladys, printer);
    const active = ACTIVE_STATES.has(status.state);

    const components = [
      {
        type: 'gauge',
        label: TEXTS.progress,
        device_feature: ids.feature(FEATURES.PROGRESS),
        min: 0,
        max: 100,
        unit: '%',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        label: TEXTS.nozzle,
        icon: 'thermometer',
        device_feature: ids.feature(FEATURES.NOZZLE),
      },
      {
        type: 'value',
        label: TEXTS.bed,
        icon: 'thermometer',
        device_feature: ids.feature(FEATURES.BED),
      },
    ];

    const imageKey = config.camera ? snapshots.lastKey(printer.id) : null;
    if (imageKey) {
      components.push({ type: 'image', key: imageKey, alt: TEXTS.snapshot, fit: 'contain' });
    }

    const items = [
      { label: TEXTS.printer, icon: 'printer', value: short(printerName(printer, status)) },
      {
        label: TEXTS.state,
        icon: 'activity',
        value: STATE_LABELS[status.state],
        color: STATE_COLORS[status.state],
      },
    ];
    if (active || status.state === PRINT_STATES.COMPLETED) {
      items.push({ label: TEXTS.file, icon: 'file', value: short(status.fileName ?? '-') });
    }
    if (active) {
      items.push({
        label: TEXTS.timeLeft,
        icon: 'clock',
        value: formatDuration(status.leftSeconds),
      });
      if (status.layer !== null && status.totalLayers) {
        items.push({
          label: TEXTS.layer,
          icon: 'layers',
          value: `${status.layer} / ${status.totalLayers}`,
        });
      }
    }
    if (status.errorCode !== 0 && status.state !== PRINT_STATES.OFFLINE) {
      items.push({
        label: TEXTS.error,
        icon: 'alert-triangle',
        value: status.errorCode,
        color: WIDGET_COLORS.DANGER,
      });
    }
    components.push({ type: 'status', items });

    // `params` are declared here and sent back as is: the handler never
    // receives user input (a dashboard can hang on a public wall).
    const params = { printer: printer.id };
    if (status.state === PRINT_STATES.PRINTING) {
      components.push({
        type: 'button',
        label: TEXTS.pause,
        icon: 'pause',
        style: 'secondary',
        action: { key: PRINT_COMMANDS.PAUSE, params },
      });
    }
    if (status.state === PRINT_STATES.PAUSED) {
      components.push({
        type: 'button',
        label: TEXTS.resume,
        icon: 'play',
        style: 'primary',
        action: { key: PRINT_COMMANDS.RESUME, params },
      });
    }
    if (active) {
      components.push({
        type: 'button',
        label: TEXTS.stop,
        icon: 'square',
        style: 'danger',
        // A stopped print cannot be resumed: ask first.
        action: { key: PRINT_COMMANDS.STOP, params, confirm: true },
      });
    }
    if (entry.connected && status.light !== null) {
      components.push({
        type: 'button',
        label: status.light === 1 ? TEXTS.lightOff : TEXTS.lightOn,
        icon: 'sun',
        style: 'secondary',
        device_feature: ids.feature(FEATURES.LIGHT),
        value: status.light === 1 ? 0 : 1,
      });
    }

    return {
      // The live tiles need no refresh; the computed rows are nudged on every
      // state change (index.js), the TTL is the safety net for the rest.
      ttl_seconds: 60,
      components,
    };
  }

  return {
    [PRINTER_WIDGET]: {
      async get({ settings }) {
        logger.debug(`onWidgetGet <- ${PRINTER_WIDGET}`);
        const entry = chooseEntry(settings);
        if (!entry) {
          return { ttl_seconds: 300, components: [{ type: 'text', text: TEXTS.noPrinter }] };
        }
        return content(entry, getConfig());
      },

      async action(actionKey, params) {
        logger.info(`onWidgetAction <- ${PRINTER_WIDGET}.${actionKey}`);
        if (!Object.values(PRINT_COMMANDS).includes(actionKey)) {
          // Throwing acks the action as failed: the message reaches the user.
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        const entry = fleet.get(params?.printer);
        if (!entry) {
          return TEXTS.unknownDevice;
        }
        const { reason } = sendPrintCommand(fleet, entry, actionKey);
        if (reason === 'offline') {
          return TEXTS.offline;
        }
        return reason === 'sent' ? COMMAND_RESULTS[actionKey] : COMMAND_RESULTS.not_allowed;
      },
    },
  };
}

/** Widget keys the code handles (test/manifest.test.js). */
export const WIDGET_KEYS = [PRINTER_WIDGET];

/**
 * Ask the core to re-pull every widget now, instead of waiting for the TTL.
 * Fire-and-forget, rate-limited core-side (1 per 10 s per widget).
 */
export function refreshWidgets(gladys) {
  for (const key of WIDGET_KEYS) {
    gladys.requestWidgetRefresh(key);
  }
}
