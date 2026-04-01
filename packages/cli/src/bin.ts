#!/usr/bin/env node

import { parseArgs } from "node:util";
import { createRelease } from "./commands/create-release.js";
import { validateManifestFile } from "./commands/validate.js";
import { resolveManifestFile } from "./commands/resolve.js";
import { initWallets } from "./commands/init-wallets.js";
import { configureMinter } from "./commands/configure-minter.js";
import { mintReleaseCommand } from "./commands/mint-release.js";
import { verifyRelease } from "./commands/verify-release.js";
import { grantAccess } from "./commands/grant-access.js";
import { configureMinterViaXaman, mintReleaseViaXaman } from "./commands/xaman-flow.js";
import { MockDeliveryProvider } from "@capsule/storage";
import type { NetworkId } from "@capsule/xrpl";
import type { XamanNetwork } from "@capsule/xaman";

const COMMANDS: Record<string, string> = {
  "init-wallets": "Generate and fund issuer + operator wallet pair",
  "configure-minter": "Set operator as authorized minter on issuer account",
  "create-release": "Create a release from a manifest input file",
  validate: "Validate a Release Manifest against the schema",
  resolve: "Check that manifest pointers (CIDs, URLs) are structurally valid",
  "mint-release": "Mint NFT editions from a manifest and emit issuance receipt",
  "verify-release": "Reconcile manifest + receipt against chain state",
  "grant-access": "Evaluate access request and emit grant receipt",
  "create-access-policy": "Generate an access policy from manifest + receipt",
};

function parseNetwork(args: string[]): NetworkId {
  const { values } = parseArgs({
    args,
    options: { network: { type: "string", default: "testnet" } },
    allowPositionals: true,
  });
  const network = values.network as NetworkId;
  if (!["testnet", "devnet", "mainnet"].includes(network)) {
    console.error(`Invalid network: ${network}`);
    process.exit(1);
  }
  return network;
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: capsule <command> [options]\n");
    console.log("Commands:");
    for (const [name, desc] of Object.entries(COMMANDS)) {
      console.log(`  ${name.padEnd(20)} ${desc}`);
    }
    process.exit(0);
  }

  switch (command) {
    case "init-wallets": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          network: { type: "string", default: "testnet" },
          output: { type: "string", short: "o", default: "wallets.json" },
          fund: { type: "boolean", default: false },
          authorize: { type: "boolean", default: false },
        },
      });

      const network = values.network as NetworkId;
      if (!["testnet", "devnet", "mainnet"].includes(network)) {
        console.error(`Invalid network: ${network}`);
        process.exit(1);
      }

      console.log(`Generating wallet pair on ${network}...`);
      const result = await initWallets({
        network,
        outputPath: values.output!,
        fund: values.fund!,
        authorize: values.authorize!,
      });

      console.log(`Issuer:   ${result.issuerAddress}`);
      console.log(`Operator: ${result.operatorAddress}`);
      console.log(`Funded:   ${result.funded}`);
      console.log(`Authorized minter: ${result.authorized}`);
      console.log(`Credentials written to: ${values.output}`);
      break;
    }

    case "configure-minter": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          wallets: { type: "string", short: "w", default: "wallets.json" },
          network: { type: "string", default: "testnet" },
          via: { type: "string" },
          operator: { type: "string" },
          "allow-mainnet-write": { type: "boolean", default: false },
        },
      });

      const network = values.network as NetworkId;

      if (values.via === "xaman") {
        if (!values.operator) {
          console.error("--operator is required with --via xaman");
          process.exit(1);
        }
        if (network === "devnet") {
          console.error("Xaman does not support devnet");
          process.exit(1);
        }
        const result = await configureMinterViaXaman(
          values.operator,
          network as XamanNetwork
        );
        console.log(`Authorized minter via Xaman. TX: ${result.txid}`);
      } else {
        console.log(`Configuring authorized minter on ${network}...`);
        const result = await configureMinter({
          walletsPath: values.wallets!,
          network,
          allowMainnetWrite: values["allow-mainnet-write"],
        });

        console.log(`Issuer:   ${result.issuerAddress}`);
        console.log(`Operator: ${result.operatorAddress}`);
        console.log(`Authorized: ${result.authorized}`);
        if (!result.authorized) {
          console.error(`Verification failed: ${result.verification.error}`);
          process.exit(1);
        }
      }
      break;
    }

    case "create-release": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          input: { type: "string", short: "i" },
          output: { type: "string", short: "o", default: "release.json" },
        },
      });

      if (!values.input) {
        console.error("--input (-i) is required");
        process.exit(1);
      }

      const manifest = await createRelease({
        inputPath: values.input,
        outputPath: values.output!,
      });

      console.log(`Release created: ${manifest.title}`);
      console.log(`ID: ${manifest.id}`);
      console.log(`Written to: ${values.output}`);
      break;
    }

    case "validate": {
      const filePath = process.argv[3];
      if (!filePath) {
        console.error("Usage: capsule validate <manifest.json>");
        process.exit(1);
      }

      const result = await validateManifestFile(filePath);
      if (result.valid) {
        console.log("Manifest is valid.");
      } else {
        console.error("Manifest validation failed:");
        for (const err of result.errors) {
          console.error(`  - ${err}`);
        }
        process.exit(1);
      }
      break;
    }

    case "resolve": {
      const filePath = process.argv[3];
      if (!filePath) {
        console.error("Usage: capsule resolve <manifest.json>");
        process.exit(1);
      }

      const result = await resolveManifestFile(filePath);
      for (const check of result.checks) {
        const icon = check.passed ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${check.name}: ${check.detail}`);
      }

      if (!result.passed) {
        process.exit(1);
      }
      break;
    }

    case "mint-release": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          manifest: { type: "string", short: "m" },
          wallets: { type: "string", short: "w", default: "wallets.json" },
          network: { type: "string", default: "testnet" },
          via: { type: "string" },
          operator: { type: "string" },
          out: { type: "string", short: "o", default: "issuance-receipt.json" },
          "allow-mainnet-write": { type: "boolean", default: false },
        },
      });

      if (!values.manifest) {
        console.error("--manifest (-m) is required");
        process.exit(1);
      }

      const network = values.network as NetworkId;

      if (values.via === "xaman") {
        if (network === "devnet") {
          console.error("Xaman does not support devnet");
          process.exit(1);
        }
        const result = await mintReleaseViaXaman(
          values.manifest,
          network as XamanNetwork,
          values.operator
        );
        console.log(`\nMint complete via Xaman.`);
        console.log(`Manifest ID: ${result.manifestId.slice(0, 16)}...`);
        console.log(`Revision Hash: ${result.revisionHash.slice(0, 16)}...`);
        console.log(`Editions minted: ${result.results.length}`);
        for (const r of result.results) {
          console.log(`  TX: ${r.txid}`);
        }
        break;
      }

      console.log(`Minting release on ${network}...`);

      const receipt = await mintReleaseCommand({
        manifestPath: values.manifest,
        walletsPath: values.wallets!,
        network,
        receiptPath: values.out!,
        allowMainnetWrite: values["allow-mainnet-write"],
      });

      console.log(`Release: ${receipt.release.title} by ${receipt.release.artist}`);
      console.log(`Manifest ID: ${receipt.manifestId.slice(0, 16)}...`);
      console.log(`Revision Hash: ${receipt.manifestRevisionHash.slice(0, 16)}...`);
      console.log(`Minted ${receipt.xrpl.nftTokenIds.length} edition(s)`);
      console.log(`Receipt written to: ${values.out}`);
      break;
    }

    case "verify-release": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          manifest: { type: "string", short: "m" },
          receipt: { type: "string", short: "r" },
        },
      });

      if (!values.manifest || !values.receipt) {
        console.error(
          "Usage: capsule verify-release --manifest <file> --receipt <file>"
        );
        process.exit(1);
      }

      const result = await verifyRelease(values.manifest, values.receipt);
      for (const check of result.checks) {
        const icon = check.passed ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${check.name}: ${check.detail}`);
      }

      if (!result.passed) {
        console.error("\nVerification FAILED");
        process.exit(1);
      } else {
        console.log("\nVerification PASSED");
      }
      break;
    }

    case "create-access-policy": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          manifest: { type: "string", short: "m" },
          receipt: { type: "string", short: "r" },
          output: { type: "string", short: "o", default: "access-policy.json" },
          ttl: { type: "string", default: "3600" },
        },
      });

      if (!values.manifest || !values.receipt) {
        console.error(
          "Usage: capsule create-access-policy --manifest <file> --receipt <file>"
        );
        process.exit(1);
      }

      const { readFile, writeFile } = await import("node:fs/promises");
      const { assertManifest, assertReceipt, computeManifestId } = await import("@capsule/core");

      const manifest = assertManifest(JSON.parse(await readFile(values.manifest, "utf-8")));
      const receipt = assertReceipt(JSON.parse(await readFile(values.receipt, "utf-8")));

      const policy = {
        schemaVersion: "1.0.0" as const,
        kind: "access-policy" as const,
        manifestId: computeManifestId(manifest),
        label: `${manifest.benefit.kind} for ${manifest.title} holders`,
        benefit: {
          kind: manifest.benefit.kind,
          contentPointer: manifest.benefit.contentPointer,
        },
        rule: {
          type: "holds-nft" as const,
          issuerAddress: manifest.issuerAddress,
          qualifyingTokenIds: receipt.xrpl.nftTokenIds,
        },
        delivery: {
          mode: "download-token" as const,
          ttlSeconds: parseInt(values.ttl!, 10),
        },
        createdAt: new Date().toISOString(),
      };

      await writeFile(values.output!, JSON.stringify(policy, null, 2) + "\n");
      console.log(`Access policy created: ${policy.label}`);
      console.log(`Benefit: ${policy.benefit.kind}`);
      console.log(`Qualifying tokens: ${policy.rule.qualifyingTokenIds.length}`);
      console.log(`TTL: ${policy.delivery.ttlSeconds}s`);
      console.log(`Written to: ${values.output}`);
      break;
    }

    case "grant-access": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          manifest: { type: "string", short: "m" },
          receipt: { type: "string", short: "r" },
          policy: { type: "string", short: "p" },
          wallet: { type: "string", short: "w" },
          out: { type: "string", short: "o", default: "access-grant.json" },
        },
      });

      if (!values.manifest || !values.receipt || !values.policy || !values.wallet) {
        console.error(
          "Usage: capsule grant-access --manifest <file> --receipt <file> --policy <file> --wallet <address>"
        );
        process.exit(1);
      }

      const result = await grantAccess({
        manifestPath: values.manifest,
        receiptPath: values.receipt,
        policyPath: values.policy,
        walletAddress: values.wallet,
        deliveryProvider: new MockDeliveryProvider(),
      });

      const { writeFile: writeOut } = await import("node:fs/promises");
      await writeOut(values.out!, JSON.stringify(result, null, 2) + "\n");

      if (result.decision === "allow") {
        console.log(`ACCESS GRANTED`);
        console.log(`  Benefit: ${result.benefit.kind}`);
        console.log(`  Token: ${result.delivery!.token}`);
        console.log(`  Expires: ${result.delivery!.expiresAt}`);
      } else {
        console.log(`ACCESS DENIED`);
        console.log(`  Reason: ${result.reason}`);
      }

      console.log(`Grant receipt written to: ${values.out}`);

      if (result.decision === "deny") {
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
