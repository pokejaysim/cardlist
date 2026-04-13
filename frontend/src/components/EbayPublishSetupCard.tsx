import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { EbayPublishSettingsResponse } from "../../../shared/types";

interface EbayPublishSetupCardProps {
  title?: string;
  description?: string;
  onStateChange?: (state: EbayPublishSettingsResponse | null) => void;
}

interface SellerSettingsForm {
  location: string;
  postal_code: string;
  fulfillment_policy_id: string;
  payment_policy_id: string;
  return_policy_id: string;
}

const SELECT_CLASS_NAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function EbayPublishSetupCard({
  title = "eBay Publish Setup",
  description = "Save your seller defaults once so SnapCard can publish without asking for shipping and return details every time.",
  onStateChange,
}: EbayPublishSetupCardProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SellerSettingsForm>({
    location: "",
    postal_code: "",
    fulfillment_policy_id: "",
    payment_policy_id: "",
    return_policy_id: "",
  });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["ebay-publish-settings"],
    queryFn: () =>
      apiFetch<EbayPublishSettingsResponse>("/account/ebay-publish-settings"),
  });

  useEffect(() => {
    onStateChange?.(settingsQuery.data ?? null);
  }, [onStateChange, settingsQuery.data]);

  useEffect(() => {
    if (!settingsQuery.data?.settings) {
      return;
    }

    const settings = settingsQuery.data.settings;
    setForm({
      location: settings.location ?? "",
      postal_code: settings.postal_code ?? "",
      fulfillment_policy_id: settings.fulfillment_policy_id ?? "",
      payment_policy_id: settings.payment_policy_id ?? "",
      return_policy_id: settings.return_policy_id ?? "",
    });
  }, [settingsQuery.data?.settings]);

  function updateField<K extends keyof SellerSettingsForm>(
    key: K,
    value: SellerSettingsForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");

    try {
      await apiFetch<EbayPublishSettingsResponse>("/account/ebay-publish-settings", {
        method: "PUT",
        body: JSON.stringify({
          location: form.location || null,
          postal_code: form.postal_code || null,
          fulfillment_policy_id: form.fulfillment_policy_id || null,
          payment_policy_id: form.payment_policy_id || null,
          return_policy_id: form.return_policy_id || null,
        }),
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ebay-publish-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["publish-readiness"] }),
      ]);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to save eBay publish settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your eBay publish settings...
        </CardContent>
      </Card>
    );
  }

  if (settingsQuery.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : "Failed to load eBay publish settings."}
        </CardContent>
      </Card>
    );
  }

  if (!settingsQuery.data?.linked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Connect your eBay account first, then come back here to choose your
          shipping, payment, and return defaults.
        </CardContent>
      </Card>
    );
  }

  const settings = settingsQuery.data;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {settings.readiness.ready ? (
            <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <CheckCircle2 className="size-3.5" />
              Ready to publish
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              <AlertTriangle className="size-3.5" />
              Setup needed
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.readiness.missing.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">Finish these once to unlock one-click publish:</p>
            <ul className="mt-2 space-y-1 pl-5 text-amber-900">
              {settings.readiness.missing.map((item) => (
                <li key={item} className="list-disc">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {saveError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {saveError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ebay-location">Seller location</Label>
            <Input
              id="ebay-location"
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              placeholder="Vancouver, BC"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ebay-postal-code">Postal code</Label>
            <Input
              id="ebay-postal-code"
              value={form.postal_code}
              onChange={(event) =>
                updateField("postal_code", event.target.value.toUpperCase())
              }
              placeholder="V5V 1A1"
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="ebay-fulfillment-policy">Fulfillment policy</Label>
            <select
              id="ebay-fulfillment-policy"
              className={SELECT_CLASS_NAME}
              value={form.fulfillment_policy_id}
              onChange={(event) =>
                updateField("fulfillment_policy_id", event.target.value)
              }
            >
              <option value="">Select a fulfillment policy</option>
              {settings.available_policies.fulfillment.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name}
                </option>
              ))}
            </select>
            {settings.available_policies.fulfillment.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create at least one fulfillment policy in eBay Seller Hub, then refresh.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ebay-payment-policy">Payment policy</Label>
            <select
              id="ebay-payment-policy"
              className={SELECT_CLASS_NAME}
              value={form.payment_policy_id}
              onChange={(event) =>
                updateField("payment_policy_id", event.target.value)
              }
            >
              <option value="">Select a payment policy</option>
              {settings.available_policies.payment.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name}
                </option>
              ))}
            </select>
            {settings.available_policies.payment.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create at least one payment policy in eBay Seller Hub, then refresh.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ebay-return-policy">Return policy</Label>
            <select
              id="ebay-return-policy"
              className={SELECT_CLASS_NAME}
              value={form.return_policy_id}
              onChange={(event) =>
                updateField("return_policy_id", event.target.value)
              }
            >
              <option value="">Select a return policy</option>
              {settings.available_policies.return.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name}
                </option>
              ))}
            </select>
            {settings.available_policies.return.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create at least one return policy in eBay Seller Hub, then refresh.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" />
            )}
            Save eBay defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
          >
            {settingsQuery.isFetching ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-4" />
            )}
            Refresh from eBay
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
