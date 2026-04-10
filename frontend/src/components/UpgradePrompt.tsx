import { Button } from "@/components/ui/button";
import { X, Sparkles, BarChart3, Infinity } from "lucide-react";

interface UpgradePromptProps {
  onClose: () => void;
}

export function UpgradePrompt({ onClose }: UpgradePromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Upgrade to Pro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Unlock the full power of SnapCard
          </p>
        </div>

        {/* Features */}
        <div className="mb-6 space-y-3">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">AI Card Identification</p>
              <p className="text-xs text-muted-foreground">
                Snap a photo and let Claude Vision instantly identify your card
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Infinity className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Unlimited Listings</p>
              <p className="text-xs text-muted-foreground">
                No monthly cap — list as many cards as you want
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <BarChart3 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Pricing Suggestions</p>
              <p className="text-xs text-muted-foreground">
                Get market prices from PriceCharting and recent eBay sold comps
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-4 rounded-lg bg-muted p-4 text-center">
          <p className="text-3xl font-bold">
            $9.99
            <span className="text-base font-normal text-muted-foreground">
              /month
            </span>
          </p>
        </div>

        {/* CTA */}
        <Button className="w-full" size="lg" disabled>
          Coming Soon
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Payment integration is not yet available
        </p>
      </div>
    </div>
  );
}
