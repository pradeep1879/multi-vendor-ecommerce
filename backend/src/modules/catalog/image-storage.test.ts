import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loadEnvironment } from '../../config/env.js';
import { ImageStorage } from './image-storage.js';

let server: ReturnType<typeof Bun.serve>;
let endpoint = '';
const objects = new Map<string, { body: Uint8Array; type: string }>();
describe('S3-compatible product image storage', () => {
  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(request) {
        const url = new URL(request.url);
        const key = url.pathname.split('/').slice(2).join('/');
        const method = request.method;
        if (method === 'PUT') {
          return request.arrayBuffer().then((buffer) => {
            objects.set(key, {
              body: new Uint8Array(buffer),
              type: request.headers.get('content-type') ?? '',
            });
            return new Response(null, { status: 200 });
          });
        }
        const value = objects.get(key);
        if (!value) return new Response(null, { status: 404 });
        if (method === 'HEAD')
          return new Response(null, {
            headers: { 'content-length': String(value.body.length), 'content-type': value.type },
          });
        if (method === 'GET')
          return new Response(
            value.body.buffer.slice(
              value.body.byteOffset,
              value.body.byteOffset + value.body.byteLength,
            ) as ArrayBuffer,
            {
              headers: { 'content-length': String(value.body.length), 'content-type': value.type },
            },
          );
        if (method === 'DELETE') {
          objects.delete(key);
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 405 });
      },
    });
    endpoint = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server?.stop(true));
  function storage() {
    return new ImageStorage(
      loadEnvironment({
        NODE_ENV: 'test',
        S3_ENDPOINT: endpoint,
        S3_BUCKET: 'images-test',
        S3_ACCESS_KEY_ID: 'test-key',
        S3_SECRET_ACCESS_KEY: 'test-secret',
        S3_PUBLIC_BASE_URL: 'https://cdn.example.test',
        S3_REGION: 'us-east-1',
      }),
    );
  }
  test('uses opaque scoped keys, verifies content signature and metadata, and deletes object', async () => {
    const image = storage();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]);
    const upload = await image.presign('vendor-id', 'product-id', 'image/jpeg', bytes.length);
    expect(upload.key).toMatch(/^products\/vendor-id\/product-id\/[\da-f-]+\.jpg$/);
    expect(upload.uploadUrl).toContain('X-Amz-Signature=');
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    });
    expect(put.status).toBe(200);
    const url = await image.validateUploaded(upload.key, 'image/jpeg', bytes.length);
    expect(url).toBe(`https://cdn.example.test/${upload.key}`);
    await image.delete(upload.key);
    expect(objects.has(upload.key)).toBe(false);
  });
  test('rejects content that does not match declared image signature', async () => {
    const image = storage();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const upload = await image.presign('vendor-id', 'product-id', 'image/png', bytes.length);
    await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    });
    await expect(
      image.validateUploaded(upload.key, 'image/png', bytes.length),
    ).rejects.toMatchObject({ code: 'IMAGE_CONTENT_INVALID' });
  });
  test('rejects incomplete storage configuration clearly', () => {
    expect(() => new ImageStorage(loadEnvironment({ NODE_ENV: 'test' }))).toThrow(
      'Image storage is not configured.',
    );
  });
});
