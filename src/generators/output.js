import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import config from '../config.js';

/**
 * Write output to configured storage backend.
 * Falls back to local filesystem when S3 isn't configured.
 */
async function writeOutput(key, content) {
  const { storage } = config.output;

  if (storage === 's3' && config.output.s3.accessKey && config.output.s3.bucket) {
    return uploadToS3(key, content);
  }

  return writeLocal(key, content);
}

async function uploadToS3(key, content) {
  const { endpoint, bucket, region, accessKey, secretKey, publicUrl } = config.output.s3;
  const host = endpoint || `https://s3.${region}.amazonaws.com`;
  const url = `${host}/${bucket}/${key}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-amz-acl': 'public-read',
    },
    body: content,
  });

  if (!response.ok) {
    console.warn(`  S3 upload failed (${response.status}), falling back to local`);
    return writeLocal(key, content);
  }

  const resultUrl = publicUrl ? `${publicUrl}/${key}` : url;
  console.log(`  Uploaded: ${resultUrl}`);
  return { url: resultUrl, local: false };
}

async function writeLocal(key, content) {
  const outputDir = config.output.dir;
  const filePath = join(outputDir, key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  console.log(`  Written: ${filePath}`);
  return { url: filePath, local: true };
}

export { writeOutput };
