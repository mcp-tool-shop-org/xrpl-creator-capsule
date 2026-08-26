import { describe, it, expect, vi } from "vitest";

// F-3c2c1fd7: xumm-sdk's real XummDeletePayloadResponse nests `cancelled`
// and `reason` under `result.result`, not top-level on the response. The
// old code read `result.cancelled` / `result.reason` directly, which are
// always undefined against the real SDK shape — every cancellation looked
// identical to a failed one. This mock is shaped exactly like the SDK's
// XummDeletePayloadResponse (see xumm-sdk/dist/src/types/xumm-api/index.d.ts)
// with `cancelled`/`reason` present ONLY at the nested location, so a
// regression back to top-level reads fails this test.
const { mockCancel } = vi.hoisted(() => {
  return { mockCancel: vi.fn() };
});

vi.mock("xumm-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xumm-sdk")>();
  return {
    ...actual,
    XummSdk: vi.fn().mockImplementation(() => ({
      payload: {
        cancel: mockCancel,
      },
    })),
  };
});

import { XamanClient } from "./client.js";

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
