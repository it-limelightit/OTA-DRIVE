import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;
let client: S3Client | undefined;
let presignClient: S3Client | undefined;
let bucketReady = false;

function config() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Firmware storage is not configured. Missing: ${missing.join(', ')}.`);
  return { endpoint: process.env.S3_ENDPOINT!, bucket: process.env.S3_BUCKET!, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }, region: process.env.S3_REGION ?? 'auto', forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' };
}

function getClient() { if (!client) { const value = config(); client = new S3Client({ endpoint: value.endpoint, credentials: value.credentials, region: value.region, forcePathStyle: value.forcePathStyle }); } return client; }
function getPresignClient() { if (!presignClient) { const value = config(); presignClient = new S3Client({ endpoint: process.env.S3_PRESIGN_ENDPOINT ?? value.endpoint, credentials: value.credentials, region: value.region, forcePathStyle: value.forcePathStyle }); } return presignClient; }

async function ensureBucket() {
  if (bucketReady) return;
  const { bucket } = config();
  try { await getClient().send(new HeadBucketCommand({ Bucket: bucket })); }
  catch {
    if (process.env.S3_CREATE_BUCKET !== 'true') throw new Error('Firmware bucket is unavailable. Create the configured R2 bucket or check storage credentials.');
    await getClient().send(new CreateBucketCommand({ Bucket: bucket }));
  }
  bucketReady = true;
}

export async function putFirmware(key: string, body: Buffer, sha256: string) {
  const { bucket } = config();
  await ensureBucket();
  await getClient().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/octet-stream', ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64') }));
}

export async function deleteFirmware(key: string) { await getClient().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key })); }

export async function getFirmwareDownloadUrl(key: string) {
  const { bucket } = config();
  await ensureBucket();
  return getSignedUrl(getPresignClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: Number(process.env.FIRMWARE_URL_TTL_SECONDS ?? 900) });
}
