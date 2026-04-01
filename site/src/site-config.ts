import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'XRPL Creator Capsule',
  description: 'Creator-owned release system on XRPL — ownership, payment, access, and survivability backed by durable on-chain truth.',
  logoBadge: 'XC',
  brandName: 'XRPL Creator Capsule',
  repoUrl: 'https://github.com/mcp-tool-shop-org/xrpl-creator-capsule',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'Phase 1 Complete',
    headline: 'XRPL Creator',
    headlineAccent: 'Capsule.',
    description: 'Issue work, sell directly, unlock collector benefits, govern revenue — all backed by durable on-chain truth that survives frontend death.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Clone', code: 'git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git' },
      { label: 'Build', code: 'npm install && npm run build' },
      { label: 'Verify', code: 'bash verify.sh  # 240 tests' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Five Proven Truths',
      subtitle: 'Each phase proven with live Testnet artifacts and tamper-evident hash chains.',
      features: [
        { title: 'Creator Intent', desc: 'Signed release manifests with deterministic SHA-256 identity. Every field is bound to the manifestId.' },
        { title: 'Mint Truth', desc: 'NFT editions minted on XRPL with issuance receipts that reconcile against on-chain state.' },
        { title: 'Access Truth', desc: 'Ownership-gated benefits verified by holder checks. Hold the NFT, unlock the content.' },
        { title: 'Durability Truth', desc: 'Recovery bundles reconstruct the full release without the original app. Survives frontend death.' },
        { title: 'Governance Truth', desc: 'Revenue governed through an auditable 4-step approval chain: policy, proposal, decision, execution.' },
        { title: '240 Tests', desc: 'Every claim is tested. Failure drills prove the system catches every category of tampering.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Release Lifecycle',
      cards: [
        { title: 'Create a release', code: 'capsule create-release -i manifest-input.json' },
        { title: 'Mint on XRPL', code: 'capsule mint-release -m release.json -w wallets.json' },
        { title: 'Verify against chain', code: 'capsule verify-release -m release.json -r issuance-receipt.json' },
        { title: 'Grant access', code: 'capsule grant-access -m release.json -r receipt.json -p policy.json -w <address>' },
        { title: 'Govern revenue', code: 'capsule create-governance-policy -m release.json --treasury <addr> --signers \'[...]\'' },
      ],
    },
  ],
};
