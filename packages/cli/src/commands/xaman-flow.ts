/**
 * Xaman-mediated signing flows for CLI commands.
 *
 * These replace local wallet signing with Xaman sign requests.
 * The user opens the QR code in Xaman, signs, and we subscribe
 * to the result via websocket.
 */

import { readFile } from "node:fs/promises";
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
      throw new Error(
        `Xaman mint failed for edition ${i + 1}:\n${verification.errors.map((e) => `  - ${e}`).join("\n")}`
      );
    }

    console.log(`  Edition ${i + 1} minted! TX: ${result.txid}`);
    results.push(result);
  }

  return { manifestId, revisionHash, results };
}
