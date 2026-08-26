<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases"><img src="https://img.shields.io/badge/release-v1.1.0-brightgreen" alt="v1.1.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/handbook-live-brightgreen" alt="Handbook" /></a>
</p>

Sistema di pubblicazione di proprietà del creatore sulla XRP Ledger. Pubblica le opere, vendi direttamente, sblocca vantaggi per i collezionisti, gestisci le entrate: tutto supportato da una prova on-chain duratura.

> **Prima versione per Testnet.** Questa versione è un prodotto destinato alla Testnet. L'architettura del motore supporta sia la Testnet che la Mainnet, ma tutte le prove di affidabilità sono state convalidate solo sulla Testnet. La Mainnet è una promozione controllata e deliberata, non l'impostazione predefinita.

## Due modi per utilizzarlo

### App desktop (consigliata per i creatori)

Scarica il programma di installazione per Windows da [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) e segui la [Guida per principianti](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

La **Modalità Studio** ti guida attraverso un flusso guidato di 6 passaggi:

1. Descrivi la tua pubblicazione (titolo, artista, numero di edizioni, file)
2. Imposta i vantaggi per i collezionisti (brani bonus, tracce separate, immagini ad alta risoluzione)
3. Rivedi i termini e le condizioni e le misure di sicurezza
4. Pubblica sulla XRPL Testnet
5. Testa l'accesso dei collezionisti
6. Genera un pacchetto di ripristino

Richiede [Node.js 22+](https://nodejs.org/) (l'ambiente di runtime incluso sarà disponibile in una versione futura).

### CLI (per sviluppatori e integratori)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # full test suite (700+ tests), zero network calls
```

15 comandi che coprono l'intero ciclo di vita della pubblicazione:

| Comando | Scopo |
|---------|---------|
| `init-wallets` | Genera e finanzia la coppia di portafogli emittente + operatore |
| `configure-minter` | Imposta l'operatore come minter autorizzato sull'account dell'emittente |
| `create-release` | Crea una pubblicazione da un file di input manifest |
| `validate` | Valida un Manifest di Pubblicazione rispetto allo schema |
| `resolve` | Verifica che i puntatori del manifest siano strutturalmente validi |
| `mint-release` | Emette edizioni NFT ed emette una ricevuta di emissione |
| `verify-release` | Riconcilia il manifest + la ricevuta rispetto allo stato della catena |
| `create-access-policy` | Genera una politica di accesso dal manifest + dalla ricevuta |
| `grant-access` | Valuta la richiesta di accesso ed emette una ricevuta di concessione |
| `recover-release` | Ricostruisce una pubblicazione da artefatti + stato della catena |
| `create-governance-policy` | Crea una politica di governance per un tesoro di pubblicazioni |
| `propose-payout` | Crea una proposta di pagamento rispetto a una politica di governance |
| `decide-payout` | Raccoglie le approvazioni ed emette una ricevuta di decisione |
| `execute-payout` | Registra l'esecuzione del pagamento e verifica la catena hash |
| `verify-payout` | Verifica tutti i 4 artefatti di governance e le loro relazioni |

## Cosa dimostra

XRPL Creator Capsule tratta la XRP Ledger come un piano di controllo duraturo per la proprietà, il pagamento, l'accesso e la sopravvivenza. Non è un marketplace: è l'infrastruttura che rende i marketplace opzionali.

| Fase | Cosa dimostra |
|-------|---------------|
| A — Intento del creatore | L'identità del manifest è deterministica e resistente alla manomissione |
| B — Verità dell'emissione | Gli NFT su XRPL corrispondono esattamente al manifest (prova live sulla Testnet) |
| C — Verità dell'accesso | La proprietà sblocca l'accesso reale off-chain |
| D — Verità della governance | Le entrate sono gestite attraverso una catena di approvazione verificabile |
| E — Verità della durabilità | La pubblicazione sopravvive alla morte del frontend (test superato) |
| Affidabilità dell'ambiente di runtime desktop | Commutazione modalità, riavvio, interruzione, timeout, tempistica |

Attualmente, la suite esegue **oltre 700 test** sui pacchetti del motore, sulla CLI e sull'app desktop. Il comando `bash verify.sh` esegue tutti i test e stampa il conteggio in tempo reale, senza effettuare chiamate di rete. (I numeri esatti possono variare man mano che la suite si espande; il comando è la fonte di verità).

## Architettura

```
app/              Desktop app (Tauri v2 + React)
  src/            Studio Mode + Advanced Mode UI
  src-tauri/      Rust backend (file I/O, bridge dispatch)
  bridge-worker   Engine bridge (stdin/stdout JSON-RPC)
packages/
  core/           Canonical contracts, schemas, validation, hashing
  xrpl/           XRPL client (connect, mint, verify, holder checks)
  storage/        Content store + delivery provider interfaces
  xaman/          Wallet-mediated signing via Xaman
  cli/            15 CLI commands
artifacts/        Live Testnet proof artifacts
site/             Handbook (Astro Starlight)
```

Monorepo con 5 pacchetti del motore + app desktop. TypeScript, Vitest, Tauri v2, Node 22+.

## Configurazione della rete

Il sistema ha una piena consapevolezza della rete: Testnet e Mainnet sono obiettivi distinti e configurabili.

| | Testnet | Mainnet |
|-|---------|---------|
| **Default** | Sì | No |
| **Trust-proven** | Sì (prove live, suite completa) | Non ancora |
| **CLI guard** | Nessuno necessario | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Impostazione predefinita della modalità Studio | Non esposta nell'app desktop |

**Considera questa versione come un'anteprima per la Testnet.** L'architettura non è esclusivamente per la Testnet, ma l'affidabilità è stata dimostrata sulla Testnet. La preparazione per la Mainnet richiede firme Xaman live e una promozione deliberata, non una semplice modifica di un flag.

## Modello di affidabilità

**Cosa gestisce questo sistema:**
- File JSON locali (manifesti, ricevute, politiche, pacchetti)
- XRPL tramite WebSocket (`wss://`) per l'emissione, la verifica e il controllo dei possessori
- Frasi di accesso al portafoglio archiviate localmente in `wallets.json` (ignorate da Git, mai inviate)

**Cosa NON gestisce questo sistema:**
- Nessuna API esterna oltre ai nodi XRPL
- Nessun database, spazio di archiviazione cloud o servizi di terze parti
- Nessuna analisi degli utenti, tracciamento o telemetria

**Confini di sicurezza:**
- Le scritture sulla Mainnet richiedono un'esplicita `--network mainnet --allow-mainnet-write`
- Le credenziali del portafoglio rimangono locali: vengono trasmesse solo a XRPL per la firma delle transazioni
- Tutti gli hash utilizzano SHA-256 su una deterministica `sortKeysDeep()` canonizzazione

- Ogni artefatto è verificabile in modo indipendente rispetto al ledger
- `xrpl` fissato alla versione esatta 4.2.5 (dopo l'avviso sulla catena di approvvigionamento npm)

## Limitazioni note

- **Node.js richiesto** per l'app desktop (l'ambiente di runtime incluso sarà disponibile in futuro)
- **La firma Xaman QR non è ancora attiva:** è necessario un file con le credenziali del portafoglio (basato sulla frase di accesso, solo per la testnet)
- **Il caricamento su IPFS è in sospeso:** i puntatori ai file utilizzano percorsi locali; verrà implementata una vera archiviazione basata sul contenuto.
- **Solo per Windows:** è previsto un programma di installazione per macOS in una versione RC futura

## Segnalazione dei problemi

Fai clic su **Report** nella barra del titolo dell'app desktop per esportare un pacchetto di supporto, quindi apri un [problema su GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licenza

MIT

---

Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
