import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import path from "node:path";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedCredentials: ServiceAccountKey | null = null;

export function getServiceAccountCredentials(): ServiceAccountKey {
  if (cachedCredentials) return cachedCredentials;

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), "gcp-service-account.json");
  const raw = readFileSync(keyPath, "utf8");
  cachedCredentials = JSON.parse(raw) as ServiceAccountKey;
  return cachedCredentials;
}

/**
 * Mints an OAuth2 access token for Google Cloud Platform using RS256 JWT assertion.
 */
export async function getGoogleCloudAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const credentials = getServiceAccountCredentials();
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsignedToken = `${b64(header)}.${b64(claimSet)}`;

  const sign = createSign("RSA-SHA256");
  sign.update(unsignedToken);
  sign.end();
  const signature = sign.sign(credentials.private_key, "base64url");
  const assertion = `${unsignedToken}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Failed to obtain Google Cloud access token: HTTP ${res.status}: ${errorText}`);
  }

  interface TokenResponse {
    access_token: string;
    expires_in: number;
  }
  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return cachedToken.token;
}
