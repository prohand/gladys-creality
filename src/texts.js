// -----------------------------------------------------------------------------
// The user-facing words of the integration, in the four languages of the
// Gladys interface (see src/i18n.js). Gladys picks the reader's language from
// each `{ en, fr, de, es }` object and falls back to English.
// -----------------------------------------------------------------------------

import { PRINT_STATES } from './creality/protocol.js';

/** How each print state reads. */
export const STATE_LABELS = {
  [PRINT_STATES.IDLE]: { en: 'Idle', fr: 'Au repos', de: 'Bereit', es: 'En reposo' },
  [PRINT_STATES.PRINTING]: { en: 'Printing', fr: 'Impression', de: 'Druckt', es: 'Imprimiendo' },
  [PRINT_STATES.PAUSED]: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  [PRINT_STATES.COMPLETED]: { en: 'Completed', fr: 'Terminée', de: 'Fertig', es: 'Terminada' },
  [PRINT_STATES.FAILED]: { en: 'Failed', fr: 'Échouée', de: 'Fehlgeschlagen', es: 'Fallida' },
  [PRINT_STATES.STOPPED]: { en: 'Stopped', fr: 'Arrêtée', de: 'Abgebrochen', es: 'Detenida' },
  [PRINT_STATES.OFFLINE]: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  [PRINT_STATES.UNKNOWN]: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
};

export const TEXTS = {
  noPrinter: {
    en: 'No printer configured: add its address in the configuration.',
    fr: 'Aucune imprimante configurée : ajoutez son adresse dans la configuration.',
    de: 'Kein Drucker eingerichtet: Trage seine Adresse in der Konfiguration ein.',
    es: 'Ninguna impresora configurada: añada su dirección en la configuración.',
  },
  noneReachable: {
    en: 'No printer answers on the network.',
    fr: 'Aucune imprimante ne répond sur le réseau.',
    de: 'Kein Drucker antwortet im Netzwerk.',
    es: 'Ninguna impresora responde en la red.',
  },
  unknownDevice: {
    en: 'This device is not one of the configured printers.',
    fr: "Cet appareil n'est pas une des imprimantes configurées.",
    de: 'Dieses Gerät gehört zu keinem eingerichteten Drucker.',
    es: 'Este dispositivo no es una de las impresoras configuradas.',
  },
  offline: {
    en: 'The printer is not reachable.',
    fr: "L'imprimante est injoignable.",
    de: 'Der Drucker ist nicht erreichbar.',
    es: 'La impresora no es accesible.',
  },
  blinking: {
    en: 'Look at the printer: its light is blinking.',
    fr: "Regardez l'imprimante : sa lumière clignote.",
    de: 'Schau zum Drucker: Sein Licht blinkt.',
    es: 'Mire la impresora: su luz parpadea.',
  },
  // Labels of the widget.
  progress: { en: 'Progress', fr: 'Progression', de: 'Fortschritt', es: 'Progreso' },
  nozzle: { en: 'Nozzle', fr: 'Buse', de: 'Düse', es: 'Boquilla' },
  bed: { en: 'Bed', fr: 'Plateau', de: 'Druckbett', es: 'Cama' },
  printer: { en: 'Printer', fr: 'Imprimante', de: 'Drucker', es: 'Impresora' },
  state: { en: 'State', fr: 'État', de: 'Status', es: 'Estado' },
  file: { en: 'File', fr: 'Fichier', de: 'Datei', es: 'Archivo' },
  timeLeft: { en: 'Time left', fr: 'Temps restant', de: 'Restzeit', es: 'Tiempo restante' },
  layer: { en: 'Layer', fr: 'Couche', de: 'Schicht', es: 'Capa' },
  error: { en: 'Error code', fr: "Code d'erreur", de: 'Fehlercode', es: 'Código de error' },
  snapshot: {
    en: 'Printer camera',
    fr: "Caméra de l'imprimante",
    de: 'Druckerkamera',
    es: 'Cámara de la impresora',
  },
  pause: { en: 'Pause', fr: 'Pause', de: 'Pause', es: 'Pausa' },
  resume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
  stop: { en: 'Stop the print', fr: "Arrêter l'impression", de: 'Druck abbrechen', es: 'Detener' },
  lightOn: { en: 'Light on', fr: 'Allumer', de: 'Licht an', es: 'Encender luz' },
  lightOff: { en: 'Light off', fr: 'Éteindre', de: 'Licht aus', es: 'Apagar luz' },
};

/** The toast of a print command, from the result of sendPrintCommand. */
export const COMMAND_RESULTS = {
  pause: {
    en: 'Pause sent to the printer.',
    fr: "Pause envoyée à l'imprimante.",
    de: 'Pause an den Drucker gesendet.',
    es: 'Pausa enviada a la impresora.',
  },
  resume: {
    en: 'Resume sent to the printer.',
    fr: "Reprise envoyée à l'imprimante.",
    de: 'Fortsetzen an den Drucker gesendet.',
    es: 'Reanudación enviada a la impresora.',
  },
  stop: {
    en: 'Stop sent to the printer.',
    fr: "Arrêt envoyé à l'imprimante.",
    de: 'Abbruch an den Drucker gesendet.',
    es: 'Detención enviada a la impresora.',
  },
  not_allowed: {
    en: 'Nothing to do: no print in that state.',
    fr: 'Rien à faire : aucune impression dans cet état.',
    de: 'Nichts zu tun: kein Druck in diesem Zustand.',
    es: 'Nada que hacer: ninguna impresión en ese estado.',
  },
};

/** `1 h 05` / `12 min`: short enough for a status row, readable everywhere. */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) {
    return '-';
  }
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours > 0 ? `${hours} h ${String(mins).padStart(2, '0')}` : `${mins} min`;
}
