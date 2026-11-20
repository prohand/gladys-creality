// -----------------------------------------------------------------------------
// Camera snapshots.
//
// The printers that carry a camera (K1C, K1 Max, K2, the K1 with its camera
// kit...) serve a still image over HTTP: mjpg-streamer on port 8080,
// `/?action=snapshot`. One JPEG, no login.
//
// Gladys takes at most 150 KB per camera image and 300 KB per widget image:
// the printer sends a 640×480 or 1280×720 JPEG, usually well under that. A
// bigger one is refused here with a clear message rather than sent and
// rejected by Gladys.
// -----------------------------------------------------------------------------

const SNAPSHOT_TIMEOUT_MS = 8_000;

/** Largest image Gladys accepts on the camera channel. */
export const MAX_CAMERA_IMAGE_BYTES = 150 * 1024;

/** The snapshot URL of a printer. */
export function snapshotUrl(host, port) {
  return `http://${host}:${port}/?action=snapshot`;
}

/**
 * Fetch one JPEG from the printer camera.
 *
 * @param {object} options
 * @param {string} options.host printer address
 * @param {number} options.port camera port (8080)
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<Buffer>} the JPEG bytes
 */
export async function fetchSnapshot({ host, port, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(snapshotUrl(host, port), {
    signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`camera answered HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  // JPEG files start with FF D8: anything else is an error page.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('camera did not answer with a JPEG image');
  }
  return bytes;
}

/** The image format of the Gladys camera channel. */
export function toCameraImage(bytes) {
  if (bytes.length > MAX_CAMERA_IMAGE_BYTES) {
    throw new Error(
      `snapshot of ${Math.round(bytes.length / 1024)} KB, Gladys takes ${MAX_CAMERA_IMAGE_BYTES / 1024} KB at most`,
    );
  }
  return `image/jpg;base64,${bytes.toString('base64')}`;
}
