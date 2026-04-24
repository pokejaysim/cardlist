import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Truck,
} from "lucide-react";
import type { EbayPublishSettingsResponse } from "../../../shared/types";
import {
  CANADA_BETA_MARKETPLACE_ID,
  EBAY_MARKETPLACE_CONFIG,
  SNAPCARD_FALLBACK_HANDLING_TIME_OPTIONS,
  SNAPCARD_FALLBACK_RETURN_DAYS_OPTIONS,
  SNAPCARD_FALLBACK_SHIPPING_OPTIONS,
} from "../../../shared/types";

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
  shipping_service: string;
  shipping_cost: string;
  handling_time_days: string;
  returns_accepted: "" | "yes" | "no";
  return_period_days: string;
  return_shipping_cost_payer: "" | "Buyer" | "Seller";
}

const SELECT_CLASS_NAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_FORM: SellerSettingsForm = {
  location: "",
  postal_code: "",
  fulfillment_policy_id: "",
  payment_policy_id: "",
  return_policy_id: "",
  shipping_service: "",
  shipping_cost: "",
  handling_time_days: "",
  returns_accepted: "",
  return_period_days: "",
  return_shipping_cost_payer: "",
};

export function EbayPublishSetupCard({
  title = "eBay Publish Setup",
  description = "Canada beta: save your eBay.ca seller defaults once so SnapCard can publish without asking for shipping and return details every time.",
  onStateChange,
}: EbayPublishSetupCardProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SellerSettingsForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedMarketplace = CANADA_BETA_MARKETPLACE_ID;

  const settingsQuery = useQuery({
    queryKey: ["ebay-publish-settings", CANADA_BETA_MARKETPLACE_ID],
    queryFn: () =>
      apiFetch<EbayPublishSettingsResponse>(
        `/account/ebay-publish-settings?marketplace_id=${CANADA_BETA_MARKETPLACE_ID}`,
      ),
  });

  useEffect(() => {
    onStateChange?.(settingsQuery.data ?? null);
  }, [onStateChange, settingsQuery.data]);

  useEffect(() => {
    const settings = settingsQuery.data?.settings;
    if (!settings) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      location: settings.location ?? "",
      postal_code: settings.postal_code ?? "",
      fulfillment_policy_id: settings.fulfillment_policy_id ?? "",
      payment_policy_id: settings.payment_policy_id ?? "",
      return_policy_id: settings.return_policy_id ?? "",
      shipping_service: settings.shipping_service ?? "",
      shipping_cost:
        settings.shipping_cost != null ? String(settings.shipping_cost) : "",
      handling_time_days:
        settings.handling_time_days != null
          ? String(settings.handling_time_days)
          : "",
      returns_accepted:
        settings.returns_accepted == null
          ? ""
          : settings.returns_accepted
            ? "yes"
            : "no",
      return_period_days:
        settings.return_period_days != null
          ? String(settings.return_period_days)
          : "",
      return_shipping_cost_payer:
        settings.return_shipping_cost_payer ?? "",
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
          shipping_service: form.shipping_service || null,
          shipping_cost:
            form.shipping_cost.trim() === ""
              ? null
              : Number(form.shipping_cost),
          handling_time_days:
            form.handling_time_days.trim() === ""
              ? null
              : Number(form.handling_time_days),
          returns_accepted:
            form.returns_accepted === ""
              ? null
              : form.returns_accepted === "yes",
          return_period_days:
            form.returns_accepted === "yes" && form.return_period_days
              ? Number(form.return_period_days)
              : null,
          return_shipping_cost_payer:
            form.returns_accepted === "yes"
              ? form.return_shipping_cost_payer || null
              : null,
          marketplace_id: CANADA_BETA_MARKETPLACE_ID,
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
          publishing defaults.
        </CardContent>
      </Card>
    );
  }

  const settings = settingsQuery.data;
  const currentConfig = EBAY_MARKETPLACE_CONFIG[selectedMarketplace];
  const shippingOptions = SNAPCARD_FALLBACK_SHIPPING_OPTIONS[selectedMarketplace];
  const usingFallback = settings.publish_strategy === "snapcard_defaults";
  const returnsAccepted = form.returns_accepted === "yes";

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
              {usingFallback ? "Ready with SnapCard defaults" : "Ready to publish"}
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

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-medium">{currentConfig.label} beta</p>
          <p className="mt-1 text-muted-foreground">
            SnapCard is proving the Canada workflow first. New beta listings use{" "}
            {currentConfig.currency}; US and international marketplace support
            stays hidden until the Canada model is reliable.
          </p>
        </div>

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

        {settings.policy_support.message && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
            {settings.policy_support.message}
          </div>
        )}

        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <p className="font-medium">eBay business policies</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional in beta. If you select all three policies, SnapCard will
              use your eBay business policies. If you leave them blank, SnapCard
              will publish with the fallback defaults below instead.
            </p>
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
                disabled={!settings.policy_support.available}
              >
                <option value="">Use SnapCard defaults instead</option>
                {settings.available_policies.fulfillment.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
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
                disabled={!settings.policy_support.available}
              >
                <option value="">Use SnapCard defaults instead</option>
                {settings.available_policies.payment.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
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
                disabled={!settings.policy_support.available}
              >
                <option value="">Use SnapCard defaults instead</option>
                {settings.available_policies.return.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Truck className="size-4" />
            </div>
            <div>
              <p className="font-medium">SnapCard fallback defaults</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use these beta defaults when you don’t want to depend on eBay
                business policies. SnapCard will send shipping and return details
                directly in the Trading API request.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="snapcard-shipping-service">Shipping service</Label>
              <select
                id="snapcard-shipping-service"
                className={SELECT_CLASS_NAME}
                value={form.shipping_service}
                onChange={(event) =>
                  updateField("shipping_service", event.target.value)
                }
              >
                <option value="">Select a shipping service</option>
                {shippingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="snapcard-shipping-cost">
                Shipping cost ({currentConfig.currency})
              </Label>
              <Input
                id="snapcard-shipping-cost"
                inputMode="decimal"
                value={form.shipping_cost}
                onChange={(event) =>
                  updateField("shipping_cost", event.target.value)
                }
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="snapcard-handling-time">Handling time</Label>
              <select
                id="snapcard-handling-time"
                className={SELECT_CLASS_NAME}
                value={form.handling_time_days}
                onChange={(event) =>
                  updateField("handling_time_days", event.target.value)
                }
              >
                <option value="">Select handling time</option>
                {SNAPCARD_FALLBACK_HANDLING_TIME_OPTIONS.map((days) => (
                  <option key={days} value={String(days)}>
                    {days} business day{days === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="snapcard-returns-accepted">Returns accepted</Label>
              <select
                id="snapcard-returns-accepted"
                className={SELECT_CLASS_NAME}
                value={form.returns_accepted}
                onChange={(event) =>
                  updateField(
                    "returns_accepted",
                    event.target.value as SellerSettingsForm["returns_accepted"],
                  )
                }
              >
                <option value="">Choose a return setting</option>
                <option value="yes">Yes, accept returns</option>
                <option value="no">No, do not accept returns</option>
              </select>
            </div>
          </div>

          {returnsAccepted && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="snapcard-return-window">Return window</Label>
                <select
                  id="snapcard-return-window"
                  className={SELECT_CLASS_NAME}
                  value={form.return_period_days}
                  onChange={(event) =>
                    updateField("return_period_days", event.target.value)
                  }
                >
                  <option value="">Select a return window</option>
                  {SNAPCARD_FALLBACK_RETURN_DAYS_OPTIONS.map((days) => (
                    <option key={days} value={String(days)}>
                      {days} days
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="snapcard-return-payer">
                  Return shipping paid by
                </Label>
                <select
                  id="snapcard-return-payer"
                  className={SELECT_CLASS_NAME}
                  value={form.return_shipping_cost_payer}
                  onChange={(event) =>
                    updateField(
                      "return_shipping_cost_payer",
                      event.target.value as SellerSettingsForm["return_shipping_cost_payer"],
                    )
                  }
                >
                  <option value="">Select who pays return shipping</option>
                  <option value="Buyer">Buyer</option>
                  <option value="Seller">Seller</option>
                </select>
              </div>
            </div>
          )}
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
