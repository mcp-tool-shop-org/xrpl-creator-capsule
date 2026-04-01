/**
 * @capsule/xaman types — wallet-mediated signing adapter.
 *
 * These are Capsule's own types. They wrap but do not re-export
 * xumm-sdk internals, keeping the adapter boundary clean.
 */

export type PayloadKind =
  | "configure-minter"
  | "mint-release"
  | "buy-release";

export type XamanNetwork = "testnet" | "mainnet";

/**
 * Request to create a Xaman sign payload.
 * txjson uses XRPL transaction JSON syntax and can be incomplete —
 * Xaman fills Account, Fee, Sequence for the signing user.
 */
export interface XamanPayloadRequest {
  kind: PayloadKind;
  txjson: Record<string, unknown>;
  network: XamanNetwork;
  returnUrl?: string;
  /** Capsule-specific metadata attached to the payload */
  metadata?: Record<string, string>;
}

/**
 * Active payload session — returned after creation.
 * Contains everything needed to present the signing UX to the user.
 */
export interface XamanPayloadSession {
  payloadId: string;
  qrPngUrl: string;
  qrMatrix: string;
  deeplink: string;
  websocketUrl: string;
}

/**
 * Resolved payload result — after user signs or rejects.
 */
export interface XamanResolvedResult {
  payloadId: string;
  resolved: boolean;
  signed: boolean;
  rejected: boolean;
  expired: boolean;
  txid?: string;
  signerAddress?: string;
  network?: string;
}

/**
 * Websocket status event — emitted during live subscription.
 */
export interface XamanStatusEvent {
  payloadId: string;
  /** true when the payload has been opened in Xaman */
  opened: boolean;
  /** true when resolved (signed, rejected, or expired) */
  resolved: boolean;
  /** Raw event data from the websocket */
  raw?: Record<string, unknown>;
}
