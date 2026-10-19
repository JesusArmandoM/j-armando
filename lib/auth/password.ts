import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }
  return { valid: true };
}

/**
 * Hashes a plaintext password using crypto.scrypt with a unique 16-byte random salt.
 * Returns a formatted string: `<saltHex>:<keyHex>`.
 * Throws an error if password does not meet the minimum length requirements.
 */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash (`<saltHex>:<keyHex>`).
 * Uses timingSafeEqual to avoid timing side-channels.
 * Returns false if the stored hash is malformed or verification fails.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }

  try {
    const keyBuffer = Buffer.from(keyHex, "hex");
    if (keyBuffer.length === 0) {
      return false;
    }

    const derivedKey = (await scryptAsync(password, salt, keyBuffer.length)) as Buffer;
    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }

    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}
