import { useCallback, useState } from "react";
import { useStudio } from "../../state/studio";
import { CreateReleasePage } from "./CreateReleasePage";
import { CollectorBenefitPage } from "./CollectorBenefitPage";
import { ReviewPage } from "./ReviewPage";
import { PublishPage } from "./PublishPage";
import { TestAccessPage } from "./TestAccessPage";
import { RecoveryPage } from "./RecoveryPage";
import { WelcomePage } from "./WelcomePage";
import { ErrorBanner } from "../panels/PanelShell";
import { isValidStudioDraft } from "../../state/validate";
// F-7a08ed4a: bundled directly as a JS import instead of guessed at
// runtime via three hardcoded relative paths through loadFile() (which,
// after F-f5a82670 hardened load_file to require an absolute,
// sandboxed path, now reject a relative path outright — ALL three
// candidates fail unconditionally, in both dev and packaged builds, not
// just "coincidentally works in dev mode" as the code's own old comment
// claimed). Vite bundles a JSON import into the app bundle at build
// time (via resolveJsonModule + Vite's built-in JSON plugin — no new
// dependency), so this is available identically in dev and packaged
// builds with no Tauri IPC round-trip, no CWD assumptions, and nothing
// to declare as a Tauri resource. sample/README.md's documented
// "manually pick demo-draft.json via Load Draft" path is untouched —
// the file stays exactly where it was.
import sampleDraftRaw from "../../../sample/demo-draft.json";
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
  const {
    draft, activeStep, setActiveStep, updateDraft, sessionRestored,
    welcomeDismissed, dismissWelcome, sessionError,
  } = useStudio();

  // F-7a08ed4a: distinct from sessionError/draftLoadError (both already
  // wired elsewhere) — specifically for "the bundled sample itself is
  // missing or malformed," a build-time/packaging concern rather than a
  // runtime file-load concern. Rendered the same way (ErrorBanner),
  // deliberately non-blocking: WelcomePage's OTHER option ("Create a
  // release") and the manual Load Draft path documented in
  // sample/README.md both remain fully usable either way.
  const [sampleLoadError, setSampleLoadError] = useState<string | null>(null);

  // Show welcome when: session restore is done, draft is empty, and user
  // hasn't dismissed welcome. welcomeDismissed lives in StudioContext
  // (not component-local state) specifically so resetDraft() — called
  // by StudioSidebar's "Start a New Release" action, a sibling
  // component — can un-dismiss it too. See F-bd945889: without this,
  // WelcomePage would never reappear after a reset, since a
  // component-local flag here has no way to be reached from outside.
  const showWelcome = sessionRestored && !welcomeDismissed && !draft.title && !draft.artist && activeStep === "create";

  /**
   * F-7a08ed4a: the sample is a bundled JS import (see the import
   * comment above), not a file loaded at runtime, so there is no
   * "file not found" case anymore — the only failure mode left is the
   * bundled JSON somehow not matching StudioDraft's shape (a build-time/
   * packaging mistake, not a user-triggerable one). That gets an
   * explicit, visible error via the same humanizer every other error
   * path uses (ErrorBanner — F-c1d1c21a) instead of the old silent
   * fallback into a blind native file-picker dialog with zero
   * explanation of what actually went wrong.
   */
  const handleLoadSample = useCallback(() => {
    setSampleLoadError(null);
    if (!isValidStudioDraft(sampleDraftRaw)) {
      setSampleLoadError(
        "The bundled sample release is missing or malformed and could not be loaded. " +
        "Use \"Create a release\" to start your own, or \"Load Draft\" to open a release file directly."
      );
      return;
    }
    updateDraft({ ...sampleDraftRaw, draftPath: null });
    dismissWelcome();
  }, [updateDraft, dismissWelcome]);

  const handleStartFresh = useCallback(() => {
    dismissWelcome();
  }, [dismissWelcome]);

  // F-27abf0dc: sessionError used to be set by studio.tsx (both the
  // startup session-restore catch and the autosave loop) but never
  // actually rendered anywhere — the one code path meant to tell a user
  // "your saved session could not be read" / "autosave isn't working"
  // existed only as an internal flag nobody displayed. Rendered here,
  // above the normal page content, as a non-blocking banner (via
  // ErrorBanner — F-c1d1c21a's humanizer — never a full-screen takeover)
  // so editing is completely unaffected either way.
  const errorBanner = sessionError ? <ErrorBanner message={sessionError} /> : null;

  if (showWelcome) {
    return (
      <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {errorBanner}
        {sampleLoadError && <ErrorBanner message={sampleLoadError} />}
        <WelcomePage onLoadSample={handleLoadSample} onStartFresh={handleStartFresh} />
      </main>
    );
  }

  const Page = pageMap[activeStep];

  return (
    <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
      {errorBanner}
      <Page />
    </main>
  );
}
