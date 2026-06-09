/**
 * CrunchyVerse Signed API Client
 * Menyembunyikan request details dari DevTools dengan HMAC-SHA256 token
 * Token expire setelah 30 detik untuk mencegah replay attacks
 */

const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || "crunchyverse-stage-2026-secret";

/**
 * Generate HMAC-SHA256 signed token untuk request authentication
 * Token format: base64(hmac(secret, endpoint+timestamp))
 */
async function generateRequestToken(endpoint: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${endpoint}:${timestamp}`;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(API_SECRET);
    const messageData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    const sigArray = Array.from(new Uint8Array(signature));
    const sigBase64 = btoa(String.fromCharCode(...sigArray));
    return `${timestamp}.${sigBase64}`;
  } catch {
    // Fallback kalau crypto.subtle tidak tersedia
    return `${timestamp}.fallback`;
  }
}

/**
 * Obfuscate payload — encode body ke base64 layer supaya tidak langsung terbaca di DevTools Preview
 * Backend decode sebelum proses
 */
function obfuscatePayload(data: Record<string, unknown>): string {
  const jsonStr = JSON.stringify(data);
  return btoa(encodeURIComponent(jsonStr));
}

/**
 * signedFetch — drop-in replacement untuk fetch() dengan HMAC auth token
 * Semua request ke backend menggunakan ini
 */
export async function signedFetch(
  url: string,
  options: RequestInit & { sensitive?: boolean } = {}
): Promise<Response> {
  // Extract path dari URL untuk token signing
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }

  const token = await generateRequestToken(path);
  const timestamp = token.split(".")[0];

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    "X-CV-Client-Token": token,
    "X-CV-Timestamp": timestamp,
    "X-CV-Client": "crunchyverse-web",
  };

  // Kalau sensitive & ada body JSON, obfuscate payload
  if (options.sensitive && options.body && typeof options.body === "string") {
    try {
      const parsed = JSON.parse(options.body);
      const obfuscated = obfuscatePayload(parsed);
      return fetch(url, {
        ...options,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-CV-Encoded": "1",
        },
        body: JSON.stringify({ _d: obfuscated }),
      });
    } catch {
      // Fallback ke normal jika parse gagal
    }
  }

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Simple in-browser TTL cache untuk reduce Firebase/backend calls
 */
const browserCache: Map<string, { data: unknown; expiry: number }> = new Map();

export function getCached<T>(key: string): T | null {
  const entry = browserCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    browserCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  browserCache.set(key, {
    data,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export function invalidateCache(key: string): void {
  browserCache.delete(key);
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of browserCache.keys()) {
    if (key.startsWith(prefix)) {
      browserCache.delete(key);
    }
  }
}
