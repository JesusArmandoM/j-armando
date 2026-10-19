import { describe, expect, it } from "vitest";

import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  validatePassword,
  verifyPassword,
} from "./password.ts";

describe("password utility", () => {
  describe("validatePassword", () => {
    it("rejects empty string", () => {
      const res = validatePassword("");
      expect(res.valid).toBe(false);
      expect(res.error).toContain(`at least ${MIN_PASSWORD_LENGTH} characters`);
    });

    it("rejects passwords shorter than MIN_PASSWORD_LENGTH", () => {
      const res = validatePassword("1234567");
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Password must be at least 8 characters long");
    });

    it("accepts passwords of exactly MIN_PASSWORD_LENGTH", () => {
      const res = validatePassword("12345678");
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("accepts passwords longer than MIN_PASSWORD_LENGTH", () => {
      const res = validatePassword("SuperSecurePassword123!");
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });

  describe("hashPassword", () => {
    it("throws an error when hashing a password shorter than 8 characters", async () => {
      await expect(hashPassword("short")).rejects.toThrow(
        "Password must be at least 8 characters long",
      );
    });

    it("produces a formatted salt:key hex string", async () => {
      const hash = await hashPassword("ValidPassword123");
      expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    });

    it("generates unique salts for identical passwords", async () => {
      const hash1 = await hashPassword("IdenticalPassword123");
      const hash2 = await hashPassword("IdenticalPassword123");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("returns true when password matches the hash", async () => {
      const plain = "CorrectHorseBatteryStaple!";
      const hash = await hashPassword(plain);
      const isMatch = await verifyPassword(plain, hash);
      expect(isMatch).toBe(true);
    });

    it("returns false when password does not match", async () => {
      const plain = "CorrectHorseBatteryStaple!";
      const hash = await hashPassword(plain);
      const isMatch = await verifyPassword("WrongPassword123", hash);
      expect(isMatch).toBe(false);
    });

    it("returns false for malformed hash strings", async () => {
      expect(await verifyPassword("Password123", "")).toBe(false);
      expect(await verifyPassword("Password123", "invalidhashformat")).toBe(false);
      expect(await verifyPassword("Password123", ":")).toBe(false);
      expect(await verifyPassword("Password123", "salt:")).toBe(false);
      expect(await verifyPassword("Password123", "invalidhex:invalidhex")).toBe(false);
    });

    it("returns false when empty password is provided", async () => {
      const hash = await hashPassword("ValidPassword123");
      expect(await verifyPassword("", hash)).toBe(false);
    });
  });
});
