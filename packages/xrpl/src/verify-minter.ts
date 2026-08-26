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

    // F-958911fa: account_info previously had no catch anywhere in this
    // function — only the outer try/finally that disconnects the client.
    // An issuer account that doesn't exist yet on ledger (actNotFound) or
    // any other request-level failure crashed with a raw xrpl.js exception
    // instead of this function's own structured {verified:false, error:...}
    // shape that every other negative outcome below already produces.
    // Mirrors check-holder.ts's actNotFound handling: actNotFound gets its
    // own clean, recognizable message (an issuer with no account cannot
    // have an authorized minter); any other failure gets a distinctly
    // worded "query failed" message so a real transport/ledger outage is
    // never silently flattened into looking like an ordinary, clean
    // not-authorized result.
    let accountData: Record<string, unknown>;
    try {
      // Try validated first, fall back to current if minter not found.
      // This handles the case where the AccountSet tx was just validated
      // but a different node hasn't closed that ledger yet.
      let response = await client.request({
        command: "account_info",
        account: issuerAddress,
        ledger_index: "validated",
      });

      accountData = response.result.account_data as unknown as Record<string, unknown>;
      if (!accountData.NFTokenMinter) {
        response = await client.request({
          command: "account_info",
          account: issuerAddress,
          ledger_index: "current",
        });
        accountData = response.result.account_data as unknown as Record<string, unknown>;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("actNotFound")) {
        return {
          verified: false,
          issuerAddress,
          expectedOperator,
          actualMinter: undefined,
          error: "Account not found on ledger",
        };
      }
      return {
        verified: false,
        issuerAddress,
        expectedOperator,
        actualMinter: undefined,
        error: `Ledger query failed: ${message}`,
      };
    }

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
