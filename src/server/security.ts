import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// 교사 고유 번호는 느린 KDF로 저장해 유출 시 대입 공격 비용을 높인다.
export function hashSecret(secret: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(secret, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifySecret(secret: string, storedHash: string) {
  if (storedHash.startsWith('scrypt$')) {
    const [, salt, digest] = storedHash.split('$');
    const actual = scryptSync(secret, salt, SCRYPT_KEY_LENGTH);
    const expected = Buffer.from(digest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  // 이전 버전의 SHA-256 값은 첫 성공 로그인 때 scrypt 형식으로 업그레이드한다.
  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    const actual = Buffer.from(sha256Hex(secret), 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  return false;
}

export function isLegacySha256Hash(storedHash: string) {
  return /^[0-9a-f]{64}$/i.test(storedHash);
}
