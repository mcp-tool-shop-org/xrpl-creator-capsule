/**
 * Delivery Token — interface for gated content delivery.
 *
 * Implementations produce time-limited tokens that can be
 * exchanged for the actual content. The token is opaque
 * to the access layer — only the delivery provider knows
 * how to resolve it.
 */

import { randomBytes } from "node:crypto";

export interface DeliveryToken {
  /** Opaque token string */
  token: string;
  /** ISO 8601 expiry timestamp */
  expiresAt: string;
  /** Content identifier this token unlocks */
  contentPointer: string;
}

export interface DeliveryProvider {
  /** Create a time-limited delivery token for content. */
  createToken(contentPointer: string, ttlSeconds: number): Promise<DeliveryToken>;
  /** Validate and resolve a token. Returns the content pointer if valid, null if expired/invalid. */
  resolveToken(token: string): Promise<string | null>;
}

/**
 * In-memory mock delivery provider for testing.
 * Tokens are stored in a Map and expire after ttlSeconds.
 */
export class MockDeliveryProvider implements DeliveryProvider {
  private tokens = new Map<string, { contentPointer: string; expiresAt: Date }>();

  async createToken(contentPointer: string, ttlSeconds: number): Promise<DeliveryToken> {
    const token = `tok_${randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.tokens.set(token, { contentPointer, expiresAt });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      contentPointer,
    };
  }

  async resolveToken(token: string): Promise<string | null> {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (new Date() > entry.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return entry.contentPointer;
  }
}
