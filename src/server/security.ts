import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;

export const DUMMY_SECRET_HASH =
  'scrypt$00000000000000000000000000000000$9998a42767d5ffdf0b82d3a66aabb0b07a8e38f1c3755ddef7e50bd0d9d15937e9542014d0cde146b5f91f5ac8165c6fb7d1e9011daa6468a006d665e92efe19';

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// PIN과 교사 고유 번호는 느린 KDF로 저장해 유출 시 대입 공격 비용을 높인다.
function deriveSecret(secret: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(secret, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashSecret(secret: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = (await deriveSecret(secret, salt)).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export async function verifySecret(secret: string, storedHash: string) {
  if (storedHash.startsWith('scrypt$')) {
    const [, salt, digest] = storedHash.split('$');
    if (!salt || !digest || !/^[0-9a-f]+$/i.test(digest)) return false;
    const actual = await deriveSecret(secret, salt);
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

export async function findSecretMatch<T extends { password_hash: string }>(
  secret: string,
  rows: readonly T[],
) {
  for (const row of rows) {
    if (await verifySecret(secret, row.password_hash)) return row;
  }
  return null;
}

export function isLegacySha256Hash(storedHash: string) {
  return /^[0-9a-f]{64}$/i.test(storedHash);
}
