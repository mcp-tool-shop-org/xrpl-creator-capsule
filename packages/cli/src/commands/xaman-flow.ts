/**
 * Xaman-mediated signing flows for CLI commands.
 *
 * These replace local wallet signing with Xaman sign requests.
 * The user opens the QR code in Xaman, signs, and we subscribe
 * to the result via websocket.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  assertManifest,
  computeManifestId,
  computeRevisionHash,
} from "@capsule/core";
import {
  XamanClient,
  buildConfigureMinterPayload,
  buildMintPayload,
  verifyPayloadResult,
  verifySignerAddress,
  type XamanNetwork,
  type XamanResolvedResult,
} from "@capsule/xaman";

export interface XamanFlowConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * Durable record of a Xaman mint run that failed partway through.
 *
 * Written to `<manifestPath>.partial-mint.json` before the run rethrows —
 * see PartialXamanMintError doc comment for why this exists.
 */
export interface PartialXamanMintRecord {
  schemaVersion: "1.0.0";
  kind: "partial-xaman-mint";
  manifestId: string;
  revisionHash: string;
  network: XamanNetwork;
  editionSize: number;
  mintedEditions: Array<{
    index: number;
    txid?: string;
    signerAddress?: string;
  }>;
  /** 0-based index of the edition whose signature failed. */
  failedAtEdition: number;
  recordedAt: string;
}

/**
 * Thrown when mintReleaseViaXaman fails partway through an edition run.
 *
 * This is the Xaman-flow counterpart to @capsule/xrpl's PartialMintError
 * (F-d186739a) and app/src/state/release.tsx's in-flight mint guard
 * (F-74549b0b) — the same failure pattern, missed a third time in this
 * package's own Xaman path. Every edition already pushed into `results`
 * before the failure is a real, irreversible, fee-paying on-chain
 * NFTokenMint that the signer already approved in Xaman. Discarding that
 * list (the old behavior: throw a bare Error and let `results` fall out of
 * scope) means a naive rerun has no way to know those editions exist, so it
 * restarts from edition 0 and double-mints them. This error carries the
 * already-confirmed results plus the path of the on-disk record written
 * before the throw, so the caller can report — and a human can recover —
 * instead of losing the information.
 */
export class PartialXamanMintError extends Error {
  /** Xaman-resolved results for every edition that signed successfully before the failure. */
  readonly results: XamanResolvedResult[];
  /** Total editions the run was attempting to mint. */
  readonly editionSize: number;
  readonly manifestId: string;
  readonly revisionHash: string;
  /** Path of the PartialXamanMintRecord written to disk before this was thrown. */
  readonly recordPath: string;

  constructor(
    message: string,
    partial: {
      results: XamanResolvedResult[];
      editionSize: number;
      manifestId: string;
      revisionHash: string;
      recordPath: string;
    },
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "PartialXamanMintError";
    this.results = partial.results;
    this.editionSize = partial.editionSize;
    this.manifestId = partial.manifestId;
    this.revisionHash = partial.revisionHash;
    this.recordPath = partial.recordPath;
  }
}

function requireXamanConfig(): XamanFlowConfig {
  const apiKey = process.env.XAMAN_API_KEY;
  const apiSecret = process.env.XAMAN_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Xaman credentials required. Set XAMAN_API_KEY and XAMAN_API_SECRET " +
        "environment variables. Get these from the Xaman Developer Console."
    );
  }

  return { apiKey, apiSecret };
}

/**
 * Configure minter via Xaman signing.
 *
 * The issuer opens the QR in Xaman and signs the AccountSet transaction.
 */
export async function configureMinterViaXaman(
  operatorAddress: string,
  network: XamanNetwork
): Promise<XamanResolvedResult> {
  const config = requireXamanConfig();
  const client = new XamanClient(config);

  const payload = buildConfigureMinterPayload(operatorAddress, network);
  const session = await client.createPayload(payload);

  console.log(`\nScan this QR code in Xaman to authorize minter:`);
  console.log(`  QR: ${session.qrPngUrl}`);
  console.log(`  Deeplink: ${session.deeplink}`);
  console.log(`\nWaiting for signature...`);

  const result = await client.subscribeToPayload(session.payloadId, (event) => {
    if (event.opened) {
      console.log("  Payload opened in Xaman...");
    }
  });

  const verification = verifyPayloadResult(result);
  if (!verification.valid) {
    throw new Error(
      `Xaman signing failed:\n${verification.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }

  console.log(`  Signed! TX: ${result.txid}`);
  return result;
}

/**
 * Mint release via Xaman signing.
 *
 * The operator opens the QR in Xaman and signs each NFTokenMint transaction.
 * For multi-edition mints, each edition is a separate sign request.
 */
export async function mintReleaseViaXaman(
  manifestPath: string,
  network: XamanNetwork,
  expectedOperator?: string
): Promise<{
  manifestId: string;
  revisionHash: string;
  results: XamanResolvedResult[];
}> {
  const config = requireXamanConfig();
  const client = new XamanClient(config);

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = assertManifest(JSON.parse(manifestRaw));

  const manifestId = computeManifestId(manifest);
  const revisionHash = computeRevisionHash(manifest);

  console.log(`\nMinting: ${manifest.title} by ${manifest.artist}`);
  console.log(`Manifest ID: ${manifestId.slice(0, 16)}...`);
  console.log(`Editions: ${manifest.editionSize}`);

  const results: XamanResolvedResult[] = [];

  for (let i = 0; i < manifest.editionSize; i++) {
    console.log(`\n--- Edition ${i + 1}/${manifest.editionSize} ---`);

    const payload = buildMintPayload(manifest, network);
    const session = await client.createPayload(payload);

    console.log(`Scan QR in Xaman to mint edition ${i + 1}:`);
    console.log(`  QR: ${session.qrPngUrl}`);
    console.log(`  Deeplink: ${session.deeplink}`);
    console.log(`Waiting for signature...`);

    const result = await client.subscribeToPayload(
      session.payloadId,
      (event) => {
        if (event.opened) {
          console.log("  Payload opened in Xaman...");
        }
      }
    );

    // Verify the signing result
    const verification = expectedOperator
      ? verifySignerAddress(result, expectedOperator)
      : verifyPayloadResult(result);

    if (!verification.valid) {
      // Every entry already in `results` is a real, irreversible mint the
      // signer already approved in Xaman — see PartialXamanMintError doc
      // comment. Persist that record to disk BEFORE rethrowing, so it
      // survives even if this process exits and console output scrolls
      // past, then surface it loudly so a bare rerun is never the operator's
      // uninformed next move.
      const recordPath = `${manifestPath}.partial-mint.json`;
      const record: PartialXamanMintRecord = {
        schemaVersion: "1.0.0",
        kind: "partial-xaman-mint",
        manifestId,
        revisionHash,
        network,
        editionSize: manifest.editionSize,
        mintedEditions: results.map((r, idx) => ({
          index: idx,
          txid: r.txid,
          signerAddress: r.signerAddress,
        })),
        failedAtEdition: i,
        recordedAt: new Date().toISOString(),
      };

      try {
        await writeFile(recordPath, JSON.stringify(record, null, 2) + "\n");
      } catch (writeErr) {
        console.error(
          `WARNING: failed to persist partial-mint record to ${recordPath}: ` +
            `${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
        );
      }

      console.error(`\n=== PARTIAL MINT — DO NOT BLINDLY RERUN ===`);
      console.error(
        `${results.length}/${manifest.editionSize} edition(s) already minted on-ledger via Xaman ` +
          `before edition ${i + 1} failed:`
      );
      for (const [idx, r] of results.entries()) {
        console.error(
          `  Edition ${idx + 1}: TX ${r.txid ?? "(no txid)"}` +
            `${r.signerAddress ? ` signed by ${r.signerAddress}` : ""}`
        );
      }
      console.error(
        `A bare rerun of this command will re-mint editions 1-${results.length} as NEW, ` +
          `DISTINCT tokens with re-charged fees.`
      );
      console.error(`Partial mint record written to: ${recordPath}\n`);

      throw new PartialXamanMintError(
        `Xaman mint failed for edition ${i + 1}/${manifest.editionSize} after ` +
          `${results.length} already-confirmed mint(s) ` +
          `(txids: ${results.map((r) => r.txid ?? "unknown").join(", ") || "none"}): ` +
          `${verification.errors.map((e) => e).join("; ")}`,
        {
          results: [...results],
          editionSize: manifest.editionSize,
          manifestId,
          revisionHash,
          recordPath,
        }
      );
    }

    console.log(`  Edition ${i + 1} minted! TX: ${result.txid}`);
    results.push(result);
  }

  return { manifestId, revisionHash, results };
}
