// -----------------------------------------------------------------------------
// The Gladys devices of a printer.
//
// One `printer` device per configured printer: print state, progress, file,
// times, the three temperatures and the light. Plus one `camera` device per
// printer when the camera option is on: Gladys renders a camera from a device
// of its own, and a printer without a camera would otherwise carry an image
// feature that never shows anything.
//
// Rules that matter here:
// - external ids are built with `gladys.externalIds(type, printer.id)`, the
//   printer id coming from its address (see printerId in src/config.js):
//   Gladys keys the device, its history and the scenes on them, forever;
// - every feature carries `name`, `min`, `max`, `read_only` and
//   `has_feedback` (NOT NULL in Gladys): text and image features use 0/0;
// - the nozzle, bed and chamber temperatures are `probe` temperatures: they
//   must never be counted in the temperature of the room the printer sits in.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { PRINT_STATES } from './creality/protocol.js';

export const PRINTER_TYPE = 'printer';
export const CAMERA_TYPE = 'camera';

export const FEATURES = {
  STATE: 'state',
  PROGRESS: 'progress',
  FILE: 'file',
  TIME_LEFT: 'time-left',
  ELAPSED: 'elapsed-time',
  NOZZLE: 'nozzle-temperature',
  BED: 'bed-temperature',
  CHAMBER: 'chamber-temperature',
  LIGHT: 'light',
  IMAGE: 'image',
};

// A print rarely lasts more than a few days; the range only bounds the charts.
const MAX_MINUTES = 7 * 24 * 60;

/** Ids of the printer device and its features. */
export function printerIds(gladys, printer) {
  return gladys.externalIds(PRINTER_TYPE, printer.id);
}

/** Ids of the camera device of a printer. */
export function cameraIds(gladys, printer) {
  return gladys.externalIds(CAMERA_TYPE, printer.id);
}

/** The name shown in Gladys: the one the user typed, else model + address. */
export function printerName(printer, status) {
  if (printer.name) {
    return printer.name;
  }
  const model = status?.model ? `Creality ${status.model}` : 'Creality';
  return `${model} (${printer.host})`;
}

function temperatureFeature(ids, key, name, max) {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
    type: DEVICE_FEATURE_TYPES.TEMPERATURE_SENSOR.PROBE,
    unit: DEVICE_FEATURE_UNITS.CELSIUS,
    min: 0,
    max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

function textFeature(ids, key, name) {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

function minutesFeature(ids, key, name) {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    min: 0,
    max: MAX_MINUTES,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

/** Discovery payload of one printer. */
export function buildPrinterDevice(gladys, printer, status) {
  const ids = printerIds(gladys, printer);
  return {
    name: printerName(printer, status),
    external_id: ids.device,
    features: [
      textFeature(ids, FEATURES.STATE, 'Print state'),
      {
        name: 'Print progress',
        external_id: ids.feature(FEATURES.PROGRESS),
        // Gladys has no "progress" category: `unknown` keeps it out of every
        // aggregate (room temperature, energy...) while showing the value.
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.UNKNOWN.UNKNOWN,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        min: 0,
        max: 100,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      textFeature(ids, FEATURES.FILE, 'Printed file'),
      minutesFeature(ids, FEATURES.TIME_LEFT, 'Time left'),
      minutesFeature(ids, FEATURES.ELAPSED, 'Print time'),
      temperatureFeature(ids, FEATURES.NOZZLE, 'Nozzle temperature', 350),
      temperatureFeature(ids, FEATURES.BED, 'Bed temperature', 150),
      temperatureFeature(ids, FEATURES.CHAMBER, 'Chamber temperature', 100),
      {
        name: 'Light',
        external_id: ids.feature(FEATURES.LIGHT),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        // The printer pushes `lightSw` back once switched: the published state
        // is the one the printer confirms.
        has_feedback: true,
        keep_history: false,
      },
    ],
  };
}

/** Discovery payload of the camera of one printer. */
export function buildCameraDevice(gladys, printer, status) {
  const ids = cameraIds(gladys, printer);
  return {
    name: `${printerName(printer, status)} – camera`,
    external_id: ids.device,
    features: [
      {
        name: 'Image',
        external_id: ids.feature(FEATURES.IMAGE),
        category: DEVICE_FEATURE_CATEGORIES.CAMERA,
        type: DEVICE_FEATURE_TYPES.CAMERA.IMAGE,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}

/**
 * Discovery payload of every printer.
 * @param {object} gladys
 * @param {Array<{ printer: object, status: object }>} entries see src/printers.js
 * @param {{ camera: boolean }} config
 */
export function buildDiscoveredDevices(gladys, entries, config) {
  return entries.flatMap(({ printer, status }) => [
    buildPrinterDevice(gladys, printer, status),
    ...(config.camera ? [buildCameraDevice(gladys, printer, status)] : []),
  ]);
}

/** Seconds -> whole minutes, `null` kept. */
function minutes(seconds) {
  return seconds === null ? null : Math.round(seconds / 60);
}

/**
 * The states of a printer, split in two: the `discrete` ones (state, file,
 * light) change rarely and are published at once; the `continuous` ones
 * (temperatures, progress, times) move all the time and are published at the
 * refresh interval (see src/publisher.js). A value the printer does not send
 * (no chamber on a K1C) is left out, not published as 0.
 */
export function printerStates(gladys, printer, status) {
  const ids = printerIds(gladys, printer);
  const value = (key, state) =>
    state === null || state === undefined
      ? []
      : [{ device_feature_external_id: ids.feature(key), state }];
  const text = (key, content) => [{ device_feature_external_id: ids.feature(key), text: content }];

  const discrete = [...text(FEATURES.STATE, status.state), ...value(FEATURES.LIGHT, status.light)];
  if (status.state === PRINT_STATES.OFFLINE) {
    // Nothing else is known while the printer is unreachable: keep the last
    // readings rather than publishing holes.
    return { discrete, continuous: [] };
  }
  discrete.push(...text(FEATURES.FILE, status.fileName ?? '-'));
  const continuous = [
    ...value(FEATURES.PROGRESS, status.progress),
    ...value(FEATURES.TIME_LEFT, minutes(status.leftSeconds)),
    ...value(FEATURES.ELAPSED, minutes(status.elapsedSeconds)),
    ...value(FEATURES.NOZZLE, status.nozzleTemp),
    ...value(FEATURES.BED, status.bedTemp),
    ...value(FEATURES.CHAMBER, status.chamberTemp),
  ];
  return { discrete, continuous };
}

/** The transport badge of a printer (and of its camera). */
export function transportEntries(gladys, entries, config) {
  return entries.flatMap(({ printer, connected }) => {
    const transport = connected ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    return [
      { external_id: printerIds(gladys, printer).device, transport },
      ...(config.camera ? [{ external_id: cameraIds(gladys, printer).device, transport }] : []),
    ];
  });
}
