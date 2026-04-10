import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Step = "welcome" | "ebay" | "ready";

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [linking, setLinking] = useState(false);
  const [ebayLinked, setEbayLinked] = useState(false);
  const [error, setError] = useState("");

  // Check if returning from eBay OAuth or if eBay is already linked
  useEffect(() => {
    const returnFlag = localStorage.getItem("snapcard_ebay_return");
    if (returnFlag === "onboarding") {
      localStorage.removeItem("snapcard_ebay_return");
    }

    apiFetch<{ linked: boolean }>("/account/ebay-status")
      .then((status) => {
        if (status.linked) {
          setEbayLinked(true);
          // If returning from OAuth, jump to eBay step to show success
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
          : "Failed to connect to eBay. Please try again."
      );
      setLinking(false);
    }
  }

  async function completeOnboarding(destination: string) {
    // Persist completion both locally and server-side
    localStorage.setItem("snapcard_onboarding_complete", "true");

    // Best-effort server-side persistence (don't block navigation if it fails)
    try {
      await apiFetch("/account/onboarding", {
        method: "PATCH",
        body: JSON.stringify({ onboarding_complete: true }),
      });
    } catch {
      // Server endpoint may not exist yet — that's OK, localStorage is the fallback
    }

    navigate(destination);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4">
        {/* Step indicator */}
        <div className="flex justify-center gap-2">
          {(["welcome", "ebay", "ready"] as const).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 w-12 rounded-full transition ${
                i <= ["welcome", "ebay", "ready"].indexOf(step)
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* ── Step 1: Welcome ─────────────────────────── */}
        {step === "welcome" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome to SnapCard</CardTitle>
              <CardDescription>
                Let's get you set up to list cards on eBay in minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                {[
                  "Upload card photos",
                  "AI identifies your card (Pro) or enter details manually (Free)",
                  "Get pricing suggestions from market data",
                  "Publish to eBay with one click",
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" onClick={() => setStep("ebay")}>
                Get Started
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Link eBay ───────────────────────── */}
        {step === "ebay" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Connect Your eBay Account</CardTitle>
              <CardDescription>
                SnapCard needs access to create listings on your behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p>
                  You'll be redirected to eBay to authorize SnapCard. We only
                  request permission to:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Create and manage listings</li>
                  <li>Upload photos</li>
                  <li>View your seller account info</li>
                </ul>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {ebayLinked ? (
                <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary">
                  <CheckCircle2 className="size-4" />
                  eBay account linked successfully!
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={linkEbay}
                  disabled={linking}
                >
                  {linking ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-1.5 size-4" />
                  )}
                  {linking ? "Redirecting to eBay..." : "Connect eBay Account"}
                </Button>
              )}

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setStep("ready")}
                >
                  Skip for now
                </Button>
                {ebayLinked && (
                  <Button className="flex-1" onClick={() => setStep("ready")}>
                    Continue
                    <ArrowRight className="ml-1.5 size-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Ready ───────────────────────────── */}
        {step === "ready" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>You're All Set!</CardTitle>
              <CardDescription>
                Here's how SnapCard works.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm text-muted-foreground">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Upload a photo of your card</li>
                  <li>
                    Enter card details manually, or let AI identify it (Pro)
                  </li>
                  <li>Set your price and review the listing</li>
                  <li>Publish to eBay</li>
                </ol>
              </div>
              <Button
                className="w-full"
                onClick={() => completeOnboarding("/listings/new")}
              >
                Create Your First Listing
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => completeOnboarding("/dashboard")}
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
