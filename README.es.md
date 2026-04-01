<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

Sistema de publicación de contenido propiedad del creador en el Ledger de XRP. Permite publicar obras, vender directamente, desbloquear beneficios para coleccionistas y gestionar los ingresos, todo respaldado por una información inmutable almacenada en la cadena de bloques, que persiste incluso si la interfaz de usuario deja de funcionar.

## ¿Qué hace?

XRPL Creator Capsule utiliza el Ledger de XRP como una plataforma de control duradera para la propiedad, los pagos, el acceso y la persistencia de las obras creativas. No es un mercado, sino la infraestructura que permite que los mercados sean opcionales.

Una cápsula de creador une los siguientes elementos:

- **Intención del creador:** Un manifiesto firmado con una identidad determinista (identificador de manifiesto SHA-256).
- **Veracidad de la creación:** Ediciones de NFT creadas en XRPL con recibos de emisión que garantizan la integridad.
- **Veracidad del acceso:** Beneficios vinculados a la propiedad, verificados mediante comprobaciones de titulares en la cadena de bloques.
- **Veracidad de la durabilidad:** Paquetes de recuperación que reconstruyen la publicación completa sin la aplicación original.
- **Veracidad de la gobernanza:** Gestión de ingresos a través de una cadena de aprobación auditable (política → propuesta → decisión → ejecución).

Cada archivo tiene una huella digital y está referenciado. Cada afirmación puede verificarse contra el ledger.

## Arquitectura

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

Monorepo con 5 espacios de trabajo de npm. TypeScript, Vitest, Node 22+.

## Cómo empezar

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## Comandos de la línea de comandos (CLI)

| Comando | Propósito |
|---------|---------|
| `init-wallets` | Generar y financiar un par de billeteras (emisor + operador) |
| `configure-minter` | Configurar al operador como el emisor autorizado en la cuenta del emisor |
| `create-release` | Crear una publicación a partir de un archivo de manifiesto |
| `validate` | Validar un manifiesto de publicación contra el esquema |
| `resolve` | Comprobar que los punteros del manifiesto son estructuralmente válidos |
| `mint-release` | Crear ediciones de NFT y generar un recibo de emisión |
| `verify-release` | Conciliar el manifiesto y el recibo con el estado de la cadena de bloques |
| `create-access-policy` | Generar una política de acceso a partir del manifiesto y el recibo |
| `grant-access` | Evaluar una solicitud de acceso y generar un recibo de autorización |
| `recover-release` | Reconstruir una publicación a partir de archivos y el estado de la cadena de bloques |
| `create-governance-policy` | Crear una política de gobernanza para el tesoro de una publicación |
| `propose-payout` | Crear una propuesta de pago contra una política de gobernanza |
| `decide-payout` | Recopilar aprobaciones y generar un recibo de decisión |
| `execute-payout` | Registrar la ejecución del pago y verificar la cadena de hash |
| `verify-payout` | Verificar los 4 artefactos de gobernanza y sus relaciones |

## Fases probadas

| Fase | Lo que se demuestra | Pruebas |
|-------|---------------|-------|
| A — Intención del creador | La identidad del manifiesto es determinista y garantiza la integridad. | 27 |
| B — Veracidad de la creación | Los NFT en XRPL coinciden exactamente con el manifiesto (prueba en vivo en Testnet). | 36 |
| C — Veracidad del acceso | La propiedad desbloquea un acceso real fuera de la cadena. | 34 |
| E — Veracidad de la durabilidad | La publicación persiste incluso si la interfaz de usuario deja de funcionar (prueba de fallo de la interfaz superada). | 28 |
| D — Veracidad de la gobernanza | Los ingresos se gestionan a través de una cadena de aprobación auditable. | 67 |
| **Total** | | **240** |

## Modelo de confianza

**Qué elementos toca este sistema:**
- Archivos JSON locales (manifiestos, recibos, políticas, paquetes)
- XRPL a través de WebSocket (`wss://`) para la creación, la verificación y las comprobaciones de titulares.
- Frases de inicio de sesión de la billetera almacenadas en `wallets.json` (ignoradas por Git, nunca se confirman).

**Qué NO toca este sistema:**
- No utiliza APIs externas más allá de los nodos de XRPL.
- No utiliza bases de datos, almacenamiento en la nube ni servicios de terceros.
- No recopila ni utiliza análisis, seguimiento o telemetría de usuarios.

**Límites de seguridad:**
- Las escrituras en la red principal requieren explícitamente `--network mainnet --allow-mainnet-write`.
- Las credenciales de la billetera permanecen locales y solo se transmiten a XRPL para la firma de transacciones.
- Todas las huellas digitales utilizan SHA-256 sobre una canonicalización determinista `sortKeysDeep()`.
- Cada archivo se puede verificar de forma independiente contra el ledger.
- `xrpl` está fijada a la versión exacta 4.2.5 (después de la advertencia de la cadena de suministro de npm).
- No se recopila ni se envía telemetría.

## Verificación

```bash
bash verify.sh
```

Realiza la verificación de tipos de TypeScript y la suite completa de 240 pruebas.

## Estado

**Fase 1 MVP: completada.** La tesis central del producto, que es XRPL como un plano de control duradero para el lanzamiento de contenido por parte de los creadores, se ha demostrado en las cinco fases con artefactos de Testnet en funcionamiento.

**Pendiente:** Demostración en vivo de Xaman (la arquitectura del adaptador se ha implementado, se esperan credenciales externas). Esto es una fase de finalización, no una nueva fase de construcción.

## Licencia

MIT

---

Desarrollado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
