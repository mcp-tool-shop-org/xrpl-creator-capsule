/**
 * ContentStore — the storage boundary.
 *
 * All issuance and resolution logic talks to this interface.
 * Swap implementations (mock, Helia, pinning API) without touching
 * the Release Manifest or XRPL layers.
 */

export interface ContentStore {
  /**
   * Store content and return its content identifier (CID).
   * The CID must be deterministic for the same input bytes.
   */
  put(content: Uint8Array, filename?: string): Promise<string>;

  /**
   * Retrieve content by CID.
   * Returns null if not found.
   */
  get(cid: string): Promise<Uint8Array | null>;

  /**
   * Check whether content exists for a given CID.
   */
  has(cid: string): Promise<boolean>;
}
