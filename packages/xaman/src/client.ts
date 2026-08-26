/**
 * Xaman client adapter — wraps the xumm-sdk for Capsule's needs.
 *
 * Responsibilities:
 * - Payload creation from Capsule tx templates
 * - QR/deeplink delivery
 * - Websocket status subscription (not polling)
 * - Signed-result normalization
 *
 * Does NOT:
 * - Touch ReleaseManifest or IssuanceReceipt (wallet-agnostic contracts)
 * - Handle on-ledger verification (that's @capsule/xrpl's job)
 * - Manage xApp flows or discovery UI
 */

import { XummSdk } from "xumm-sdk";
import type { XummTypes } from "xumm-sdk";
import type {
  XamanPayloadRequest,
  XamanPayloadSession,
  XamanResolvedResult,
  XamanStatusEvent,
} from "./types.js";

/**
 * The exact literal union xumm-sdk's XummJsonTransaction.TransactionType
 * expects. Derived via indexed access (rather than hand-copied) so this
 * stays correct if the SDK's transaction-type union changes.
 */
type XummTxType = XummTypes.XummJsonTransaction["TransactionType"];

export interface XamanClientConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * Thrown when a XamanClient SDK call fails, or when the SDK's own
 * already-handled "no payload returned" check trips.
 *
 * This is the @capsule/xaman counterpart to @capsule/xrpl's
 * PartialMintError and packages/cli's PartialXamanMintError — same
 * message + `cause`-preserves-the-original-error convention, applied here
 * to a single SDK call rather than a partial multi-step run. Before this
 * (F-981008bf), none of createPayload / subscribeToPayload /
 * getPayloadResult normalized failures: a raw xumm-sdk rejection (e.g. a
 * transient network drop while a user is mid-scan of a Xaman QR code)
 * propagated straight out of this class with no try/catch anywhere beyond
 * the already-handled null-response checks, indistinguishable from any
 * other bug to the CLI/desktop caller. Every XamanClient failure now
 * throws this ONE type, with a creator-comprehensible message and the
 * original SDK error preserved as `cause` rather than discarded.
 */
export class XamanRequestError extends Error {
  /** Which XamanClient operation failed. */
  readonly operation: "createPayload" | "subscribeToPayload" | "getPayloadResult";
  /** The payload UUID involved, when one exists yet (absent for createPayload). */
  readonly payloadId?: string;

  constructor(
    message: string,
    info: {
      operation: XamanRequestError["operation"];
      payloadId?: string;
    },
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "XamanRequestError";
    this.operation = info.operation;
    this.payloadId = info.payloadId;
  }
}

export class XamanClient {
  private sdk: XummSdk;

  constructor(config: XamanClientConfig) {
    this.sdk = new XummSdk(config.apiKey, config.apiSecret);
  }

  /**
   * Create a sign request payload.
   *
   * The txjson can be incomplete — Xaman fills Account, Fee, Sequence
   * for the user who signs it in-wallet.
   */
  async createPayload(
    request: XamanPayloadRequest
  ): Promise<XamanPayloadSession> {
    const networkMap: Record<string, string> = {
      testnet: "TESTNET",
      mainnet: "MAINNET",
    };

    try {
      const payload = await this.sdk.payload.create({
        txjson: {
          TransactionType: this.inferTxType(request),
          ...request.txjson,
        },
        options: {
          submit: true,
          force_network: networkMap[request.network],
          return_url: request.returnUrl
            ? { web: request.returnUrl }
            : undefined,
        },
        custom_meta: request.metadata
          ? {
              identifier: request.kind,
              blob: request.metadata,
            }
          : { identifier: request.kind },
      });

      if (!payload) {
        throw new XamanRequestError(
          "Xaman returned no payload for the sign request",
          { operation: "createPayload" }
        );
      }

      return {
        payloadId: payload.uuid,
        qrPngUrl: payload.refs.qr_png,
        qrMatrix: payload.refs.qr_matrix,
        deeplink: payload.next.always,
        websocketUrl: payload.refs.websocket_status,
      };
    } catch (err) {
      if (err instanceof XamanRequestError) throw err;
      throw new XamanRequestError(
        `Failed to create Xaman payload: ${err instanceof Error ? err.message : String(err)}`,
        { operation: "createPayload" },
        { cause: err }
      );
    }
  }

  /**
   * Subscribe to live status updates via websocket.
   *
   * This is the recommended approach — Xaman docs explicitly say
   * polling is not recommended.
   *
   * Returns the final resolved result when the payload completes.
   */
  async subscribeToPayload(
    payloadId: string,
    onEvent?: (event: XamanStatusEvent) => void
  ): Promise<XamanResolvedResult> {
    let resolvedData: unknown;
    try {
      const subscription = await this.sdk.payload.subscribe(payloadId, (event) => {
        if (onEvent && event.data) {
          const data = event.data as Record<string, unknown>;
          onEvent({
            payloadId,
            opened: Boolean(data.opened),
            resolved: Boolean(data.signed || data.return_url),
            raw: data,
          });
        }
      });

      // The subscription resolves when the payload is finalized
      resolvedData = await subscription.resolved;
    } catch (subscribeErr) {
      // F-981008bf: the subscription itself failed to establish, or was
      // lost mid-wait (e.g. a transient network drop on the caller's side
      // while a user is mid-scan of a Xaman QR code). The payload persists
      // server-side on Xaman regardless of THIS connection and may still
      // get signed successfully moments later, so fall back to a single
      // one-shot status read instead of reporting the payload itself as
      // failed. Only if that fallback ALSO fails do we give up and throw —
      // clearly naming both problems rather than letting the raw
      // subscription exception propagate as if signing had failed.
      try {
        return await this.fetchPayloadResult(payloadId);
      } catch (fallbackErr) {
        throw new XamanRequestError(
          `Xaman payload subscription lost for ${payloadId} and the fallback status check ` +
            `also failed. The payload may still resolve on Xaman's side even though this ` +
            `connection could not confirm it — retry getPayloadResult(${payloadId}) later. ` +
            `Subscription error: ${subscribeErr instanceof Error ? subscribeErr.message : String(subscribeErr)}`,
          { operation: "subscribeToPayload", payloadId },
          { cause: subscribeErr }
        );
      }
    }

    if (!resolvedData) {
      return {
        payloadId,
        resolved: false,
        signed: false,
        rejected: false,
        expired: true,
      };
    }

    return this.normalizeResult(payloadId, resolvedData);
  }

  /**
   * Get the current status of a payload (one-shot read).
   *
   * Use this for verification after the fact, NOT for polling.
   */
  async getPayloadResult(payloadId: string): Promise<XamanResolvedResult> {
    try {
      return await this.fetchPayloadResult(payloadId);
    } catch (err) {
      throw new XamanRequestError(
        `Failed to get Xaman payload ${payloadId} status: ${err instanceof Error ? err.message : String(err)}`,
        { operation: "getPayloadResult", payloadId },
        { cause: err }
      );
    }
  }

  /**
   * Shared, UNNORMALIZED core for a one-shot payload status read: calls the
   * SDK and maps its response, throwing a plain Error on failure. Callers
   * (getPayloadResult, and subscribeToPayload's post-drop fallback above)
   * each wrap this in their own XamanRequestError so the reported
   * `operation` matches what the CALLER was actually trying to do, rather
   * than always saying "getPayloadResult" even when this was really a
   * subscribeToPayload fallback probe.
   */
  private async fetchPayloadResult(payloadId: string): Promise<XamanResolvedResult> {
    const payload = await this.sdk.payload.get(payloadId);

    if (!payload) {
      throw new Error(`Payload ${payloadId} not found`);
    }

    return {
      payloadId,
      resolved: payload.meta.resolved,
      signed: payload.meta.signed,
      rejected: !payload.meta.signed && payload.meta.resolved,
      expired: payload.meta.expired,
      txid: payload.response.txid ?? undefined,
      signerAddress: payload.response.account ?? undefined,
      network: payload.meta.force_network ?? undefined,
    };
  }

  /**
   * Cancel a pending payload.
   */
  async cancelPayload(
    payloadId: string
  ): Promise<{ cancelled: boolean; reason: XummTypes.XummCancelReason }> {
    const result = await this.sdk.payload.cancel(payloadId);
    if (!result) {
      throw new Error(`Failed to cancel payload ${payloadId}`);
    }
    // xumm-sdk nests these under `result.result`, not top-level on the
    // response — see XummDeletePayloadResponse in xumm-sdk's types. The
    // previous code read result.cancelled/result.reason directly, which
    // are always undefined on the real SDK response shape.
    return {
      cancelled: result.result.cancelled,
      reason: result.result.reason,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Infer the TransactionType if not already set in txjson.
   * Falls back based on payload kind.
   */
  private inferTxType(request: XamanPayloadRequest): XummTxType {
    if (request.txjson.TransactionType) {
      return request.txjson.TransactionType as XummTxType;
    }

    switch (request.kind) {
      case "configure-minter":
        return "AccountSet";
      case "mint-release":
        return "NFTokenMint";
      case "buy-release":
        return "NFTokenAcceptOffer";
      default:
        throw new Error(
          `Cannot infer TransactionType for kind: ${request.kind}`
        );
    }
  }

  /**
   * Normalize the SDK's resolved payload into our clean result shape.
   */
  private normalizeResult(
    payloadId: string,
    data: unknown
  ): XamanResolvedResult {
    const d = data as Record<string, unknown>;
    const signed = Boolean(d.signed);
    const txid = d.txid as string | undefined;
    const account = d.account as string | undefined;

    return {
      payloadId,
      resolved: true,
      signed,
      rejected: !signed,
      expired: false,
      txid: txid ?? undefined,
      signerAddress: account ?? undefined,
    };
  }
}
