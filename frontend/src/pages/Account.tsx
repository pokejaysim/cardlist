import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  ExternalLink,
  CheckCircle2,
  Circle,
  Loader2,
  Crown,
  AlertTriangle,
} from "lucide-react";
import type { UsageInfo } from "../../../shared/types";

interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  onboarding_complete?: boolean;
}

export default function Account() {
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["account"],
    queryFn: () => apiFetch<AccountInfo>("/account"),
  });

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageInfo>("/account/usage"),
  });

  const { data: ebayStatus } = useQuery({
    queryKey: ["ebay-status"],
    queryFn: () => apiFetch<{ linked: boolean; ebay_user_id?: string }>("/account/ebay-status"),
  });

  async function linkEbay() {
    setLinking(true);
    setLinkError("");
    try {
      const { url } = await apiFetch<{ url: string }>("/auth/ebay-oauth-url");
      localStorage.setItem("snapcard_ebay_return", "account");
      window.location.href = url;
    } catch (err) {
      setLinkError(
        err instanceof Error ? err.message : "Failed to connect to eBay"
      );
      setLinking(false);
    }
  }

  if (accountLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your profile and connected services.
      </p>

      {/* Profile */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{account?.name ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{account?.email}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Plan & Usage */}
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Plan & Usage</CardTitle>
            <Badge variant={account?.plan === "free" ? "outline" : "default"}>
              {account?.plan === "free" ? "Free" : "Pro"}
            </Badge>
          </div>
          <CardDescription>
            {usage
              ? usage.listings_limit !== null
                ? `${usage.listings_this_month} of ${usage.listings_limit} listings used this month`
                : "Unlimited listings"
              : "Loading usage..."}
          </CardDescription>
        </CardHeader>
        {account?.plan === "free" && (
          <CardContent>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <Crown className="size-4 text-primary" />
              <span>
                Upgrade to <strong>Pro</strong> for unlimited listings, AI card
                identification, and pricing suggestions.
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* eBay Connection */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">eBay Account</CardTitle>
          <CardDescription>
            Connect your eBay seller account to publish listings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ebayStatus?.linked ? (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary">
              <CheckCircle2 className="size-4" />
              <span>
                Connected
                {ebayStatus.ebay_user_id && ` as ${ebayStatus.ebay_user_id}`}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Circle className="size-4" />
                <span>Not connected</span>
              </div>

              {linkError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{linkError}</span>
                </div>
              )}

              <Button onClick={linkEbay} disabled={linking} variant="outline">
                {linking ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-1.5 size-4" />
                )}
                {linking ? "Redirecting..." : "Connect eBay Account"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
