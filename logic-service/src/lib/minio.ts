import { createHash, createHmac } from 'crypto';
import { config } from '../config/env';

const DEFAULT_REGION = 'us-east-1';

type MinioConfig = {
  baseUrl: string;
  host: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

type UploadInput = {
  sourceUrl: string;
  fileName: string;
  mimeType: string;
  courseId: string;
};

type UploadResult = {
  objectKey: string;
  fileUrl: string;
};

const toHexSha256 = (payload: Buffer | string): string =>
  createHash('sha256').update(payload).digest('hex');

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data).digest();

const encodePath = (value: string): string =>
  value
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

const formatAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString();
  const dateStamp = iso.slice(0, 10).replace(/-/g, '');
  const amzDate = `${dateStamp}T${iso.slice(11, 19).replace(/:/g, '')}Z`;
  return { amzDate, dateStamp };
};

const getMinioConfig = (): MinioConfig | null => {
  if (!config.minioEndpoint || !config.minioAccessKey || !config.minioSecretKey || !config.minioBucket) {
    return null;
  }

  const endpoint = new URL(config.minioEndpoint);
  const baseUrl = `${endpoint.protocol}//${endpoint.host}`;

  return {
    baseUrl,
    host: endpoint.host,
    bucket: config.minioBucket,
    accessKey: config.minioAccessKey,
    secretKey: config.minioSecretKey,
    region: process.env.MINIO_REGION || DEFAULT_REGION,
  };
};

const signRequest = (
  method: string,
  canonicalUri: string,
  payloadHash: string,
  now: Date,
  cfg: MinioConfig
): {
  authorization: string;
  amzDate: string;
} => {
  const { amzDate, dateStamp } = formatAmzDate(now);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `host:${cfg.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest =
    `${method}\n` +
    `${canonicalUri}\n` +
    `\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n` +
    `${amzDate}\n` +
    `${credentialScope}\n` +
    `${toHexSha256(canonicalRequest)}`;

  const kDate = hmac(`AWS4${cfg.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate };
};

const signedFetch = async (
  method: 'HEAD' | 'PUT',
  canonicalUri: string,
  cfg: MinioConfig,
  body?: Buffer,
  contentType?: string
): Promise<Response> => {
  const payload = body || Buffer.alloc(0);
  const payloadHash = toHexSha256(payload);
  const now = new Date();
  const { authorization, amzDate } = signRequest(method, canonicalUri, payloadHash, now, cfg);

  const headers: Record<string, string> = {
    host: cfg.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization,
  };

  if (contentType) {
    headers['content-type'] = contentType;
  }

  return fetch(`${cfg.baseUrl}${canonicalUri}`, {
    method,
    headers,
    body: method === 'PUT' ? payload : undefined,
  });
};

const ensureBucketExists = async (cfg: MinioConfig): Promise<void> => {
  const bucketUri = `/${encodeURIComponent(cfg.bucket)}`;
  const headResp = await signedFetch('HEAD', bucketUri, cfg);

  if (headResp.status === 200) {
    return;
  }

  if (headResp.status !== 404) {
    const text = await headResp.text();
    throw new Error(`Cannot check bucket "${cfg.bucket}" (status ${headResp.status}): ${text}`);
  }

  const createResp = await signedFetch('PUT', bucketUri, cfg, Buffer.alloc(0));
  if (![200, 201, 204, 409].includes(createResp.status)) {
    const text = await createResp.text();
    throw new Error(`Cannot create bucket "${cfg.bucket}" (status ${createResp.status}): ${text}`);
  }
};

const sanitizeFileName = (fileName: string): string =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const downloadFile = async (sourceUrl: string): Promise<{ content: Buffer; contentType: string }> => {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Cannot download source file (status ${resp.status}): ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const contentType = resp.headers.get('content-type') || 'application/octet-stream';
  return { content: Buffer.from(arrayBuffer), contentType };
};

export const isMinioEnabled = (): boolean => getMinioConfig() !== null;

export const canUploadFromSource = (source: string): boolean => isHttpUrl(source);

export const uploadDocumentToMinio = async (input: UploadInput): Promise<UploadResult> => {
  const cfg = getMinioConfig();
  if (!cfg) {
    throw new Error('MinIO is not configured');
  }

  if (!isHttpUrl(input.sourceUrl)) {
    throw new Error(`Source URL is invalid: ${input.sourceUrl}`);
  }

  await ensureBucketExists(cfg);
  const downloaded = await downloadFile(input.sourceUrl);
  const now = Date.now();
  const objectKey = `${input.courseId}/${now}-${sanitizeFileName(input.fileName)}`;
  const objectUri = `/${encodeURIComponent(cfg.bucket)}/${encodePath(objectKey)}`;

  const uploadResp = await signedFetch(
    'PUT',
    objectUri,
    cfg,
    downloaded.content,
    input.mimeType || downloaded.contentType
  );

  if (![200, 201].includes(uploadResp.status)) {
    const body = await uploadResp.text();
    throw new Error(`Upload to MinIO failed (status ${uploadResp.status}): ${body.slice(0, 200)}`);
  }

  return {
    objectKey,
    fileUrl: `${cfg.baseUrl}/${cfg.bucket}/${encodePath(objectKey)}`,
  };
};

