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
import type {
  XamanPayloadRequest,
  XamanPayloadSession,
  XamanResolvedResult,
  XamanStatusEvent,
} from "./types.js";

export interface XamanClientConfig {
  apiKey: string;
  apiSecret: string;
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
      throw new Error("Failed to create Xaman payload");
    }

    return {
      payloadId: payload.uuid,
      qrPngUrl: payload.refs.qr_png,
      qrMatrix: payload.refs.qr_matrix,
      deeplink: payload.next.always,
      websocketUrl: payload.refs.websocket_status,
    };
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
    const resolvedData = await subscription.resolved;

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
  ): Promise<{ cancelled: boolean; reason: string }> {
    const result = await this.sdk.payload.cancel(payloadId);
    if (!result) {
      throw new Error(`Failed to cancel payload ${payloadId}`);
    }
    return {
      cancelled: result.cancelled,
      reason: result.reason,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Infer the TransactionType if not already set in txjson.
   * Falls back based on payload kind.
   */
  private inferTxType(request: XamanPayloadRequest): string {
    if (request.txjson.TransactionType) {
      return request.txjson.TransactionType as string;
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
