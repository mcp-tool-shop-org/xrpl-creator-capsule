<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

Sistema de lançamento de conteúdo sob a propriedade do criador na Ledger XRP. Publique trabalhos, venda diretamente, desbloqueie benefícios para colecionadores, gerencie receitas – tudo com base em uma verdade duradoura e imutável, que persiste mesmo após a desativação da interface.

## O que ele faz

O XRPL Creator Capsule trata a Ledger XRP como uma plataforma de controle duradoura para propriedade, pagamento, acesso e persistência em relação a trabalhos criativos. Não é um mercado – é a infraestrutura que torna os mercados opcionais.

Um "capsule" do criador une:

- **Intenção do Criador:** Um manifesto de lançamento assinado com identidade determinística (ID do manifesto em SHA-256).
- **Veracidade da Criação:** Edições de NFTs criadas na XRPL com recibos de emissão invioláveis.
- **Veracidade do Acesso:** Benefícios vinculados à propriedade, verificados por meio de verificações de detentores na blockchain.
- **Veracidade da Persistência:** Pacotes de recuperação que reconstroem a publicação completa, mesmo sem o aplicativo original.
- **Veracidade da Governança:** Receitas gerenciadas por meio de uma cadeia de aprovação auditável (política → proposta → decisão → execução).

Cada arquivo recebe uma marca de hash e é referenciado cruzadamente. Cada afirmação pode ser verificada em relação ao ledger.

## Arquitetura

```
packages/
  core/       Canonical contracts, schemas, validation, hashing
  xrpl/       XRPL client (connect, mint, verify, holder checks)
  storage/    Content store + delivery provider interfaces
  xaman/      Wallet-mediated signing via Xaman
  cli/        15 CLI commands for the full release lifecycle
artifacts/    Live Testnet proof artifacts
fixtures/     Sanitized fixtures for testing
```

Monorepo com 5 espaços de trabalho npm. TypeScript, Vitest, Node 22+.

## Como começar

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## Comandos da linha de comando (CLI)

| Comando | Propósito |
|---------|---------|
| `init-wallets` | Gera e configura um par de carteiras para o emissor e o operador. |
| `configure-minter` | Define o operador como emissor autorizado na conta do emissor. |
| `create-release` | Cria uma publicação a partir de um arquivo de manifesto. |
| `validate` | Valida um manifesto de publicação em relação ao esquema. |
| `resolve` | Verifica se os ponteiros do manifesto são estruturalmente válidos. |
| `mint-release` | Cria edições de NFTs e emite um recibo de emissão. |
| `verify-release` | Sincroniza o manifesto com o recibo em relação ao estado da blockchain. |
| `create-access-policy` | Gera uma política de acesso a partir do manifesto e do recibo. |
| `grant-access` | Avalia uma solicitação de acesso e emite um recibo de concessão. |
| `recover-release` | Reconstrói uma publicação a partir de arquivos e do estado da blockchain. |
| `create-governance-policy` | Cria uma política de governança para o tesouro de uma publicação. |
| `propose-payout` | Cria uma proposta de pagamento em relação a uma política de governança. |
| `decide-payout` | Coleta aprovações e emite um recibo de decisão. |
| `execute-payout` | Registra a execução do pagamento e verifica a cadeia de hash. |
| `verify-payout` | Verifica todos os 4 artefatos de governança e seus relacionamentos. |

## Fases comprovadas

| Fase | O que é comprovado | Testes |
|-------|---------------|-------|
| A — Intenção do Criador | A identidade do manifesto é determinística e inviolável. | 27 |
| B — Veracidade da Criação | Os NFTs na XRPL correspondem exatamente ao manifesto (teste em rede de testes ativa). | 36 |
| C — Veracidade do Acesso | A propriedade desbloqueia acesso real fora da cadeia. | 34 |
| E — Veracidade da Persistência | A publicação persiste mesmo após a desativação da interface (teste de falha concluído). | 28 |
| D — Veracidade da Governança | As receitas são gerenciadas por meio de uma cadeia de aprovação auditável. | 67 |
| **Total** | | **240** |

## Modelo de confiança

**O que este sistema acessa:**
- Arquivos JSON locais (manifestos, recibos, políticas, pacotes)
- XRPL via WebSocket (`wss://`) para criação, verificação e verificações de detentores.
- Frases de recuperação de carteiras armazenadas em `wallets.json` local (ignoradas no Git, nunca commitadas).

**O que este sistema NÃO acessa:**
- Nenhuma API externa além dos nós da XRPL.
- Nenhum banco de dados, armazenamento em nuvem ou serviço de terceiros.
- Nenhuma análise de usuário, rastreamento ou telemetria.

**Limites de segurança:**
- As operações na rede principal requerem a opção `--network mainnet --allow-mainnet-write` explícita.
- As credenciais da carteira permanecem locais e são transmitidas apenas para a XRPL para assinatura de transações.
- Todas as hashes usam SHA-256 sobre a normalização canônica determinística `sortKeysDeep()`.
- Cada artefato pode ser verificado independentemente em relação ao ledger.
- A versão do `xrpl` está fixada na versão 4.2.5 (após o alerta da cadeia de suprimentos npm).
- Nenhuma telemetria é coletada ou enviada.

## Verificação

```bash
bash verify.sh
```

Executa a verificação de tipos TypeScript e o conjunto completo de 240 testes.

## Status

**Fase 1 MVP: concluída.** A tese central do produto — o XRPL como um plano de controle durável para lançamentos de criadores — foi comprovada em todas as cinco fases, com artefatos do Testnet em funcionamento.

**Pendente:** Demonstração em funcionamento do Xaman (a arquitetura do adaptador foi implementada, aguardando credenciais externas). Esta é uma etapa final, não uma nova fase de desenvolvimento.

## Licença

MIT

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
