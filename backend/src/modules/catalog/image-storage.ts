import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/env.js';

const formats = {
  'image/jpeg': {
    extension: 'jpg',
    check: (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    check: (b: Uint8Array) =>
      b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v),
  },
  'image/webp': {
    extension: 'webp',
    check: (b: Uint8Array) =>
      b.length >= 12 &&
      String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  },
} as const;
export type ImageMime = keyof typeof formats;

export class ImageStorage {
  private readonly client: S3Client;
  private readonly config: NonNullable<Environment['s3']>;
  constructor(environment: Environment) {
    if (!environment.s3)
      throw new AppError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Image storage is not configured.');
    this.config = environment.s3;
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }
  async presign(vendorId: string, productId: string, mimeType: ImageMime, sizeBytes: number) {
    if (sizeBytes < 1 || sizeBytes > this.config.maxImageBytes)
      throw new AppError(400, 'IMAGE_SIZE_INVALID', 'Image size exceeds the configured limit.');
    const key = `products/${vendorId}/${productId}/${randomUUID()}.${formats[mimeType].extension}`;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: this.config.presignedUploadTtlSeconds },
    );
    return { key, uploadUrl, expiresIn: this.config.presignedUploadTtlSeconds };
  }
  async validateUploaded(key: string, mimeType: ImageMime, sizeBytes: number) {
    if (sizeBytes < 1 || sizeBytes > this.config.maxImageBytes)
      throw new AppError(400, 'IMAGE_SIZE_INVALID', 'Image size exceeds the configured limit.');
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (head.ContentLength !== sizeBytes || head.ContentType !== mimeType)
      throw new AppError(
        400,
        'IMAGE_METADATA_MISMATCH',
        'Uploaded image metadata does not match the requested upload.',
      );
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes || bytes.length !== sizeBytes || !formats[mimeType].check(bytes))
      throw new AppError(
        400,
        'IMAGE_CONTENT_INVALID',
        'Uploaded file is not a valid image of the declared type.',
      );
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
