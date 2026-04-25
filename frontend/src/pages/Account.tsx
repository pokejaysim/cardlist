import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { EbayPublishSetupCard } from "@/components/EbayPublishSetupCard";
import {
  DESCRIPTION_TEMPLATE_PLACEHOLDERS,
  fallbackDescriptionPreview,
  renderDescriptionTemplatePreview,
} from "@/lib/descriptionTemplatePreview";
import {
  ExternalLink,
  CheckCircle2,
  Circle,
  Loader2,
  Crown,
  AlertTriangle,
} from "lucide-react";
import type { CardCondition, ListingPreference, ListingType, UsageInfo } from "../../../shared/types";

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

  const { data: listingPreferences } = useQuery({
    queryKey: ["listing-preferences"],
    queryFn: () => apiFetch<ListingPreference>("/account/listing-preferences"),
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

      {ebayStatus?.linked && (
        <div className="mt-4">
          <EbayPublishSetupCard />
        </div>
      )}

      {listingPreferences && (
        <ListingPreferencesCard initialPreferences={listingPreferences} />
      )}
    </div>
  );
}

function ListingPreferencesCard({
  initialPreferences,
}: {
  initialPreferences: ListingPreference;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPreferences(initialPreferences);
  }, [initialPreferences]);

  async function savePreferences() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const saved = await apiFetch<ListingPreference>("/account/listing-preferences", {
        method: "PUT",
        body: JSON.stringify({
          default_listing_type: preferences.default_listing_type,
          default_batch_fixed_price: preferences.default_batch_fixed_price,
          price_rounding_enabled: preferences.price_rounding_enabled,
          default_raw_condition: preferences.default_raw_condition,
          description_template: preferences.description_template,
          description_template_html: preferences.description_template_html,
          seller_logo_url: preferences.seller_logo_url,
        }),
      });
      setPreferences(saved);
      setMessage("Listing preferences saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save listing preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Autopilot Listing Preferences</CardTitle>
        <CardDescription>
          Defaults SnapCard uses when it creates batch drafts for eBay Canada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default listing type</Label>
            <select
              value={preferences.default_listing_type}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  default_listing_type: event.target.value as ListingType,
                }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="fixed_price">Fixed price</option>
              <option value="auction">Auction</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Raw condition fallback</Label>
            <select
              value={preferences.default_raw_condition}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  default_raw_condition: event.target.value as CardCondition,
                }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="NM">NM</option>
              <option value="LP">LP</option>
              <option value="MP">MP</option>
              <option value="HP">HP</option>
              <option value="DMG">DMG</option>
            </select>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            checked={preferences.default_batch_fixed_price}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                default_batch_fixed_price: event.target.checked,
              }))
            }
            className="mt-1 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">Batch drafts default to fixed price</span>
            <span className="block text-muted-foreground">
              Recommended for the beta because eBay fixed-price listings use GTC and avoid invalid auction duration errors.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            checked={preferences.price_rounding_enabled}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                price_rounding_enabled: event.target.checked,
              }))
            }
            className="mt-1 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">Use smart CAD price rounding</span>
            <span className="block text-muted-foreground">
              Under $20 rounds to $0.50, $20-$99.99 rounds to .99, and $100+ rounds to the nearest $5.
            </span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label>Seller logo URL</Label>
          <Input
            type="url"
            value={preferences.seller_logo_url ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                seller_logo_url: event.target.value,
              }))
            }
            placeholder="https://example.com/pjs-logo.png"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Must be a public https:// image URL. Use it in your template with {"{{seller_logo_url}}"}.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>eBay HTML description template</Label>
          <Textarea
            value={preferences.description_template_html ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                description_template_html: event.target.value,
              }))
            }
            rows={10}
            className="font-mono text-xs"
            placeholder={`Paste your eBay HTML here. Example: <h2>{{title}}</h2><p>{{condition_description}}</p>`}
          />
          <p className="text-xs text-muted-foreground">
            SnapCard fills placeholders from the card and seller setup. Unsafe eBay HTML like scripts, forms, iframes, JavaScript links, and click handlers is removed.
          </p>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Placeholder cheat sheet
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DESCRIPTION_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                <code
                  key={placeholder}
                  className="rounded bg-background px-1.5 py-0.5 text-[11px]"
                >
                  {`{{${placeholder}}}`}
                </code>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Sample rendered preview</p>
            <div
              className="max-h-96 overflow-auto rounded-md bg-white p-3 text-sm text-slate-900"
              dangerouslySetInnerHTML={{
                __html: buildSampleDescriptionPreview(
                  preferences.description_template_html,
                  preferences.seller_logo_url,
                ),
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Seller notes fallback</Label>
          <Textarea
            value={preferences.description_template ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                description_template: event.target.value,
              }))
            }
            rows={4}
            placeholder="Example: Ships from Canada in a sleeve, top loader, and protective mailer."
          />
          <p className="text-xs text-muted-foreground">
            Used only when no full HTML template is saved. Existing seller notes stay compatible.
          </p>
        </div>

        <Button onClick={savePreferences} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          Save Listing Preferences
        </Button>
      </CardContent>
    </Card>
  );
}

function buildSampleDescriptionPreview(
  templateHtml?: string | null,
  sellerLogoUrl?: string | null,
): string {
  const sample = {
    title: "2025 Pokemon Prismatic Evolutions Fan Rotom #085/131 Holo Rare - NM",
    card_name: "Fan Rotom",
    set_name: "Prismatic Evolutions",
    card_number: "085/131",
    rarity: "Holo Rare",
    language: "English",
    condition: "NM",
    card_type: "raw",
    grading_company: null,
    grade: null,
    price_cad: 5,
    seller_logo_url: sellerLogoUrl || "https://example.com/pjs-logo.png",
    seller_location: "Vancouver, BC V5K 0A1",
    shipping_summary:
      "Ships from Canada via Canada Post Lettermail within 2 business days. Shipping cost: $2.50 CAD.",
    returns_summary: "30-day returns accepted. Buyer pays return shipping.",
  };

  return templateHtml?.trim()
    ? renderDescriptionTemplatePreview(templateHtml, sample)
    : fallbackDescriptionPreview(sample);
}
