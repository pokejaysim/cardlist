import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  Send,
  Trash2,
  AlertTriangle,
  Pencil,
  Check,
  X,
  ImageIcon,
} from "lucide-react";
import { useState } from "react";

interface Listing {
  id: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  language: string;
  condition: string | null;
  status: string;
  title: string | null;
  description: string | null;
  price_cad: number | null;
  listing_type: string;
  duration: number;
  ebay_item_id: number | null;
  ebay_error: string | null;
  created_at: string;
  published_at: string | null;
}

interface Photo {
  id: string;
  file_url: string;
  ebay_url: string | null;
  position: number;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  published: "default",
  error: "destructive",
};

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Edit form state
  const [editFields, setEditFields] = useState<Record<string, string | number | null>>({});

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => apiFetch<Listing>(`/listings/${id}`),
    enabled: !!id,
  });

  const { data: photos } = useQuery({
    queryKey: ["listing-photos", id],
    queryFn: () => apiFetch<Photo[]>(`/listings/${id}/photos`),
    enabled: !!id,
  });

  function startEditing() {
    if (!listing) return;
    setEditFields({
      card_name: listing.card_name,
      set_name: listing.set_name,
      card_number: listing.card_number,
      rarity: listing.rarity,
      condition: listing.condition,
      language: listing.language,
      price_cad: listing.price_cad,
      title: listing.title,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditFields({});
    setError("");
  }

  function updateField(key: string, value: string | number | null) {
    setEditFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveEdit() {
    if (!id) return;
    setError("");
    setSaving(true);

    try {
      await apiFetch(`/listings/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editFields,
          price_cad: editFields.price_cad ? Number(editFields.price_cad) : null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["listing", id] });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!id) return;
    setError("");
    setPublishing(true);

    try {
      await apiFetch(`/listings/${id}/publish`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["listing", id] });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);

    try {
      await apiFetch(`/listings/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Listing not found</p>
      </div>
    );
  }

  const isDraft = listing.status === "draft";
  const isError = listing.status === "error";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{listing.card_name}</h1>
          <p className="text-sm text-muted-foreground">
            {listing.set_name ?? "Unknown set"} &middot; {listing.condition ?? "\u2014"}
          </p>
        </div>
        <Badge variant={statusColors[listing.status] ?? "outline"}>
          {listing.status}
        </Badge>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {listing.ebay_error && (
        <div className="mb-4 flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">eBay Error</p>
            <p>{listing.ebay_error}</p>
          </div>
        </div>
      )}

      {/* Photos */}
      {photos && photos.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  <img
                    src={photo.ebay_url ?? photo.file_url}
                    alt={`Card photo ${photo.position + 1}`}
                    className="size-full object-cover"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {photos && photos.length === 0 && (
        <Card className="mb-4">
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <ImageIcon className="size-4" />
            No photos uploaded yet.
          </CardContent>
        </Card>
      )}

      {/* Card Details */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Card Details</CardTitle>
            {isDraft && !editing && (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            )}
            {editing && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 size-3.5" />
                  )}
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  <X className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Card Name</Label>
                <Input
                  value={(editFields.card_name as string) ?? ""}
                  onChange={(e) => updateField("card_name", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Set</Label>
                <Input
                  value={(editFields.set_name as string) ?? ""}
                  onChange={(e) => updateField("set_name", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Number</Label>
                <Input
                  value={(editFields.card_number as string) ?? ""}
                  onChange={(e) => updateField("card_number", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rarity</Label>
                <Input
                  value={(editFields.rarity as string) ?? ""}
                  onChange={(e) => updateField("rarity", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input
                  value={(editFields.language as string) ?? ""}
                  onChange={(e) => updateField("language", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <div className="flex gap-1">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateField("condition", c)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                        editFields.condition === c
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-accent"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ["Card Name", listing.card_name],
                ["Set", listing.set_name],
                ["Number", listing.card_number],
                ["Rarity", listing.rarity],
                ["Language", listing.language],
                ["Condition", listing.condition],
              ].map(
                ([label, value]) =>
                  value && (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  )
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Listing Details */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Listing Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {editing ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">eBay Title</Label>
                <Input
                  value={(editFields.title as string) ?? ""}
                  onChange={(e) =>
                    updateField("title", e.target.value.slice(0, 80))
                  }
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground">
                  {((editFields.title as string) ?? "").length}/80
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price (CAD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editFields.price_cad ?? ""}
                  onChange={(e) =>
                    updateField(
                      "price_cad",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-muted-foreground">eBay Title</p>
                <p className="font-medium">{listing.title ?? "Not generated"}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-medium">
                    {listing.price_cad ? `$${listing.price_cad} CAD` : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {listing.listing_type === "auction" ? "Auction" : "Buy It Now"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">{listing.duration} days</p>
                </div>
              </div>
            </>
          )}
          {listing.ebay_item_id && (
            <div>
              <p className="text-muted-foreground">eBay Item ID</p>
              <a
                href={`https://www.ebay.ca/itm/${listing.ebay_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-4"
              >
                {listing.ebay_item_id}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        {isDraft && !editing && (
          <>
            <Button onClick={handlePublish} disabled={publishing} className="flex-1">
              {publishing ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              {publishing ? "Validating..." : "Publish to eBay"}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </>
        )}
        {listing.status === "scheduled" && (
          <p className="text-sm text-muted-foreground">
            This listing is scheduled for publish. It will appear on eBay within 5 hours.
          </p>
        )}
        {isError && (
          <>
            <Button onClick={handlePublish} disabled={publishing} variant="outline" className="flex-1">
              {publishing ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              Retry Publish
            </Button>
            <Button variant="outline" onClick={startEditing}>
              <Pencil className="mr-1.5 size-4" />
              Edit & Fix
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
