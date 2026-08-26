import { describe, it, expect, vi, beforeEach } from "vitest";

// F-3c2c1fd7: xumm-sdk's real XummDeletePayloadResponse nests `cancelled`
// and `reason` under `result.result`, not top-level on the response. The
// old code read `result.cancelled` / `result.reason` directly, which are
// always undefined against the real SDK shape — every cancellation looked
// identical to a failed one. This mock is shaped exactly like the SDK's
// XummDeletePayloadResponse (see xumm-sdk/dist/src/types/xumm-api/index.d.ts)
// with `cancelled`/`reason` present ONLY at the nested location, so a
// regression back to top-level reads fails this test.
const { mockCancel, mockCreate, mockSubscribe, mockGet } = vi.hoisted(() => {
  return {
    mockCancel: vi.fn(),
    mockCreate: vi.fn(),
    mockSubscribe: vi.fn(),
    mockGet: vi.fn(),
  };
});

vi.mock("xumm-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xumm-sdk")>();
  return {
    ...actual,
    XummSdk: vi.fn().mockImplementation(() => ({
      payload: {
        cancel: mockCancel,
        create: mockCreate,
        subscribe: mockSubscribe,
        get: mockGet,
      },
    })),
  };
});

import { XamanClient, XamanRequestError } from "./client.js";

beforeEach(() => {
  mockCancel.mockReset();
  mockCreate.mockReset();
  mockSubscribe.mockReset();
  mockGet.mockReset();
});

function makeDeletePayloadResponse(overrides?: {
  cancelled?: boolean;
  reason?: "OK" | "ALREADY_CANCELLED" | "ALREADY_RESOLVED" | "ALREADY_OPENED" | "ALREADY_EXPIRED";
}) {
  return {
    // Representative XummDeletePayloadResponse shape — cancelled/reason
    // live here, and nowhere else on the object.
    result: {
      cancelled: overrides?.cancelled ?? true,
      reason: overrides?.reason ?? "OK",
    },
    meta: {
      exists: true,
      uuid: "payload-uuid-123",
      multisign: false,
      submit: true,
      pathfinding: false,
      pathfinding_fallback: false,
      force_network: "TESTNET",
      destination: "rDestination",
      resolved_destination: "rDestination",
      resolved: true,
      signed: false,
      cancelled: overrides?.cancelled ?? true,
      expired: false,
      pushed: false,
      app_opened: false,
      opened_by_deeplink: null,
      return_url_app: null,
      return_url_web: null,
      is_xapp: false,
      signers: null,
    },
    custom_meta: {
      identifier: null,
      blob: null,
      instruction: null,
    },
  };
}

function makeClient() {
  return new XamanClient({ apiKey: "test-key", apiSecret: "test-secret" });
}

describe("XamanClient.cancelPayload", () => {
  it("maps cancelled and reason from the SDK's nested result.result shape", async () => {
    mockCancel.mockResolvedValueOnce(makeDeletePayloadResponse());

    const client = makeClient();
    const outcome = await client.cancelPayload("payload-uuid-123");

    expect(mockCancel).toHaveBeenCalledWith("payload-uuid-123");
    // Both fields must be populated (not undefined) from the real response.
    expect(outcome.cancelled).toBe(true);
    expect(outcome.reason).toBe("OK");
  });

  it("surfaces a non-OK cancel reason instead of flattening it away", async () => {
    mockCancel.mockResolvedValueOnce(
      makeDeletePayloadResponse({ cancelled: false, reason: "ALREADY_RESOLVED" })
    );

    const client = makeClient();
    const outcome = await client.cancelPayload("payload-uuid-456");

    expect(outcome.cancelled).toBe(false);
    expect(outcome.reason).toBe("ALREADY_RESOLVED");
  });

  it("throws when the SDK returns no result", async () => {
    mockCancel.mockResolvedValueOnce(null);

    const client = makeClient();
    await expect(client.cancelPayload("payload-uuid-404")).rejects.toThrow(
      "Failed to cancel payload payload-uuid-404"
    );
  });
});

// F-981008bf (MEDIUM): none of XamanClient's SDK-calling methods normalized
// failures — createPayload, subscribeToPayload, and getPayloadResult all
// let this.sdk.payload.* exceptions propagate raw, with no try/catch
// anywhere in the class beyond the already-handled null-response checks. A
// transient network drop on the CALLER's side (e.g. mid-scan of a Xaman QR
// code) surfaced as an unidentified raw exception in the CLI/desktop
// caller instead of a clear, structured, creator-comprehensible error with
// the original SDK error preserved as `cause`.

describe("XamanClient.createPayload", () => {
  it("still creates a payload session on success", async () => {
    mockCreate.mockResolvedValueOnce({
      uuid: "payload-uuid-1",
      refs: { qr_png: "https://xumm.app/qr/payload-uuid-1.png", qr_matrix: [] },
      next: { always: "https://xumm.app/sign/payload-uuid-1" },
    });

    const client = makeClient();
    const session = await client.createPayload({
      kind: "configure-minter",
      txjson: { TransactionType: "AccountSet" },
      network: "testnet",
    });

    expect(session.payloadId).toBe("payload-uuid-1");
    expect(session.deeplink).toBe("https://xumm.app/sign/payload-uuid-1");
  });

  it("normalizes a raw SDK rejection into a structured XamanRequestError", async () => {
    mockCreate.mockRejectedValueOnce(new Error("socket hang up"));

    const client = makeClient();
    let caught: unknown;
    try {
      await client.createPayload({
        kind: "configure-minter",
        txjson: { TransactionType: "AccountSet" },
        network: "testnet",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(XamanRequestError);
    const err = caught as XamanRequestError;
    expect(err.message).toContain("socket hang up");
    expect(err.cause).toBeInstanceOf(Error);
    expect((err.cause as Error).message).toBe("socket hang up");
  });

  it("normalizes the already-handled null-response case into XamanRequestError too", async () => {
    mockCreate.mockResolvedValueOnce(null);

    const client = makeClient();
    await expect(
      client.createPayload({
        kind: "configure-minter",
        txjson: { TransactionType: "AccountSet" },
        network: "testnet",
      })
    ).rejects.toBeInstanceOf(XamanRequestError);
  });
});

describe("XamanClient.getPayloadResult", () => {
  it("still returns a resolved result on success", async () => {
    mockGet.mockResolvedValueOnce({
      meta: { resolved: true, signed: true, expired: false, force_network: "TESTNET" },
      response: { txid: "TX123", account: "rSigner" },
    });

    const client = makeClient();
    const result = await client.getPayloadResult("payload-uuid-2");

    expect(result.signed).toBe(true);
    expect(result.txid).toBe("TX123");
    expect(result.signerAddress).toBe("rSigner");
  });

  it("normalizes a raw SDK rejection into a structured XamanRequestError", async () => {
    mockGet.mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const client = makeClient();
    let caught: unknown;
    try {
      await client.getPayloadResult("payload-uuid-3");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(XamanRequestError);
    expect((caught as XamanRequestError).cause).toBeInstanceOf(Error);
  });

  it("normalizes 'payload not found' into XamanRequestError too", async () => {
    mockGet.mockResolvedValueOnce(null);

    const client = makeClient();
    await expect(client.getPayloadResult("missing-uuid")).rejects.toBeInstanceOf(
      XamanRequestError
    );
  });
});

describe("XamanClient.subscribeToPayload", () => {
  it("still resolves normally when the SDK subscription resolves", async () => {
    mockSubscribe.mockResolvedValueOnce({
      resolved: Promise.resolve({ signed: true, txid: "TX999", account: "rSigner" }),
    });

    const client = makeClient();
    const result = await client.subscribeToPayload("payload-uuid-4");

    expect(result.signed).toBe(true);
    expect(result.txid).toBe("TX999");
  });

  // A dropped/failed subscription must fall back to a single one-shot
  // getPayloadResult read instead of propagating the raw subscription
  // failure as if the payload itself had failed — the payload persists
  // server-side on Xaman regardless of this connection.
  it("falls back to a one-shot getPayloadResult read when the subscription itself fails", async () => {
    mockSubscribe.mockRejectedValueOnce(new Error("websocket connection refused"));
    mockGet.mockResolvedValueOnce({
      meta: { resolved: true, signed: true, expired: false, force_network: "TESTNET" },
      response: { txid: "TX_FALLBACK", account: "rSigner" },
    });

    const client = makeClient();
    const result = await client.subscribeToPayload("payload-uuid-5");

    expect(result.signed).toBe(true);
    expect(result.txid).toBe("TX_FALLBACK");
    expect(mockGet).toHaveBeenCalledWith("payload-uuid-5");
  });

  it("throws a structured XamanRequestError when BOTH the subscription and the fallback fail", async () => {
    mockSubscribe.mockRejectedValueOnce(new Error("websocket connection refused"));
    mockGet.mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const client = makeClient();
    let caught: unknown;
    try {
      await client.subscribeToPayload("payload-uuid-6");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(XamanRequestError);
    expect((caught as XamanRequestError).message).toContain(
      "websocket connection refused"
    );
    expect((caught as XamanRequestError).cause).toBeInstanceOf(Error);
  });
});
