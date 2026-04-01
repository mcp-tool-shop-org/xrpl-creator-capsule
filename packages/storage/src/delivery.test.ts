import { describe, it, expect } from "vitest";
import { MockDeliveryProvider } from "./delivery.js";

describe("MockDeliveryProvider", () => {
  it("creates a token with expected shape", async () => {
    const provider = new MockDeliveryProvider();
    const token = await provider.createToken("QmTest123", 3600);
    expect(token.token).toMatch(/^tok_[a-f0-9]{32}$/);
    expect(token.contentPointer).toBe("QmTest123");
    expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves a valid token to its content pointer", async () => {
    const provider = new MockDeliveryProvider();
    const token = await provider.createToken("QmTest123", 3600);
    const resolved = await provider.resolveToken(token.token);
    expect(resolved).toBe("QmTest123");
  });

  it("returns null for unknown token", async () => {
    const provider = new MockDeliveryProvider();
    const resolved = await provider.resolveToken("tok_nonexistent");
    expect(resolved).toBeNull();
  });

  it("returns null for expired token", async () => {
    const provider = new MockDeliveryProvider();
    // TTL of 0 seconds = already expired
    const token = await provider.createToken("QmTest123", 0);
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 10));
    const resolved = await provider.resolveToken(token.token);
    expect(resolved).toBeNull();
  });

  it("creates unique tokens for the same content", async () => {
    const provider = new MockDeliveryProvider();
    const t1 = await provider.createToken("QmTest123", 3600);
    const t2 = await provider.createToken("QmTest123", 3600);
    expect(t1.token).not.toBe(t2.token);
  });
});
