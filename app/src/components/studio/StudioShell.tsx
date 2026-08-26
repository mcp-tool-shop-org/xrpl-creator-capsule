import { useCallback } from "react";
import { useStudio } from "../../state/studio";
import { CreateReleasePage } from "./CreateReleasePage";
import { CollectorBenefitPage } from "./CollectorBenefitPage";
import { ReviewPage } from "./ReviewPage";
import { PublishPage } from "./PublishPage";
import { TestAccessPage } from "./TestAccessPage";
import { RecoveryPage } from "./RecoveryPage";
import { WelcomePage } from "./WelcomePage";
import type { StudioStep, StudioDraft } from "../../state/studio";

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
  const {
    draft, activeStep, setActiveStep, updateDraft, loadDraft, sessionRestored,
    welcomeDismissed, dismissWelcome,
  } = useStudio();

  // Show welcome when: session restore is done, draft is empty, and user
  // hasn't dismissed welcome. welcomeDismissed lives in StudioContext
  // (not component-local state) specifically so resetDraft() — called
  // by StudioSidebar's "Start a New Release" action, a sibling
  // component — can un-dismiss it too. See F-bd945889: without this,
  // WelcomePage would never reappear after a reset, since a
  // component-local flag here has no way to be reached from outside.
  const showWelcome = sessionRestored && !welcomeDismissed && !draft.title && !draft.artist && activeStep === "create";

  const handleLoadSample = useCallback(async () => {
    try {
      const { loadFile } = await import("../../bridge/engine");
      const paths = [
        "app/sample/demo-draft.json",
        "sample/demo-draft.json",
        "../sample/demo-draft.json",
      ];
      let loaded = false;
      for (const p of paths) {
        try {
          const content = await loadFile(p);
          const sample = JSON.parse(content) as StudioDraft;
          updateDraft({ ...sample, draftPath: null });
          dismissWelcome();
          loaded = true;
          break;
        } catch {
          continue;
        }
      }
      if (!loaded) {
        await loadDraft();
        dismissWelcome();
      }
    } catch {
      dismissWelcome();
    }
  }, [updateDraft, loadDraft, dismissWelcome]);

  const handleStartFresh = useCallback(() => {
    dismissWelcome();
  }, [dismissWelcome]);

  if (showWelcome) {
    return (
      <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <WelcomePage onLoadSample={handleLoadSample} onStartFresh={handleStartFresh} />
      </main>
    );
  }

  const Page = pageMap[activeStep];

  return (
    <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
      <Page />
    </main>
  );
}
