import type { PanelId } from "../App";
import { ManifestPanel } from "./panels/ManifestPanel";
import { MintPanel } from "./panels/MintPanel";
import { AccessPanel } from "./panels/AccessPanel";
import { RecoveryPanel } from "./panels/RecoveryPanel";
import { GovernancePanel } from "./panels/GovernancePanel";

interface Props {
  activePanel: PanelId;
}

const panelMap: Record<PanelId, React.FC> = {
  manifest: ManifestPanel,
  mint: MintPanel,
  access: AccessPanel,
  recovery: RecoveryPanel,
  governance: GovernancePanel,
};

export function ReleaseChamber({ activePanel }: Props) {
  const Panel = panelMap[activePanel];

  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        padding: 24,
      }}
    >
      <Panel />
    </main>
  );
}
