/**
 * Onboarding — slab/scanner edition.
 *
 * 3-step wizard for first-time users: Welcome → Connect eBay (with the
 * EbayPublishSetupCard nested) → Ready. All business logic preserved
 * 1:1 — same effect, same eBay status check, same OAuth redirect, same
 * server-side onboarding completion call.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChipMono,
  Slab,
  SlabButton,
} from "@/components/slab";
import { apiFetch } from "@/lib/api";
import { EbayPublishSetupCard } from "@/components/EbayPublishSetupCard";
import {
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Step = "welcome" | "ebay" | "ready";

const STEP_ORDER: Step[] = ["welcome", "ebay", "ready"];
const STEP_LABELS: Record<Step, string> = {
  welcome: "WELCOME",
  ebay: "CONNECT EBAY",
  ready: "READY",
};

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [linking, setLinking] = useState(false);
  const [ebayLinked, setEbayLinked] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const returnFlag = localStorage.getItem("snapcard_ebay_return");
    if (returnFlag === "onboarding") {
      localStorage.removeItem("snapcard_ebay_return");
    }

    apiFetch<{ linked: boolean }>("/account/ebay-status")
      .then((status) => {
        if (status.linked) {
          setEbayLinked(true);
          if (returnFlag === "onboarding") {
            setStep("ebay");
          }
        }
      })
      .catch(() => {
        // ignore — user may not have auth token yet in dev mode
      });
  }, []);

  async function linkEbay() {
    setLinking(true);
    setError("");
    try {
      const { url } = await apiFetch<{ url: string }>("/auth/ebay-oauth-url");
      localStorage.setItem("snapcard_ebay_return", "onboarding");
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect to eBay. Please try again.",
      );
      setLinking(false);
    }
  }

  async function completeOnboarding(destination: string) {
    localStorage.setItem("snapcard_onboarding_complete", "true");
    try {
      await apiFetch("/account/onboarding", {
        method: "PATCH",
        body: JSON.stringify({ onboarding_complete: true }),
      });
    } catch {
      // Server endpoint may not exist yet — localStorage is the fallback
    }
    navigate(destination);
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div
      className="slab-theme"
      style={{
        minHeight: "100vh",
        position: "relative",
      }}
    >
      <div
        className="card-grid-bg"
        style={{ position: "absolute", inset: 0, opacity: 0.3 }}
      />
      <div
        style={{
          position: "relative",
          padding: "32px 16px 60px",
          maxWidth: 560,
          margin: "0 auto",
        }}
      >
        {/* Step ticket bar */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            border: "2px solid var(--ink)",
            marginBottom: 18,
            background: "var(--paper)",
          }}
        >
          {STEP_ORDER.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div
                key={s}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  background: active
                    ? "var(--accent)"
                    : done
                      ? "var(--ink)"
                      : "var(--paper)",
                  color: active
                    ? "var(--ink)"
                    : done
                      ? "var(--paper)"
                      : "var(--ink-soft)",
                  borderRight: i < STEP_ORDER.length - 1 ? "1.5px solid var(--ink)" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1.5,
                  fontWeight: active || done ? 700 : 500,
                }}
              >
                <span
                  style={{
                    background: active
                      ? "var(--ink)"
                      : done
                        ? "var(--accent)"
                        : "transparent",
                    color: active
                      ? "var(--accent)"
                      : done
                        ? "var(--ink)"
                        : "var(--ink-soft)",
                    padding: "2px 6px",
                    fontWeight: 700,
                    border: !active && !done ? "1.5px solid var(--ink-soft)" : "none",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{STEP_LABELS[s]}</span>
                {done && <span style={{ marginLeft: "auto" }}>✓</span>}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Welcome ── */}
        {step === "welcome" && (
          <Slab
            yellow
            label="WELCOME TO SNAPCARD"
            grade="00"
            cert="NEW SELLER"
            foot={
              <>
                <span>POKÉMON CARDS · EBAY.CA</span>
                <span>~5 MIN SETUP</span>
              </>
            }
          >
            <div
              className="hand"
              style={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.05,
                marginBottom: 4,
              }}
            >
              Let's get you listing.
            </div>
            <div
              style={{
                fontFamily: "var(--font-marker)",
                fontSize: 13,
                color: "var(--ink-soft)",
                marginBottom: 16,
              }}
            >
              Snap, identify, price, publish — your card-listing pipeline in
              under a minute per card.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Upload card photos.",
                "Identify with AI or search the Pokémon TCG database.",
                "Get pricing from real eBay sold comps.",
                "Publish to eBay.ca with one click.",
              ].map((text, i) => (
                <div
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    background: "var(--paper)",
                    border: "1.5px solid var(--ink)",
                  }}
                >
                  <ChipMono solid>{String(i + 1).padStart(2, "0")}</ChipMono>
                  <span
                    style={{
                      fontFamily: "var(--font-marker)",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18 }}>
              <SlabButton
                primary
                size="lg"
                onClick={() => setStep("ebay")}
                style={{ width: "100%" }}
              >
                ▸ GET STARTED
                <ArrowRight className="size-4" />
              </SlabButton>
            </div>
          </Slab>
        )}

        {/* ── Step 2: Connect eBay ── */}
        {step === "ebay" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Slab
              label="CONNECT YOUR EBAY"
              grade="01"
              cert="OAUTH HANDSHAKE"
              foot={
                <>
                  <span>READ + WRITE</span>
                  <span>YOU AUTHORIZE</span>
                </>
              }
            >
              <div
                className="hand"
                style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05 }}
              >
                SnapCard needs to publish on your behalf.
              </div>
              <div
                style={{
                  fontFamily: "var(--font-marker)",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  marginTop: 4,
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                You'll be redirected to eBay to authorize SnapCard. We only
                request permission to:
              </div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {[
                  "Create and manage listings",
                  "Upload photos",
                  "View your seller account info",
                ].map((permission) => (
                  <li
                    key={permission}
                    style={{
                      padding: "6px 10px",
                      background: "var(--paper-2)",
                      border: "1.5px solid var(--ink)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: 0.5,
                      color: "var(--ink)",
                    }}
                  >
                    ◆ {permission}
                  </li>
                ))}
              </ul>

              {error && (
                <div
                  style={{
                    marginTop: 14,
                    background: "#c44536",
                    color: "var(--paper)",
                    padding: "8px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: 1,
                    border: "2px solid var(--ink)",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span style={{ flex: 1 }}>! {error}</span>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                {ebayLinked ? (
                  <ChipMono accent>
                    <CheckCircle2 className="size-3" />
                    EBAY ACCOUNT LINKED
                  </ChipMono>
                ) : (
                  <SlabButton
                    primary
                    size="lg"
                    onClick={linkEbay}
                    disabled={linking}
                    style={{ width: "100%" }}
                  >
                    {linking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ExternalLink className="size-4" />
                    )}
                    {linking ? "REDIRECTING TO EBAY…" : "▸ CONNECT EBAY ACCOUNT"}
                  </SlabButton>
                )}
              </div>
            </Slab>

            {ebayLinked && (
              <EbayPublishSetupCard
                title="FINISH YOUR EBAY DEFAULTS"
                description="Pick your shipping, payment, and return defaults once so publish stays fast later."
                onStateChange={(state) =>
                  setSettingsReady(Boolean(state?.readiness.ready))
                }
              />
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
              }}
            >
              <SlabButton
                onClick={() => setStep("ready")}
                style={{ flex: 1 }}
              >
                {settingsReady ? "SKIP FOR NOW" : "FINISH LATER"}
              </SlabButton>
              {ebayLinked && (
                <SlabButton
                  primary
                  onClick={() => setStep("ready")}
                  style={{ flex: 1 }}
                >
                  {settingsReady ? "CONTINUE" : "CONTINUE ANYWAY"}
                  <ArrowRight className="size-4" />
                </SlabButton>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Ready ── */}
        {step === "ready" && (
          <Slab
            yellow
            label="YOU'RE ALL SET"
            grade="✓"
            cert="READY TO LIST"
            foot={
              <>
                <span>FIRST 5 ON US</span>
                <span>NO CARD REQUIRED</span>
              </>
            }
          >
            <div
              className="hand"
              style={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.05,
                marginBottom: 4,
              }}
            >
              Here's how it goes.
            </div>
            <div
              style={{
                fontFamily: "var(--font-marker)",
                fontSize: 13,
                color: "var(--ink-soft)",
                marginBottom: 14,
              }}
            >
              The full SnapCard pipeline, top to bottom.
            </div>

            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {[
                "Snap a photo of your card.",
                "Search the Pokémon TCG database, AI-identify with Opus, or enter manually.",
                "Set your price — SnapCard pulls real sold comps to suggest one.",
                "Publish to eBay once the readiness checklist clears.",
              ].map((text, i) => (
                <li
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    background: "var(--paper)",
                    border: "1.5px solid var(--ink)",
                  }}
                >
                  <ChipMono solid>{String(i + 1).padStart(2, "0")}</ChipMono>
                  <span
                    style={{
                      fontFamily: "var(--font-marker)",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ol>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 18,
              }}
            >
              <SlabButton
                primary
                size="lg"
                onClick={() => completeOnboarding("/listings/new")}
                style={{ width: "100%" }}
              >
                ▸ CREATE YOUR FIRST LISTING
                <ArrowRight className="size-4" />
              </SlabButton>
              <SlabButton
                onClick={() => completeOnboarding("/dashboard")}
                style={{ width: "100%" }}
              >
                GO TO DASHBOARD
              </SlabButton>
            </div>
          </Slab>
        )}
      </div>
    </div>
  );
}
