import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSnapshot, snapshotUrl, toCameraImage } from '../src/creality/camera.js';
import { fakeFetch, fakeJpeg } from './helpers/fakePrinter.js';

test('the snapshot comes from mjpg-streamer on the printer', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const bytes = await fetchSnapshot({ host: '192.168.1.40', port: 8080, fetchImpl });
  assert.equal(bytes.length, 2048);
  assert.deepEqual(calls, ['http://192.168.1.40:8080/?action=snapshot']);
  assert.equal(snapshotUrl('k1.local', 8081), 'http://k1.local:8081/?action=snapshot');
});

test('anything but a JPEG is refused', async () => {
  const { fetchImpl } = fakeFetch(Buffer.from('<html>404</html>'));
  await assert.rejects(fetchSnapshot({ host: 'h', port: 1, fetchImpl }), /not answer with a JPEG/);
  const failing = async () => ({ ok: false, status: 503 });
  await assert.rejects(fetchSnapshot({ host: 'h', port: 1, fetchImpl: failing }), /HTTP 503/);
});

test('the camera image is the Gladys format, 150 KB at most', () => {
  assert.match(toCameraImage(fakeJpeg(1000)), /^image\/jpg;base64,\/9/);
  assert.throws(() => toCameraImage(fakeJpeg(151 * 1024)), /150 KB at most/);
});
