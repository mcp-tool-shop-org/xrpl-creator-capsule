# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

This system manages creator release artifacts and interacts with the XRP Ledger.

- **Data touched:** JSON manifest/receipt files, wallet credentials (local), XRPL Testnet/Mainnet via WebSocket
- **Network egress:** Connects to XRPL nodes (`wss://`) for minting, verification, and holder checks. No other network calls.
- **Secrets handling:** Wallet seed phrases stored in local `wallets.json` (gitignored). Never transmitted except to XRPL for transaction signing.
- **Mainnet guard:** All Mainnet writes require explicit `--network mainnet --allow-mainnet-write` flags
- **No telemetry** is collected or sent
