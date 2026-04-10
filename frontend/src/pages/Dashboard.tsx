import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Plus,
  ExternalLink,
  Loader2,
  Crown,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";
import { useState } from "react";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import type { UsageInfo } from "../../../shared/types";

interface Listing {
  id: string;
  card_name: string;
  set_name: string | null;
  condition: string | null;
  status: string;
  title: string | null;
  price_cad: number | null;
  created_at: string;
  ebay_item_id: number | null;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  published: "default",
  error: "destructive",
};

export default function Dashboard() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(
    () => localStorage.getItem("snapcard_setup_dismissed") === "true"
  );

  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings"],
    queryFn: () => apiFetch<Listing[]>("/listings"),
  });

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageInfo>("/account/usage"),
  });

  const { data: ebayStatus } = useQuery({
    queryKey: ["ebay-status"],
    queryFn: () => apiFetch<{ linked: boolean }>("/account/ebay-status"),
  });

  async function linkEbay() {
    try {
      const { url } = await apiFetch<{ url: string }>("/auth/ebay-oauth-url");
      window.location.href = url;
    } catch (err) {
      console.error("Failed to get eBay OAuth URL:", err);
    }
  }

  const drafts = listings?.filter((l) => l.status === "draft") ?? [];
  const scheduled = listings?.filter((l) => l.status === "scheduled") ?? [];
  const published = listings?.filter((l) => l.status === "published") ?? [];
  const errors = listings?.filter((l) => l.status === "error") ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Plan / Usage bar */}
      {usage && (
        <div className="mt-4 flex items-center justify-between rounded-lg border bg-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Badge variant={usage.plan === "free" ? "outline" : "default"}>
              {usage.plan === "free" ? "Free" : "Pro"}
            </Badge>
            {usage.listings_limit !== null ? (
              <span className="text-sm text-muted-foreground">
                {usage.listings_this_month} / {usage.listings_limit} listings this month
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Unlimited listings
              </span>
            )}
          </div>
          {usage.plan === "free" && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <Crown className="size-3.5" />
              Upgrade to Pro
            </button>
          )}
        </div>
      )}

      {/* Setup banner for new users */}
      {!setupDismissed &&
        (ebayStatus?.linked === false || listings?.length === 0) && (
          <Card className="mt-4">
            <CardContent className="py-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">Complete Your Setup</p>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {ebayStatus?.linked ? (
                        <CheckCircle2 className="size-4 text-green-500" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      {ebayStatus?.linked ? (
                        <span className="text-muted-foreground">
                          eBay account connected
                        </span>
                      ) : (
                        <button
                          onClick={linkEbay}
                          className="text-primary hover:underline"
                        >
                          Connect your eBay account
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {listings && listings.length > 0 ? (
                        <CheckCircle2 className="size-4 text-green-500" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      {listings && listings.length > 0 ? (
                        <span className="text-muted-foreground">
                          First listing created
                        </span>
                      ) : (
                        <Link
                          to="/listings/new"
                          className="text-primary hover:underline"
                        >
                          Create your first listing
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem("snapcard_setup_dismissed", "true");
                    setSetupDismissed(true);
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        {[
          { label: "Drafts", count: drafts.length },
          { label: "Scheduled", count: scheduled.length },
          { label: "Published", count: published.length },
          { label: "Errors", count: errors.length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{stat.count}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New listing button */}
      <div className="mt-6">
        <Link to="/listings/new">
          <Button className="w-full">
            <Plus className="mr-1.5 size-4" />
            New Listing
          </Button>
        </Link>
      </div>

      {/* Listings */}
      <div className="mt-6 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && listings?.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No listings yet. Create your first listing to get started.
            </CardContent>
          </Card>
        )}

        {listings?.map((listing) => (
          <Link
            key={listing.id}
            to={`/listings/${listing.id}`}
            className="block"
          >
            <Card className="transition hover:bg-accent/50">
              <CardContent className="flex items-center justify-between py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{listing.card_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {listing.set_name ?? "No set"} &middot;{" "}
                    {listing.condition ?? "—"}
                    {listing.price_cad && ` · $${listing.price_cad} CAD`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColors[listing.status] ?? "outline"}>
                    {listing.status}
                  </Badge>
                  {listing.ebay_item_id && (
                    <ExternalLink className="size-4 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
