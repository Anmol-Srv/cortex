import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.CORTEX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CORTEX_ENCRYPTION_KEY env var is required for credential encryption. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(key, 'hex');
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(buffer) {
  const key = getEncryptionKey();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
}

function encryptJson(obj) {
  return encrypt(JSON.stringify(obj));
}

function decryptJson(buffer) {
  return JSON.parse(decrypt(buffer));
}

export { encrypt, decrypt, encryptJson, decryptJson };
