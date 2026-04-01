#!/usr/bin/env node

import { parseArgs } from "node:util";
import { createRelease } from "./commands/create-release.js";
import { validateManifestFile } from "./commands/validate.js";
import { resolveManifestFile } from "./commands/resolve.js";
import { initWallets } from "./commands/init-wallets.js";
import type { NetworkId } from "@capsule/xrpl";

const COMMANDS: Record<string, string> = {
  "init-wallets": "Generate and fund issuer + operator wallet pair",
  "create-release": "Create a release from a manifest input file",
  validate: "Validate a Release Manifest against the schema",
  resolve: "Check that manifest pointers (CIDs, URLs) are structurally valid",
};

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: capsule <command> [options]\n");
    console.log("Commands:");
    for (const [name, desc] of Object.entries(COMMANDS)) {
      console.log(`  ${name.padEnd(18)} ${desc}`);
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

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
