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
import { recoverRelease } from "./commands/recover-release.js";
import { createGovernancePolicy } from "./commands/create-governance-policy.js";
import { proposePayout } from "./commands/propose-payout.js";
import { decidePayout } from "./commands/decide-payout.js";
import { executePayout } from "./commands/execute-payout.js";
import { verifyPayout } from "./commands/verify-payout.js";
import {
  configureMinterViaXaman,
  mintReleaseViaXaman,
  PartialXamanMintError,
} from "./commands/xaman-flow.js";
import { MockDeliveryProvider } from "@capsule/storage";
import type { NetworkId } from "@capsule/xrpl";
import type { XamanNetwork } from "@capsule/xaman";
import { parseJsonArgument, readJsonFile } from "./lib/json-input.js";

interface CommandHelp {
  /** One-line description. */
  summary: string;
  /** Usage line showing the command's flags (no leading "Usage:"). */
  usage: string;
  /** One realistic example invocation (no leading "Example:"). */
  example: string;
}

// F-d092bb7f: --help used to print only this table's `summary` column — no
// flags, no example — for all 15 commands, and no per-command --help/-h
// existed at all (Node's parseArgs runs in strict mode, so any per-command
// --help was rejected as an unrecognized option instead of answered). This
// registry is now the single source for both the top-level command list
// and each command's own --help output, so the two can't drift apart.
const COMMAND_HELP: Record<string, CommandHelp> = {
  "init-wallets": {
    summary: "Generate and fund issuer + operator wallet pair",
    usage:
      "capsule init-wallets [--network <testnet|devnet|mainnet>] [-o, --output <path>] [--fund] [--authorize] [--allow-mainnet-write]",
    example: "capsule init-wallets --network testnet --fund --authorize -o wallets.json",
  },
  "configure-minter": {
    summary: "Set operator as authorized minter on issuer account",
    usage:
      "capsule configure-minter [-w, --wallets <path>] [--network <testnet|devnet|mainnet>] [--via xaman --operator <address>] [--allow-mainnet-write]",
    example: "capsule configure-minter --wallets wallets.json --network testnet",
  },
  "create-release": {
    summary: "Create a release from a manifest input file",
    usage: "capsule create-release -i, --input <file> [-o, --output <file>]",
    example: "capsule create-release --input release-input.json --output release.json",
  },
  validate: {
    summary: "Validate a Release Manifest against the schema",
    usage: "capsule validate <manifest.json>",
    example: "capsule validate release.json",
  },
  resolve: {
    summary: "Check that manifest pointers (CIDs, URLs) are structurally valid",
    usage: "capsule resolve <manifest.json>",
    example: "capsule resolve release.json",
  },
  "mint-release": {
    summary: "Mint NFT editions from a manifest and emit issuance receipt",
    usage:
      "capsule mint-release -m, --manifest <file> [-w, --wallets <path>] [--network <testnet|devnet|mainnet>] [--via xaman --operator <address>] [-o, --out <file>] [--allow-mainnet-write]",
    example: "capsule mint-release --manifest release.json --wallets wallets.json --network testnet",
  },
  "verify-release": {
    summary: "Reconcile manifest + receipt against chain state",
    usage: "capsule verify-release -m, --manifest <file> -r, --receipt <file>",
    example: "capsule verify-release --manifest release.json --receipt issuance-receipt.json",
  },
  "grant-access": {
    summary: "Evaluate access request and emit grant receipt",
    usage:
      "capsule grant-access -m, --manifest <file> -r, --receipt <file> -p, --policy <file> -w, --wallet <address> [-o, --out <file>]",
    example:
      "capsule grant-access --manifest release.json --receipt issuance-receipt.json --policy access-policy.json --wallet rCollectorAddressXXXXXXXXXXXXXXXXXX",
  },
  "create-access-policy": {
    summary: "Generate an access policy from manifest + receipt",
    usage:
      "capsule create-access-policy -m, --manifest <file> -r, --receipt <file> [-o, --output <file>] [--ttl <seconds>]",
    example:
      "capsule create-access-policy --manifest release.json --receipt issuance-receipt.json --ttl 3600",
  },
  "recover-release": {
    summary: "Reconstruct a release from artifacts + chain state",
    usage:
      "capsule recover-release -m, --manifest <file> -r, --receipt <file> [-p, --policy <file>] [-o, --out <file>]",
    example: "capsule recover-release --manifest release.json --receipt issuance-receipt.json",
  },
  "create-governance-policy": {
    summary: "Create a governance policy for a release treasury",
    usage:
      "capsule create-governance-policy -m, --manifest <file> --treasury <address> --signers '<json>' [--threshold <n>] [--network <testnet|devnet|mainnet>] [--assets <comma-list>] [--allow-partial] [--max-outputs <n>]",
    example:
      "capsule create-governance-policy --manifest release.json --treasury rTreasuryAddressXXXXXXXXXXXXXXXXXX --signers '[{\"address\":\"rSignerAddressXXXXXXXXXXXXXXXXXX\",\"weight\":1}]' --threshold 2",
  },
  "propose-payout": {
    summary: "Create a payout proposal against a governance policy",
    usage:
      "capsule propose-payout -p, --policy <file> --id <proposal-id> --outputs '<json>' [--memo <text>]",
    example:
      "capsule propose-payout --policy governance-policy.json --id payout-001 --outputs '[{\"address\":\"rPayeeAddressXXXXXXXXXXXXXXXXXXXX\",\"amount\":\"1000000\",\"asset\":\"XRP\"}]'",
  },
  "decide-payout": {
    summary: "Collect approvals and emit a decision receipt",
    usage: "capsule decide-payout -p, --policy <file> --proposal <file> --approvals '<json>'",
    example:
      "capsule decide-payout --policy governance-policy.json --proposal payout-proposal.json --approvals '[{\"signerAddress\":\"rSignerAddressXXXXXXXXXXXXXXXXXX\",\"approved\":true}]'",
  },
  "execute-payout": {
    summary: "Record payout execution and verify hash chain",
    usage:
      "capsule execute-payout -p, --policy <file> --proposal <file> --decision <file> --tx-hashes '<json>' --executed-outputs '<json>'",
    example:
      "capsule execute-payout --policy governance-policy.json --proposal payout-proposal.json --decision payout-decision.json --tx-hashes '[\"ABCD1234\"]' --executed-outputs '[{\"address\":\"rPayeeAddressXXXXXXXXXXXXXXXXXXXX\",\"amount\":\"1000000\",\"asset\":\"XRP\"}]'",
  },
  "verify-payout": {
    summary: "Verify all 4 governance artifacts and their relationships",
    usage:
      "capsule verify-payout -p, --policy <file> --proposal <file> --decision <file> --execution <file>",
    example:
      "capsule verify-payout --policy governance-policy.json --proposal payout-proposal.json --decision payout-decision.json --execution payout-execution.json",
  },
};

function printTopLevelHelp(): void {
  console.log("Usage: capsule <command> [options]\n");
  console.log("Run `capsule <command> --help` for a command's full flag list and an example.\n");
  console.log("Commands:");
  for (const [name, help] of Object.entries(COMMAND_HELP)) {
    console.log(`  ${name.padEnd(24)} ${help.summary}`);
    console.log(`  ${" ".repeat(24)} ${help.usage}`);
    console.log(`  ${" ".repeat(24)} e.g. ${help.example}`);
    console.log("");
  }
}

function printCommandHelp(command: string): void {
  const help = COMMAND_HELP[command];
  console.log(`capsule ${command}\n`);
  console.log(help.summary);
  console.log(`\nUsage:\n  ${help.usage}`);
  console.log(`\nExample:\n  ${help.example}`);
}

/**
 * F-6d35beac: this used to be declared but never called anywhere — every
 * case block that reads --network reimplemented this exact validation
 * inline instead (and three of the five call sites skipped the validation
 * step entirely, letting an invalid --network value fall through to a
 * confusing failure deep inside a command instead of a clear one here).
 * Signature changed from "parse args and validate" to "validate an
 * already-parsed value" because each case already has its own required
 * parseArgs() call for its other flags — re-parsing argv from scratch here
 * too would either duplicate that work or hit Node's parseArgs strict-mode
 * rejection of the other case's flags. This is now the single validation
 * call site for every case that reads --network.
 */
function parseNetwork(value: string | undefined): NetworkId {
  const network = (value ?? "testnet") as NetworkId;
  if (!["testnet", "devnet", "mainnet"].includes(network)) {
    console.error(`Invalid network: ${network}`);
    process.exit(1);
  }
  return network;
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    printTopLevelHelp();
    process.exit(0);
  }

  // Per-command --help/-h, intercepted once here (rather than duplicated in
  // all 15 case blocks below) so it never reaches that command's own
  // strict parseArgs() call, which would otherwise reject --help as an
  // unrecognized option (F-d092bb7f).
  const commandArgs = process.argv.slice(3);
  if (command in COMMAND_HELP && (commandArgs.includes("--help") || commandArgs.includes("-h"))) {
    printCommandHelp(command);
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
          // F-65e3918c: --authorize performs the exact same on-chain
          // AccountSet authorization that configure-minter and mint-release
          // gate behind --allow-mainnet-write, but this option never
          // existed here. On mainnet, the fail-closed error from
          // authorizeOperatorAsMinter() told the operator to pass this
          // exact flag — which parseArgs' strict mode then rejected as
          // unknown, a documented dead end with no way through. Declaring
          // it here and threading it below closes the loop; the default
          // (false) preserves today's fail-closed behavior exactly.
          "allow-mainnet-write": { type: "boolean", default: false },
        },
      });

      const network = parseNetwork(values.network);

      console.log(`Generating wallet pair on ${network}...`);
      const result = await initWallets({
        network,
        outputPath: values.output!,
        fund: values.fund!,
        authorize: values.authorize!,
        allowMainnetWrite: values["allow-mainnet-write"],
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

      const network = parseNetwork(values.network);

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

      const network = parseNetwork(values.network);

      if (values.via === "xaman") {
        if (!values.operator) {
          console.error("--operator is required with --via xaman");
          process.exit(1);
        }
        if (network === "devnet") {
          console.error("Xaman does not support devnet");
          process.exit(1);
        }
        let result;
        try {
          result = await mintReleaseViaXaman(
            values.manifest,
            network as XamanNetwork,
            values.operator
          );
        } catch (err) {
          if (err instanceof PartialXamanMintError) {
            // Mirrors packages/xrpl/src/issue-release.ts's catch of
            // PartialMintError (F-d186739a): do not let a mid-run failure
            // erase the editions that already minted on-ledger — forward
            // exactly which ones so this cannot be silently double-minted
            // by a naive retry of this same command.
            throw new Error(
              `Xaman mint failed: ${err.message} — ${err.results.length} of ` +
                `${err.editionSize} edition(s) were already minted on-ledger via ` +
                `Xaman before the failure and have NO receipt yet ` +
                `(txids: ${err.results.map((r) => r.txid ?? "unknown").join(", ") || "none"}). ` +
                `Partial mint record: ${err.recordPath}.`,
              { cause: err }
            );
          }
          throw err;
        }
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

      const { writeFile } = await import("node:fs/promises");
      const { assertManifest, assertReceipt, computeManifestId } = await import("@capsule/core");

      // F-5a0ce89b: same unguarded-JSON.parse pattern as the 11 command
      // files, just living inline here instead of in its own commands/
      // file (create-access-policy has no dedicated command module) — not
      // in that finding's original grep list, but the identical defect, so
      // fixed alongside it with the same helper.
      const manifest = assertManifest(await readJsonFile(values.manifest, "manifest"));
      const receipt = assertReceipt(await readJsonFile(values.receipt, "receipt"));

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

    case "recover-release": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          manifest: { type: "string", short: "m" },
          receipt: { type: "string", short: "r" },
          policy: { type: "string", short: "p" },
          out: { type: "string", short: "o", default: "recovery-bundle.json" },
        },
      });

      if (!values.manifest || !values.receipt) {
        console.error(
          "Usage: capsule recover-release --manifest <file> --receipt <file> [--policy <file>]"
        );
        process.exit(1);
      }

      const result = await recoverRelease(
        values.manifest,
        values.receipt,
        values.policy
      );

      // Print reconstruction report
      for (const section of result.reconstruction.sections) {
        const icon = section.passed ? "PASS" : "FAIL";
        console.log(`\n[${icon}] ${section.name}`);
        for (const line of section.lines) {
          console.log(`  ${line}`);
        }
      }

      // Write recovery bundle
      const { writeFile: writeOut } = await import("node:fs/promises");
      await writeOut(values.out!, JSON.stringify(result.bundle, null, 2) + "\n");
      console.log(`\nRecovery bundle written to: ${values.out}`);

      if (!result.reconstruction.passed) {
        console.error("\nRecovery INCOMPLETE — some checks failed");
        process.exit(1);
      } else {
        console.log("\nRecovery COMPLETE — release is fully reconstructable");
      }
      break;
    }

    case "create-governance-policy": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          manifest: { type: "string", short: "m" },
          treasury: { type: "string" },
          network: { type: "string", default: "testnet" },
          signers: { type: "string" }, // JSON array
          threshold: { type: "string", default: "2" },
          assets: { type: "string", default: "XRP" }, // comma-separated
          "allow-partial": { type: "boolean", default: false },
          "max-outputs": { type: "string" },
          "created-by": { type: "string", default: "capsule-cli" },
          out: { type: "string", short: "o", default: "governance-policy.json" },
        },
      });

      if (!values.manifest || !values.treasury || !values.signers) {
        console.error(
          "Usage: capsule create-governance-policy --manifest <file> --treasury <address> --signers '<json>' [--threshold N]"
        );
        process.exit(1);
      }

      const network = parseNetwork(values.network);

      const policy = await createGovernancePolicy({
        manifestPath: values.manifest,
        treasuryAddress: values.treasury,
        network,
        signers: parseJsonArgument(values.signers, "--signers"),
        threshold: parseInt(values.threshold!, 10),
        allowedAssets: values.assets!.split(","),
        allowPartialPayouts: values["allow-partial"],
        maxOutputsPerProposal: values["max-outputs"]
          ? parseInt(values["max-outputs"], 10)
          : undefined,
        createdBy: values["created-by"]!,
        outputPath: values.out!,
      });

      console.log(`Governance policy created`);
      console.log(`  Manifest: ${policy.manifestId.slice(0, 16)}...`);
      console.log(`  Treasury: ${policy.treasuryAddress}`);
      console.log(`  Signers: ${policy.signerPolicy.signers.length}`);
      console.log(`  Threshold: ${policy.signerPolicy.threshold}`);
      console.log(`  Policy hash: ${policy.policyHash!.slice(0, 16)}...`);
      console.log(`Written to: ${values.out}`);
      break;
    }

    case "propose-payout": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          policy: { type: "string", short: "p" },
          id: { type: "string" },
          outputs: { type: "string" }, // JSON array
          memo: { type: "string" },
          "created-by": { type: "string", default: "capsule-cli" },
          out: { type: "string", short: "o", default: "payout-proposal.json" },
        },
      });

      if (!values.policy || !values.id || !values.outputs) {
        console.error(
          "Usage: capsule propose-payout --policy <file> --id <proposal-id> --outputs '<json>'"
        );
        process.exit(1);
      }

      const proposal = await proposePayout({
        policyPath: values.policy,
        proposalId: values.id,
        outputs: parseJsonArgument(values.outputs, "--outputs"),
        createdBy: values["created-by"]!,
        memo: values.memo,
        outputPath: values.out!,
      });

      console.log(`Payout proposal created`);
      console.log(`  Proposal ID: ${proposal.proposalId}`);
      console.log(`  Outputs: ${proposal.outputs.length}`);
      console.log(`  Proposal hash: ${proposal.proposalHash!.slice(0, 16)}...`);
      console.log(`Written to: ${values.out}`);
      break;
    }

    case "decide-payout": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          policy: { type: "string", short: "p" },
          proposal: { type: "string" },
          approvals: { type: "string" }, // JSON array
          "decided-by": { type: "string", default: "capsule-cli" },
          out: { type: "string", short: "o", default: "payout-decision.json" },
        },
      });

      if (!values.policy || !values.proposal || !values.approvals) {
        console.error(
          "Usage: capsule decide-payout --policy <file> --proposal <file> --approvals '<json>'"
        );
        process.exit(1);
      }

      const decision = await decidePayout({
        policyPath: values.policy,
        proposalPath: values.proposal,
        approvals: parseJsonArgument(values.approvals, "--approvals"),
        decidedBy: values["decided-by"]!,
        outputPath: values.out!,
      });

      console.log(`Payout decision recorded`);
      console.log(`  Outcome: ${decision.decision.outcome}`);
      console.log(`  Threshold met: ${decision.decision.thresholdMet}`);
      console.log(`  Approved: ${decision.decision.approvedCount}, Rejected: ${decision.decision.rejectedCount}`);
      console.log(`  Decision hash: ${decision.decisionHash!.slice(0, 16)}...`);
      console.log(`Written to: ${values.out}`);

      if (decision.decision.outcome === "rejected") {
        process.exit(1);
      }
      break;
    }

    case "execute-payout": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          policy: { type: "string", short: "p" },
          proposal: { type: "string" },
          decision: { type: "string" },
          "tx-hashes": { type: "string" }, // JSON array
          "executed-outputs": { type: "string" }, // JSON array
          "executed-by": { type: "string", default: "capsule-cli" },
          out: { type: "string", short: "o", default: "payout-execution.json" },
        },
      });

      if (
        !values.policy ||
        !values.proposal ||
        !values.decision ||
        !values["tx-hashes"] ||
        !values["executed-outputs"]
      ) {
        console.error(
          "Usage: capsule execute-payout --policy <file> --proposal <file> --decision <file> --tx-hashes '<json>' --executed-outputs '<json>'"
        );
        process.exit(1);
      }

      const execution = await executePayout({
        policyPath: values.policy,
        proposalPath: values.proposal,
        decisionPath: values.decision,
        txHashes: parseJsonArgument(values["tx-hashes"], "--tx-hashes"),
        executedOutputs: parseJsonArgument(values["executed-outputs"], "--executed-outputs"),
        executedBy: values["executed-by"]!,
        outputPath: values.out!,
      });

      console.log(`Payout execution recorded`);
      console.log(`  TX hashes: ${execution.xrpl.txHashes.length}`);
      console.log(`  Outputs: ${execution.executedOutputs.length}`);
      console.log(`  Verification: ${execution.verification.matchesApprovedProposal ? "PASS" : "FAIL"}`);
      console.log(`  Execution hash: ${execution.executionHash!.slice(0, 16)}...`);
      console.log(`Written to: ${values.out}`);
      break;
    }

    case "verify-payout": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          policy: { type: "string", short: "p" },
          proposal: { type: "string" },
          decision: { type: "string" },
          execution: { type: "string" },
        },
      });

      if (!values.policy || !values.proposal || !values.decision || !values.execution) {
        console.error(
          "Usage: capsule verify-payout --policy <file> --proposal <file> --decision <file> --execution <file>"
        );
        process.exit(1);
      }

      const result = await verifyPayout({
        policyPath: values.policy,
        proposalPath: values.proposal,
        decisionPath: values.decision,
        executionPath: values.execution,
      });

      for (const check of result.checks) {
        const icon = check.passed ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${check.name}: ${check.detail}`);
      }

      if (result.passed) {
        console.log("\nGovernance verification PASSED — full hash chain valid");
      } else {
        console.error("\nGovernance verification FAILED");
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
