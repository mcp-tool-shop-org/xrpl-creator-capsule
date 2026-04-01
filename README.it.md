<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases"><img src="https://img.shields.io/badge/release-v1.0.0-brightgreen" alt="v1.0.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/handbook-live-brightgreen" alt="Handbook" /></a>
</p>

Sistema di pubblicazione di contenuti gestito direttamente dagli autori sulla blockchain XRP Ledger. Permette di creare opere, venderle direttamente, offrire vantaggi ai collezionisti e gestire le entrate, il tutto supportato da una prova inalterabile registrata sulla blockchain.

> **Versione di anteprima.** v1.0.0 è una versione di anteprima per la rete di test. L'architettura del sistema supporta sia la rete di test che quella principale, ma tutte le prove di affidabilità sono state verificate solo sulla rete di test. La rete principale è un percorso controllato e deliberato, non la configurazione predefinita.

## Due modi per utilizzarlo:

### Applicazione desktop (consigliata per gli autori)

Scarica il programma di installazione per Windows da [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) e segui la [Guida per principianti](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

La modalità **Studio** ti guida attraverso un flusso di lavoro di 6 passaggi:

1. Descrivi la tua pubblicazione (titolo, artista, numero di edizioni, file)
2. Definisci i vantaggi per i collezionisti (tracce bonus, stem, opere d'arte ad alta risoluzione)
3. Esamina i termini e le condizioni di sicurezza
4. Pubblica sulla rete di test XRPL
5. Verifica l'accesso per i collezionisti
6. Genera un pacchetto di ripristino

Richiede [Node.js 22+](https://nodejs.org/) (un runtime integrato sarà disponibile in una versione futura).

### Interfaccia a riga di comando (CLI) (per sviluppatori e integratori)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

15 comandi che coprono l'intero ciclo di vita della pubblicazione:

| Comando | Scopo |
|---------|---------|
| `init-wallets` | Genera e finanzia una coppia di wallet per l'emittente e l'operatore |
| `configure-minter` | Imposta l'operatore come mintatore autorizzato sull'account dell'emittente |
| `create-release` | Crea una pubblicazione da un file di configurazione |
| `validate` | Valida un file di configurazione rispetto allo schema |
| `resolve` | Verifica che i riferimenti nel file di configurazione siano strutturalmente validi |
| `mint-release` | Crea edizioni NFT ed emetti una ricevuta di emissione |
| `verify-release` | Riconcilia il file di configurazione con la ricevuta rispetto allo stato della blockchain |
| `create-access-policy` | Genera una policy di accesso dal file di configurazione e dalla ricevuta |
| `grant-access` | Valuta una richiesta di accesso ed emetti una ricevuta di concessione |
| `recover-release` | Ricostruisci una pubblicazione da artefatti e dallo stato della blockchain |
| `create-governance-policy` | Crea una policy di governance per il tesoro di una pubblicazione |
| `propose-payout` | Crea una proposta di pagamento in base a una policy di governance |
| `decide-payout` | Raccogli le approvazioni ed emetti una ricevuta di decisione |
| `execute-payout` | Registra l'esecuzione del pagamento e verifica la catena di hash |
| `verify-payout` | Verifica tutti e 4 gli artefatti di governance e le loro relazioni |

## Cosa dimostra

XRPL Creator Capsule considera la blockchain XRP Ledger come un sistema di controllo affidabile per la proprietà, i pagamenti, l'accesso e la sicurezza. Non è un marketplace, ma l'infrastruttura che rende i marketplace opzionali.

| Fase | Cosa dimostra | Test |
|-------|---------------|-------|
| A — Intento dell'autore | L'identità del file di configurazione è deterministica e resistente alla manomissione | 27 |
| B — Verità sull'emissione | Gli NFT sulla blockchain XRP Ledger corrispondono esattamente al file di configurazione (prova in diretta sulla rete di test) | 36 |
| C — Verità sull'accesso | La proprietà sblocca un accesso reale e indipendente dalla piattaforma | 34 |
| D — Verità sulla governance | Le entrate sono gestite attraverso una catena di approvazioni verificabile | 67 |
| E — Verità sulla durabilità | La pubblicazione sopravvive al malfunzionamento dell'interfaccia utente (test di "morte" superato) | 28 |
| Affidabilità del runtime desktop | Interruttore di modalità, riavvio, interruzione, timeout, sincronizzazione temporale | 73 |
| **Total** | | **265** |

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

Monorepo con 5 pacchetti di motore + applicazione desktop. TypeScript, Vitest, Tauri v2, Node 22+.

## Stato della rete

Il sistema ha piena consapevolezza della rete: la rete di test e quella principale sono target distinti e configurabili.

| | Rete di test | Rete principale |
|-|---------|---------|
| **Default** | Sì | No |
| **Trust-proven** | Sì (prove in diretta, 265 test) | No |
| **CLI guard** | Nessuno richiesto | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Impostazione predefinita della modalità Studio | Non disponibile in v1.0.0 |

**Considerate questa versione come un'anteprima per la rete di test (Testnet).** L'architettura non è limitata alla sola rete di test, ma la prova di affidabilità è stata verificata sulla rete di test. La compatibilità con la rete principale richiede la firma effettiva di Xaman e una promozione mirata, non una semplice modifica di un parametro.

## Modello di affidabilità

**Cosa coinvolge questo sistema:**
- File JSON locali (manifest, ricevute, policy, pacchetti)
- XRPL tramite WebSocket (`wss://`) per la creazione, la verifica e il controllo dei possessori
- Frasi di recupero del portafoglio memorizzate nel file locale `wallets.json` (ignorate da Git, mai commesse)

**Cosa NON coinvolge questo sistema:**
- Nessuna API esterna oltre ai nodi XRPL
- Nessun database, storage cloud o servizi di terze parti
- Nessuna analisi, tracciamento o telemetria degli utenti

**Confini di sicurezza:**
- Le scritture sulla rete principale richiedono l'opzione esplicita `--network mainnet --allow-mainnet-write`
- Le credenziali del portafoglio rimangono locali e vengono trasmesse solo a XRPL per la firma delle transazioni
- Tutti gli hash utilizzano SHA-256 con una canonizzazione deterministica tramite `sortKeysDeep()`
- Ogni elemento può essere verificato indipendentemente rispetto al registro
- `xrpl` è bloccato alla versione esatta 4.2.5 (dopo l'avviso sulla catena di fornitura npm)

## Limitazioni note

- **È richiesto Node.js** per l'applicazione desktop (un runtime integrato è in arrivo)
- **La firma tramite codice QR di Xaman non è ancora attiva** — è necessario un file con le credenziali del portafoglio (basato su seed, solo per la rete di test)
- **L'upload su IPFS è in sospeso** — i puntatori ai file utilizzano percorsi locali, lo storage basato sul contenuto è in arrivo
- **Solo per Windows** — è previsto un installer per macOS in una versione RC futura

## Segnalazione di problemi

Clicca su **Segnala** nella barra del titolo dell'applicazione desktop per esportare un pacchetto di supporto, quindi apri un [ticket su GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
