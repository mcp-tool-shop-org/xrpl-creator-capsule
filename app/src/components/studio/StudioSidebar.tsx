import { useStudio, type StudioStep } from "../../state/studio";
import { useRelease } from "../../state/release";

interface Props {
  onSwitchToAdvanced: () => void;
}

const steps: { id: StudioStep; label: string; icon: string }[] = [
  { id: "create", label: "Release", icon: "\uD83C\uDFB5" },
  { id: "benefit", label: "Collector Access", icon: "\uD83C\uDF81" },
  { id: "review", label: "Review", icon: "\uD83D\uDD0D" },
  { id: "publish", label: "Publish", icon: "\uD83D\uDE80" },
  { id: "test", label: "Test Experience", icon: "\uD83E\uDDEA" },
  { id: "recovery", label: "Recovery", icon: "\uD83D\uDEE1\uFE0F" },
];

export function StudioSidebar({ onSwitchToAdvanced }: Props) {
  const { draft, activeStep, setActiveStep, canProceedToBenefit, canProceedToReview } = useStudio();
  const { mint, network } = useRelease();

  const stepEnabled = (id: StudioStep): boolean => {
    switch (id) {
      case "create": return true;
      case "benefit": return canProceedToBenefit;
      case "review": return canProceedToReview;
      case "publish": return canProceedToReview;
      case "test": return !!mint.receipt;
      case "recovery": return !!mint.receipt;
      case "proof": return true;
      default: return true;
    }
  };

  const stepComplete = (id: StudioStep): boolean => {
    switch (id) {
      case "create": return canProceedToBenefit;
      case "benefit": return canProceedToReview;
      case "review": return canProceedToReview;
      case "publish": return !!mint.receipt;
      case "test": return false;
      case "recovery": return false;
      default: return false;
    }
  };

  const statusLine = draft.title ? `${draft.title} \u2014 ${draft.artist}` : "New release";

  return (
    <nav
      style={{
        width: 200,
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        paddingTop: 8,
      }}
    >
      {steps.map((s) => {
        const active = s.id === activeStep;
        const enabled = stepEnabled(s.id);
        const complete = stepComplete(s.id);

        return (
          <button
            key={s.id}
            onClick={() => enabled && setActiveStep(s.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              border: "none",
              background: active ? "var(--bg-panel-hover)" : "transparent",
              borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
              color: active
                ? "var(--text)"
                : enabled
                  ? "var(--text-muted)"
                  : "var(--text-dim)",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              cursor: enabled ? "pointer" : "default",
              textAlign: "left",
              transition: "all 0.15s",
              opacity: enabled ? 1 : 0.35,
            }}
          >
            <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>
              {complete ? "\u2713" : s.icon}
            </span>
            {s.label}
          </button>
        );
      })}

      {/* Advanced / Proof mode */}
      <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
        <button
          onClick={onSwitchToAdvanced}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            border: "none",
            background: "transparent",
            color: "var(--text-dim)",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            width: "100%",
          }}
        >
          <span style={{ fontSize: 14 }}>{"\u2699"}</span>
          Advanced / Proof
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          lineHeight: 1.5,
        }}
      >
        <div>{network.charAt(0).toUpperCase() + network.slice(1)}</div>
        <div
          style={{
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {statusLine}
        </div>
        {mint.receipt && (
          <div style={{ color: "var(--success)", marginTop: 2 }}>Published</div>
        )}
      </div>
    </nav>
  );
}
