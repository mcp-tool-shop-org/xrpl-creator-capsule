import { useStudio } from "../../state/studio";
import { CreateReleasePage } from "./CreateReleasePage";
import { CollectorBenefitPage } from "./CollectorBenefitPage";
import { ReviewPage } from "./ReviewPage";
import { PublishPage } from "./PublishPage";
import { TestAccessPage } from "./TestAccessPage";
import { RecoveryPage } from "./RecoveryPage";
import type { StudioStep } from "../../state/studio";

const pageMap: Record<StudioStep, React.FC> = {
  create: CreateReleasePage,
  benefit: CollectorBenefitPage,
  review: ReviewPage,
  publish: PublishPage,
  test: TestAccessPage,
  recovery: RecoveryPage,
  proof: () => null, // handled by mode switch
};

export function StudioShell() {
  const { activeStep } = useStudio();
  const Page = pageMap[activeStep];

  return (
    <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
      <Page />
    </main>
  );
}
