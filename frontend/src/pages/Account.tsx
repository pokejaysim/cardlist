/**
 * Account — slab/scanner edition.
 *
 * Settings page: profile · plan · eBay connection · publish setup ·
 * autopilot listing preferences (default listing type, fallback
 * condition, batch defaults, price rounding, seller logo, HTML template).
 *
 * Behaviour preserved 1:1 — every query, mutation, file upload, and
 * the inline ListingPreferencesCard component all work exactly as
 * before. Only the visual layer changed.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChipMono,
  Slab,
  SlabButton,
  SlabFieldGroup,
  SlabSelect,
  ToggleButton,
} from "@/components/slab";
import { apiFetch, apiUpload } from "@/lib/api";
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
  ImageIcon,
  Loader2,
  Crown,
  AlertTriangle,
  Upload,
} from "lucide-react";
import type {
  CardCondition,
  ListingPreference,
  ListingType,
  UsageInfo,
} from "../../../shared/types";

interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  onboarding_complete?: boolean;
}

const RAW_CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

export default function Account() {
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["account"],
    queryFn: () => apiFetch<AccountInfo>("/account"),
  });

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageInfo>("/account/usage"),
  });

  const { data: ebayStatus, refetch: refetchEbayStatus } = useQuery({
    queryKey: ["ebay-status"],
    queryFn: () =>
      apiFetch<{
        linked: boolean;
        ebay_user_id?: string;
        token_expired?: boolean;
        needs_reconnect?: boolean;
      }>("/account/ebay-status"),
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
      setLinkError(err instanceof Error ? err.message : "Failed to connect to eBay");
      setLinking(false);
    }
  }

  async function disconnectEbay() {
    if (
      !confirm(
        "Disconnect your eBay account? You'll need to reconnect to publish listings.",
      )
    )
      return;
    setDisconnecting(true);
    try {
      await apiFetch<{ unlinked: boolean }>("/account/ebay", { method: "DELETE" });
      refetchEbayStatus();
    } catch {
      alert("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (accountLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 0",
          color: "var(--ink-soft)",
        }}
      >
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px 60px", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 2,
            color: "var(--ink-soft)",
          }}
        >
          MODULE 04 · ACCOUNT
        </div>
        <div
          className="hand"
          style={{
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1,
            marginTop: 4,
          }}
        >
          Your seller setup.
        </div>
        <div
          style={{
            fontFamily: "var(--font-marker)",
            fontSize: 14,
            color: "var(--ink-soft)",
            marginTop: 6,
          }}
        >
          Profile, eBay connection, and autopilot defaults.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
        {/* ── Profile ── */}
        <Slab label="PROFILE" grade="01" cert="IDENTITY">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <ProfileRow label="NAME" value={account?.name ?? "—"} />
            <ProfileRow label="EMAIL" value={account?.email ?? "—"} />
          </div>
        </Slab>

        {/* ── Plan & Usage ── */}
        <Slab
          label="PLAN & USAGE"
          grade={account?.plan === "free" ? "F" : "A"}
          cert={account?.plan === "free" ? "FREE TIER" : "PRO TIER"}
          foot={
            <>
              <span>BILLED MONTHLY</span>
              <span>CANCEL ANYTIME</span>
            </>
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              justifyContent: "space-between",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <ChipMono solid={account?.plan !== "free"}>
              {account?.plan === "free" ? "F · FREE" : "A · PRO"}
            </ChipMono>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 1,
                color: "var(--ink)",
              }}
            >
              {usage
                ? usage.listings_limit !== null
                  ? `${String(usage.listings_this_month)} / ${String(usage.listings_limit)} LISTINGS THIS MONTH`
                  : "UNLIMITED LISTINGS"
                : "LOADING USAGE…"}
            </span>
          </div>
          {account?.plan === "free" && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                background: "var(--paper-2)",
                border: "1.5px solid var(--ink)",
                padding: 12,
              }}
            >
              <Crown
                className="size-5 shrink-0"
                style={{ color: "var(--ink)", marginTop: 2 }}
              />
              <div
                style={{
                  fontFamily: "var(--font-marker)",
                  fontSize: 13,
                  color: "var(--ink)",
                  lineHeight: 1.5,
                }}
              >
                Upgrade to <strong>Pro</strong> for unlimited listings, AI card
                identification, and pricing suggestions.
              </div>
            </div>
          )}
        </Slab>

        {/* ── eBay Connection ── */}
        <Slab
          label="EBAY ACCOUNT"
          grade={ebayStatus?.linked ? (ebayStatus.needs_reconnect ? "!" : "✓") : "○"}
          cert={
            ebayStatus?.linked
              ? ebayStatus.needs_reconnect
                ? "RECONNECT NEEDED"
                : "CONNECTED"
              : "NOT CONNECTED"
          }
          yellow={ebayStatus?.linked && !ebayStatus.needs_reconnect}
          foot={
            <>
              <span>OAUTH · TLS</span>
              <span>EBAY.CA</span>
            </>
          }
        >
          {ebayStatus?.linked ? (
            <>
              {ebayStatus.needs_reconnect ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    background: "#c44536",
                    color: "var(--paper)",
                    padding: 12,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: 1,
                    border: "2px solid var(--ink)",
                    marginBottom: 12,
                  }}
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span style={{ flex: 1 }}>
                    ! YOUR EBAY CONNECTION EXPIRED OR IS NO LONGER VALID. PLEASE RECONNECT.
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: 1,
                    color: "var(--ink)",
                    marginBottom: 12,
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  <span>
                    CONNECTED
                    {ebayStatus.ebay_user_id && ` · ${ebayStatus.ebay_user_id.toUpperCase()}`}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {ebayStatus.needs_reconnect && (
                  <SlabButton primary size="sm" onClick={linkEbay} disabled={linking}>
                    {linking ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ExternalLink className="size-3" />
                    )}
                    {linking ? "REDIRECTING…" : "RECONNECT EBAY"}
                  </SlabButton>
                )}
                <SlabButton size="sm" onClick={disconnectEbay} disabled={disconnecting}>
                  {disconnecting && <Loader2 className="size-3 animate-spin" />}
                  {disconnecting ? "DISCONNECTING…" : "DISCONNECT EBAY"}
                </SlabButton>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "var(--ink-soft)",
                  marginBottom: 12,
                }}
              >
                <Circle className="size-4" />
                <span>NOT CONNECTED</span>
              </div>
              {linkError && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    background: "#c44536",
                    color: "var(--paper)",
                    padding: 12,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: 1,
                    border: "2px solid var(--ink)",
                    marginBottom: 12,
                  }}
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span style={{ flex: 1 }}>! {linkError}</span>
                </div>
              )}
              <SlabButton primary onClick={linkEbay} disabled={linking}>
                {linking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                {linking ? "REDIRECTING…" : "▸ CONNECT EBAY ACCOUNT"}
              </SlabButton>
            </>
          )}
        </Slab>

        {/* ── eBay Publish Setup ── */}
        {ebayStatus?.linked && <EbayPublishSetupCard />}

        {/* ── Listing Preferences ── */}
        {listingPreferences && (
          <ListingPreferencesCard initialPreferences={listingPreferences} />
        )}
      </div>
    </div>
  );
}

// ── Profile row ────────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1.5px solid var(--ink)",
        padding: "8px 12px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--ink)",
          marginTop: 2,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Listing preferences card ──────────────────────────────

function ListingPreferencesCard({
  initialPreferences,
}: {
  initialPreferences: ListingPreference;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const templateLooksLikePlainText = looksLikeRenderedTemplateText(
    preferences.description_template_html,
  );

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
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save listing preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function importHtmlTemplate(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setMessage("");

    try {
      const text = await file.text();
      if (!text.trim()) {
        setError("That HTML file is empty.");
        return;
      }

      setPreferences((current) => ({
        ...current,
        description_template_html: text,
      }));
      setMessage("HTML template imported. Review the preview, then save.");
    } catch {
      setError(
        "Could not read that HTML file. Try opening it in a code editor and copying the raw HTML.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function uploadLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setMessage("");
    setUploadingLogo(true);

    try {
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file for your logo.");
        return;
      }

      const formData = new FormData();
      formData.append("logo", file);
      const saved = await apiUpload<ListingPreference>(
        "/account/listing-preferences/logo",
        formData,
      );
      setPreferences(saved);
      setMessage("Logo uploaded and saved.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Could not upload logo.",
      );
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  return (
    <Slab
      label="AUTOPILOT PREFERENCES"
      grade="◐"
      cert="BATCH DEFAULTS"
      foot={
        <>
          <span>USED FOR BATCH DRAFTS</span>
          <span>EBAY.CA</span>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            fontFamily: "var(--font-marker)",
            fontSize: 13,
            color: "var(--ink-soft)",
            lineHeight: 1.5,
          }}
        >
          Defaults SnapCard uses when it creates batch drafts for eBay Canada.
        </div>

        {message && (
          <div
            style={{
              background: "var(--accent)",
              color: "var(--ink)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 1,
              border: "2px solid var(--ink)",
              fontWeight: 700,
            }}
          >
            ✓ {message}
          </div>
        )}
        {error && (
          <div
            style={{
              background: "#c44536",
              color: "var(--paper)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 1,
              border: "2px solid var(--ink)",
            }}
          >
            ! {error}
          </div>
        )}

        {/* Listing type + condition */}
        <div className="acct-grid-2">
          <SlabFieldGroup label="DEFAULT LISTING TYPE">
            <SlabSelect
              value={preferences.default_listing_type}
              onChange={(v) =>
                setPreferences((current) => ({
                  ...current,
                  default_listing_type: v as ListingType,
                }))
              }
              options={[
                { value: "fixed_price", label: "Fixed price" },
                { value: "auction", label: "Auction" },
              ]}
            />
          </SlabFieldGroup>
          <SlabFieldGroup label="RAW CONDITION FALLBACK">
            <div style={{ display: "flex", gap: 4 }}>
              {RAW_CONDITIONS.map((c) => (
                <ToggleButton
                  key={c}
                  active={preferences.default_raw_condition === c}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      default_raw_condition: c,
                    }))
                  }
                  size="sm"
                >
                  {c}
                </ToggleButton>
              ))}
            </div>
          </SlabFieldGroup>
        </div>

        {/* Toggles as checkbox cards */}
        <CheckboxCard
          label="BATCH DRAFTS DEFAULT TO FIXED PRICE"
          desc="Recommended for the beta — fixed-price uses GTC and avoids invalid auction-duration errors."
          checked={preferences.default_batch_fixed_price}
          onChange={(checked) =>
            setPreferences((current) => ({
              ...current,
              default_batch_fixed_price: checked,
            }))
          }
        />
        <CheckboxCard
          label="USE SMART CAD PRICE ROUNDING"
          desc="Under $20 → $0.50 · $20–$99.99 → .99 · $100+ → nearest $5."
          checked={preferences.price_rounding_enabled}
          onChange={(checked) =>
            setPreferences((current) => ({
              ...current,
              price_rounding_enabled: checked,
            }))
          }
        />

        {/* Seller logo */}
        <SlabFieldGroup label="SELLER LOGO URL">
          <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
            <input
              type="url"
              value={preferences.seller_logo_url ?? ""}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  seller_logo_url: event.target.value,
                }))
              }
              placeholder="https://example.com/pjs-logo.png"
              style={{
                flex: "1 1 200px",
                padding: "8px 12px",
                background: "var(--paper)",
                border: "1.5px solid var(--ink)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ink)",
                outline: "none",
                borderRadius: 0,
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.boxShadow = "3px 3px 0 var(--accent)";
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = "none";
              }}
            />
            <input
              ref={logoFileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => void uploadLogoFile(event)}
              style={{ display: "none" }}
            />
            <SlabButton
              onClick={() => logoFileInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageIcon className="size-4" />
              )}
              UPLOAD LOGO
            </SlabButton>
          </div>
          {preferences.seller_logo_url && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 12,
                alignItems: "center",
                background: "var(--paper-2)",
                border: "1.5px solid var(--ink)",
                padding: 10,
              }}
            >
              <img
                src={preferences.seller_logo_url}
                alt="Seller logo preview"
                style={{
                  maxHeight: 56,
                  maxWidth: 160,
                  background: "#fff",
                  objectFit: "contain",
                  border: "1.5px solid var(--ink)",
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 0.5,
                  color: "var(--ink-soft)",
                  wordBreak: "break-all",
                }}
              >
                {preferences.seller_logo_url}
              </span>
            </div>
          )}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 0.5,
              color: "var(--ink-soft)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Upload once or paste an https:// URL. Reference in your template with{" "}
            <code style={kbdStyle}>{"{{seller_logo_url}}"}</code>.
          </div>
        </SlabFieldGroup>

        {/* HTML template */}
        <SlabFieldGroup label="EBAY HTML DESCRIPTION TEMPLATE">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <input
              ref={htmlFileInputRef}
              type="file"
              accept=".html,.htm,text/html"
              onChange={(event) => void importHtmlTemplate(event)}
              style={{ display: "none" }}
            />
            <SlabButton size="sm" onClick={() => htmlFileInputRef.current?.click()}>
              <Upload className="size-3" />
              IMPORT HTML FILE
            </SlabButton>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: 0.5,
                color: "var(--ink-soft)",
                lineHeight: 1.4,
              }}
            >
              Best option — choose the .html file directly so SnapCard reads the raw code.
            </span>
          </div>
          <textarea
            value={preferences.description_template_html ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                description_template_html: event.target.value,
              }))
            }
            rows={10}
            placeholder={`Paste your eBay HTML here. Example: <h2>{{title}}</h2><p>{{condition_description}}</p>`}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              background: "var(--paper)",
              border: "1.5px solid var(--ink)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink)",
              outline: "none",
              borderRadius: 0,
              boxSizing: "border-box",
              resize: "vertical",
              lineHeight: 1.4,
            }}
            onFocus={(e) => {
              e.target.style.boxShadow = "3px 3px 0 var(--accent)";
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = "none";
            }}
          />
          {templateLooksLikePlainText && (
            <div
              style={{
                marginTop: 8,
                border: "1.5px solid #f5a623",
                background: "rgba(245,166,35,0.08)",
                padding: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: 0.5,
                color: "var(--ink)",
                lineHeight: 1.5,
              }}
            >
              ? This looks like rendered text, not raw HTML. Use Import HTML file,
              or paste code that starts with a tag like{" "}
              <code style={kbdStyle}>{"<div style=\"...\">"}</code>.
            </div>
          )}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 0.5,
              color: "var(--ink-soft)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            SnapCard fills placeholders from the card and seller setup. Unsafe
            eBay HTML (scripts, forms, iframes, JS links, click handlers) is removed.
          </div>

          {/* Cheat sheet */}
          <div
            style={{
              marginTop: 10,
              border: "1.5px dashed var(--ink)",
              background: "var(--paper-2)",
              padding: 10,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1.5,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 6,
              }}
            >
              ★ PLACEHOLDER CHEAT SHEET
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {DESCRIPTION_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                <code
                  key={placeholder}
                  style={{
                    background: "var(--paper)",
                    border: "1.5px solid var(--ink)",
                    padding: "2px 6px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {`{{${placeholder}}}`}
                </code>
              ))}
            </div>
          </div>

          {/* Sample preview */}
          <div
            style={{
              marginTop: 10,
              border: "1.5px solid var(--ink)",
              background: "var(--paper)",
            }}
          >
            <div
              style={{
                background: "var(--ink)",
                color: "var(--paper)",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 1.5,
              }}
            >
              ★ SAMPLE RENDERED PREVIEW
            </div>
            <div
              style={{
                maxHeight: 384,
                overflow: "auto",
                background: "#fff",
                color: "#0e0e10",
                padding: 12,
                fontSize: 13,
                fontFamily: "system-ui, sans-serif",
              }}
              dangerouslySetInnerHTML={{
                __html: buildSampleDescriptionPreview(
                  preferences.description_template_html,
                  preferences.seller_logo_url,
                ),
              }}
            />
          </div>
        </SlabFieldGroup>

        {/* Seller notes fallback */}
        <SlabFieldGroup label="SELLER NOTES FALLBACK">
          <textarea
            value={preferences.description_template ?? ""}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                description_template: event.target.value,
              }))
            }
            rows={4}
            placeholder="Example: Ships from Canada in a sleeve, top loader, and protective mailer."
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              background: "var(--paper)",
              border: "1.5px solid var(--ink)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink)",
              outline: "none",
              borderRadius: 0,
              boxSizing: "border-box",
              resize: "vertical",
              lineHeight: 1.4,
            }}
            onFocus={(e) => {
              e.target.style.boxShadow = "3px 3px 0 var(--accent)";
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = "none";
            }}
          />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 0.5,
              color: "var(--ink-soft)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Used only when no full HTML template is saved. Existing seller notes stay compatible.
          </div>
        </SlabFieldGroup>

        {/* Save action */}
        <div
          style={{
            display: "flex",
            paddingTop: 14,
            borderTop: "1.5px dashed var(--ink)",
          }}
        >
          <SlabButton primary onClick={savePreferences} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            ▸ SAVE LISTING PREFERENCES
          </SlabButton>
        </div>
      </div>

      <style>{`
        .acct-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 600px) {
          .acct-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Slab>
  );
}

// ── Checkbox card ─────────────────────────────────────────

function CheckboxCard({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px",
        background: checked ? "var(--accent-soft)" : "var(--paper-2)",
        border: `1.5px solid ${checked ? "var(--accent-2)" : "var(--ink)"}`,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{
          width: 16,
          height: 16,
          accentColor: "var(--ink)",
          cursor: "pointer",
          marginTop: 2,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 1,
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-marker)",
            fontSize: 12,
            color: "var(--ink-soft)",
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {desc}
        </div>
      </div>
    </label>
  );
}

// ── Inline-style helper ───────────────────────────────────

const kbdStyle = {
  margin: "0 2px",
  padding: "1px 4px",
  background: "rgba(0,0,0,0.08)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
} as const;

// ── Helpers (preserved verbatim from previous version) ────

function looksLikeRenderedTemplateText(templateHtml?: string | null): boolean {
  const text = templateHtml?.trim();
  if (!text) return false;
  const hasHtmlTag = /<[a-zA-Z][\s\S]*>/.test(text);
  if (hasHtmlTag) return false;
  return /\b(AUTHENTICATED|SPECIFICATIONS|CONDITION NOTES|RETURNS|ABOUT PJS COLLECTIBLES)\b/i.test(
    text,
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
    cert_number: null,
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
