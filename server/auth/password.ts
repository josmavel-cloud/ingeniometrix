import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: {
    N: number;
    r: number;
    p: number;
    maxmem: number;
  },
) => Promise<Buffer>;

const HASH_VERSION = "1";
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export function validatePassword(password: string) {
  return password.length >= 12;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);

  return [
    "scrypt",
    `v=${HASH_VERSION}`,
    `N=${SCRYPT_PARAMS.N}`,
    `r=${SCRYPT_PARAMS.r}`,
    `p=${SCRYPT_PARAMS.p}`,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

function parsePasswordHash(value: string) {
  const [algorithm, version, nValue, rValue, pValue, saltValue, hashValue] = value.split("$");

  if (
    algorithm !== "scrypt" ||
    version !== `v=${HASH_VERSION}` ||
    !nValue?.startsWith("N=") ||
    !rValue?.startsWith("r=") ||
    !pValue?.startsWith("p=") ||
    !saltValue ||
    !hashValue
  ) {
    return null;
  }

  const params = {
    N: Number.parseInt(nValue.slice(2), 10),
    r: Number.parseInt(rValue.slice(2), 10),
    p: Number.parseInt(pValue.slice(2), 10),
    maxmem: SCRYPT_PARAMS.maxmem,
  };

  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return null;
  }

  return {
    params,
    salt: Buffer.from(saltValue, "base64url"),
    hash: Buffer.from(hashValue, "base64url"),
  };
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const parsed = parsePasswordHash(storedHash);

  if (!parsed) {
    return false;
  }

  const hash = await scryptAsync(password, parsed.salt, parsed.hash.length, parsed.params);

  return hash.length === parsed.hash.length && timingSafeEqual(hash, parsed.hash);
}
