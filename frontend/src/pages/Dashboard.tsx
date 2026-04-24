import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Plus,
  Loader2,
  Crown,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";
import { useState } from "react";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import type { EbayPublishSettingsResponse, UsageInfo } from "../../../shared/types";
import { CANADA_BETA_MARKETPLACE_ID } from "../../../shared/types";

interface Listing {
  id: string;
  card_name: string;
  set_name: string | null;
  condition: string | null;
  card_type: "raw" | "graded" | null;
  grading_company: string | null;
  grade: string | null;
  status: string;
  title: string | null;
  price_cad: number | null;
  currency_code: string | null;
  created_at: string;
  scheduled_at: string | null;
  ebay_item_id: number | null;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  publishing: "secondary",
  scheduled: "secondary",
  published: "default",
  error: "destructive",
};

function formatScheduledTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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

  const { data: publishSettings } = useQuery({
    queryKey: ["ebay-publish-settings", CANADA_BETA_MARKETPLACE_ID],
    queryFn: () =>
      apiFetch<EbayPublishSettingsResponse>(
        `/account/ebay-publish-settings?marketplace_id=${CANADA_BETA_MARKETPLACE_ID}`,
      ),
    enabled: ebayStatus?.linked === true,
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
  const publishing = listings?.filter((l) => l.status === "publishing") ?? [];
  const scheduled = listings?.filter((l) => l.status === "scheduled") ?? [];
  const published = listings?.filter((l) => l.status === "published") ?? [];
  const errors = listings?.filter((l) => l.status === "error") ?? [];
  const publishSetupReady = publishSettings?.readiness.ready === true;

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
        (ebayStatus?.linked === false ||
          (ebayStatus?.linked === true && !publishSetupReady) ||
          listings?.length === 0) && (
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
                      {publishSetupReady ? (
                        <CheckCircle2 className="size-4 text-green-500" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      {publishSetupReady ? (
                        <span className="text-muted-foreground">
                          eBay publish setup ready
                        </span>
                      ) : (
                        <Link
                          to="/account"
                          className="text-primary hover:underline"
                        >
                          Finish eBay publish setup
                        </Link>
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
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Drafts", count: drafts.length, dot: "bg-muted-foreground/40" },
          { label: "Publishing", count: publishing.length, dot: "bg-sky-400" },
          { label: "Scheduled", count: scheduled.length, dot: "bg-amber-400" },
          { label: "Published", count: published.length, dot: "bg-primary" },
          { label: "Errors", count: errors.length, dot: "bg-destructive" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-3 text-center">
              <p className="font-heading text-3xl font-bold">{stat.count}</p>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <span className={`inline-block size-1.5 rounded-full ${stat.dot}`} />
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New listing button */}
      <div className="mt-6">
        <Link to="/listings/new">
          <Button size="lg" className="w-full">
            <Plus className="mr-1.5 size-4" />
            New Listing
          </Button>
        </Link>
      </div>

      {/* Listings */}
      <div className="mt-6">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings?.map((listing) => (
            <Link
              key={listing.id}
              to={`/listings/${listing.id}`}
              className="group block"
            >
              <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                {/* Card image placeholder */}
                <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                  <span className="font-heading text-3xl font-bold text-muted-foreground/20">
                    {listing.card_name.charAt(0)}
                  </span>
                </div>
                <CardContent className="p-3">
                  <p className="truncate font-heading text-sm font-bold">
                    {listing.card_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {listing.set_name ?? "No set"} ·{" "}
                    {listing.card_type === "graded"
                      ? `${listing.grading_company ?? ""} ${listing.grade ?? ""}`.trim() || "Graded"
                      : listing.condition ?? "—"}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="font-heading text-lg font-bold">
                      {listing.price_cad
                        ? `$${listing.price_cad} ${listing.currency_code ?? "CAD"}`
                        : "—"}
                    </p>
                    <Badge variant={statusColors[listing.status] ?? "outline"}>
                      {listing.status}
                    </Badge>
                  </div>
                  {listing.status === "scheduled" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Scheduled {formatScheduledTime(listing.scheduled_at) ?? "for later"}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
