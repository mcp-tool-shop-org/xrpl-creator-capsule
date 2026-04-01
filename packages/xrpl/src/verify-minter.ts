import { Client } from "xrpl";
import type { NetworkId } from "./network.js";
import { getNetwork } from "./network.js";

export interface MinterVerification {
  verified: boolean;
  issuerAddress: string;
  expectedOperator: string;
  actualMinter: string | undefined;
  error?: string;
}

/**
 * Read the issuer's account from the ledger and confirm the authorized minter
 * matches the expected operator address.
 */
export async function verifyAuthorizedMinter(
  issuerAddress: string,
  expectedOperator: string,
  network: NetworkId
): Promise<MinterVerification> {
  const config = getNetwork(network);
  const client = new Client(config.url);

  try {
    await client.connect();

    const response = await client.request({
      command: "account_info",
      account: issuerAddress,
      ledger_index: "validated",
    });

    const accountData = response.result.account_data as Record<string, unknown>;
    const actualMinter = accountData.NFTokenMinter as string | undefined;

    if (!actualMinter) {
      return {
        verified: false,
        issuerAddress,
        expectedOperator,
        actualMinter: undefined,
        error: "No NFTokenMinter set on issuer account",
      };
    }

    if (actualMinter !== expectedOperator) {
      return {
        verified: false,
        issuerAddress,
        expectedOperator,
        actualMinter,
        error: `NFTokenMinter is ${actualMinter}, expected ${expectedOperator}`,
      };
    }

    return {
      verified: true,
      issuerAddress,
      expectedOperator,
      actualMinter,
    };
  } finally {
    await client.disconnect();
  }
}
