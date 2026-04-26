import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { generateTitle } from "../services/titleGenerator.js";
import { buildListingDescription } from "../services/descriptionBuilder.js";
import { requestPublish, type PublishMode } from "../services/ebay/publish.js";
import { getPublishReadiness } from "../services/ebay/readiness.js";
import { uploadPhoto } from "../services/storage.js";
import { PLAN_LIMITS, type PlanName } from "../lib/plans.js";
import {
  CANADA_BETA_CURRENCY_CODE,
  CANADA_BETA_MARKETPLACE_ID,
  isMockMode,
} from "../services/ebay/config.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function sanitizeEbayAspects(
  input: unknown,
): Record<string, string | string[]> | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(input)) {
    const name = key.trim();
    if (!name) continue;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) normalized[name] = trimmed;
      continue;
    }

    if (Array.isArray(value)) {
      const values = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);

      if (values.length > 0) {
        normalized[name] = values;
      }
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : {};
}

function normalizeListingDuration(
  listingType: unknown,
  duration: unknown,
): number {
  if (listingType === "fixed_price") {
    return 30;
  }

  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return Math.round(duration);
  }

  return 7;
}

// ── Create draft listing ───────────────────────────────

router.post("/listings", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as {
    card_name: string;
    set_name?: string;
    card_number?: string;
    rarity?: string;
    language?: string;
    condition?: string;
    card_game?: string;
    card_type?: string;
    grading_company?: string;
    grade?: string;
    cert_number?: string;
    identified_by?: string;
    listing_type?: string;
    duration?: number;
    price_cad?: number;
    marketplace_id?: string;
    currency_code?: string;
    ebay_aspects?: Record<string, string | string[]>;
  };

  if (!body.card_name) {
    res.status(400).json({ error: "card_name is required" });
    return;
  }

  const isGraded = body.card_type === "graded";

  if (isGraded) {
    if (!body.grading_company) {
      res.status(400).json({ error: "grading_company is required for graded cards" });
      return;
    }
    if (!body.grade) {
      res.status(400).json({ error: "grade is required for graded cards" });
      return;
    }
  } else {
    if (!body.condition) {
      res.status(400).json({ error: "condition is required" });
      return;
    }
  }

  // ── Check monthly listing limit ──────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", authReq.userId)
    .single();

  const plan = (user?.plan ?? "free") as PlanName;
  const limits = PLAN_LIMITS[plan];

  if (limits.monthly_listings !== Infinity) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", authReq.userId)
      .gte("created_at", startOfMonth.toISOString());

    if ((count ?? 0) >= limits.monthly_listings) {
      res.status(403).json({
        error: `Monthly listing limit reached (${count}/${limits.monthly_listings}). Upgrade to Pro for unlimited listings.`,
        code: "LISTING_LIMIT",
      });
      return;
    }
  }

  // Auto-generate title and description
  const title = generateTitle({
    card_name: body.card_name,
    card_number: body.card_number ?? null,
    set_name: body.set_name ?? null,
    rarity: body.rarity ?? null,
    condition: body.condition ?? null,
    language: body.language ?? null,
    card_type: isGraded ? "graded" : "raw",
    grading_company: body.grading_company ?? null,
    grade: body.grade ?? null,
    cert_number: isGraded ? normalizeCertNumber(body.cert_number) : null,
  });

  const description = await buildListingDescription(authReq.userId, {
    title,
    card_name: body.card_name,
    set_name: body.set_name ?? null,
    card_number: body.card_number ?? null,
    rarity: body.rarity ?? null,
    condition: body.condition ?? null,
    language: body.language ?? null,
    card_type: isGraded ? "graded" : "raw",
    grading_company: body.grading_company ?? null,
    grade: body.grade ?? null,
    cert_number: isGraded ? normalizeCertNumber(body.cert_number) : null,
    price_cad: body.price_cad ?? null,
  });

  const { data, error } = await supabase
    .from("listings")
    .insert({
      user_id: authReq.userId,
      status: "draft",
      card_name: body.card_name,
      set_name: body.set_name ?? null,
      card_number: body.card_number ?? null,
      rarity: body.rarity ?? null,
      language: body.language ?? "English",
      condition: body.condition ?? null,
      title,
      description,
      card_game: body.card_game ?? null,
      card_type: isGraded ? "graded" : "raw",
      grading_company: body.grading_company ?? null,
      grade: body.grade ?? null,
      cert_number: isGraded ? normalizeCertNumber(body.cert_number) : null,
      identified_by: body.identified_by ?? "manual",
      listing_type: body.listing_type ?? "auction",
      duration: normalizeListingDuration(
        body.listing_type ?? "auction",
        body.duration,
      ),
      price_cad: body.price_cad ?? null,
      marketplace_id: CANADA_BETA_MARKETPLACE_ID,
      currency_code: CANADA_BETA_CURRENCY_CODE,
      ebay_aspects: sanitizeEbayAspects(body.ebay_aspects),
      photo_urls: [],
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create listing:", error);
    res.status(500).json({ error: "Failed to create listing", code: "DB_ERROR" });
    return;
  }

  res.status(201).json(data);
});

// ── List all listings for user ─────────────────────────

router.get("/listings", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("user_id", authReq.userId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch listings", code: "DB_ERROR" });
    return;
  }

  res.json(data ?? []);
});

// ── Get single listing ─────────────────────────────────

router.get("/listings/:id/publish-readiness", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const listingId = req.params.id as string;

  try {
    const readiness = await getPublishReadiness(listingId, authReq.userId);
    res.json(readiness);
  } catch (error) {
    console.error("Failed to load publish readiness:", error);
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to load publish readiness",
      code: "PUBLISH_READINESS_ERROR",
    });
  }
});

router.get("/listings/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", authReq.userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(data);
});

// ── Update listing ─────────────────────────────────────

router.put("/listings/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as Record<string, unknown>;

  // Allow draft/error edits so users can recover failed eBay validations.
  const { data: existing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", authReq.userId)
    .single();

  if (!existing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (existing.status !== "draft" && existing.status !== "error") {
    res.status(400).json({ error: "Can only edit draft or error listings", code: "INVALID_STATUS" });
    return;
  }

  // If card details changed, regenerate title/description
  const cardFields = [
    "card_name",
    "set_name",
    "card_number",
    "rarity",
    "condition",
    "language",
    "card_type",
    "grading_company",
    "grade",
    "cert_number",
  ];
  const hasCardChanges = cardFields.some((f) => f in body);
  const hasDescriptionChanges =
    hasCardChanges || "title" in body || "price_cad" in body;

  const updates: Record<string, unknown> = { ...body };

  if ("ebay_aspects" in body) {
    updates.ebay_aspects = sanitizeEbayAspects(body.ebay_aspects);
  }

  if ("listing_type" in body || "duration" in body) {
    updates.duration = normalizeListingDuration(
      body.listing_type ?? existing.listing_type,
      body.duration ?? existing.duration,
    );
  }

  if ("marketplace_id" in updates) {
    updates.marketplace_id = CANADA_BETA_MARKETPLACE_ID;
  }

  if ("currency_code" in updates) {
    updates.currency_code = CANADA_BETA_CURRENCY_CODE;
  }

  if (hasDescriptionChanges) {
    const merged = {
      ...(existing as Record<string, unknown>),
      ...body,
      ...updates,
    };
    const isMergedGraded = merged.card_type === "graded";

    const nextTitle = hasCardChanges
      ? generateTitle({
          card_name: String(merged.card_name ?? ""),
          card_number: (merged.card_number as string | null) ?? null,
          set_name: (merged.set_name as string | null) ?? null,
          rarity: (merged.rarity as string | null) ?? null,
          condition: isMergedGraded ? null : ((merged.condition as string | null) ?? null),
          language: (merged.language as string | null) ?? null,
          card_type: isMergedGraded ? "graded" : "raw",
          grading_company: (merged.grading_company as string | null) ?? null,
          grade: (merged.grade as string | null) ?? null,
          cert_number: isMergedGraded
            ? normalizeCertNumber(merged.cert_number)
            : null,
        })
      : typeof merged.title === "string"
        ? merged.title
        : null;

    if (hasCardChanges) {
      updates.title = nextTitle;
    }

    updates.description = await buildListingDescription(authReq.userId, {
      title: nextTitle,
      card_name: String(merged.card_name ?? ""),
      set_name: (merged.set_name as string | null) ?? null,
      card_number: (merged.card_number as string | null) ?? null,
      rarity: (merged.rarity as string | null) ?? null,
      condition: isMergedGraded ? null : ((merged.condition as string | null) ?? null),
      language: (merged.language as string | null) ?? null,
      card_type: isMergedGraded ? "graded" : "raw",
      grading_company: (merged.grading_company as string | null) ?? null,
      grade: (merged.grade as string | null) ?? null,
      cert_number: isMergedGraded
        ? normalizeCertNumber(merged.cert_number)
        : null,
      price_cad: (merged.price_cad as number | string | null) ?? null,
    });
  }

  if (updates.card_type === "raw") {
    updates.grading_company = null;
    updates.grade = null;
    updates.cert_number = null;
  } else if ("cert_number" in updates) {
    updates.cert_number = normalizeCertNumber(updates.cert_number);
  }

  const { data, error } = await supabase
    .from("listings")
    .update(updates)
    .eq("id", req.params.id)
    .eq("user_id", authReq.userId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update listing:", error);
    res.status(500).json({ error: "Failed to update listing", code: "DB_ERROR" });
    return;
  }

  res.json(data);
});

// ── Delete listing ─────────────────────────────────────

router.delete("/listings/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data: existing } = await supabase
    .from("listings")
    .select("status")
    .eq("id", req.params.id)
    .eq("user_id", authReq.userId)
    .single();

  if (!existing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (existing.status === "published") {
    res.status(400).json({ error: "Cannot delete published listings", code: "INVALID_STATUS" });
    return;
  }

  await supabase.from("listings").delete().eq("id", req.params.id);
  res.json({ message: "Listing deleted" });
});

// ── Regenerate title/description ───────────────────────

router.post("/listings/:id/generate", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", authReq.userId)
    .single();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const title = generateTitle({
    card_name: listing.card_name as string,
    card_number: listing.card_number as string | null,
    set_name: listing.set_name as string | null,
    rarity: listing.rarity as string | null,
    condition: listing.card_type === "graded" ? null : (listing.condition as string | null),
    language: listing.language as string | null,
    card_type: listing.card_type === "graded" ? "graded" : "raw",
    grading_company: listing.grading_company as string | null,
    grade: listing.grade as string | null,
    cert_number: listing.cert_number as string | null,
  });

  const description = await buildListingDescription(authReq.userId, {
    title,
    card_name: listing.card_name as string,
    set_name: listing.set_name as string | null,
    card_number: listing.card_number as string | null,
    rarity: listing.rarity as string | null,
    condition: listing.condition as string | null,
    language: listing.language as string | null,
    card_type: listing.card_type === "graded" ? "graded" : "raw",
    grading_company: listing.grading_company as string | null,
    grade: listing.grade as string | null,
    cert_number: listing.cert_number as string | null,
    price_cad: listing.price_cad as number | null,
  });

  const { data, error } = await supabase
    .from("listings")
    .update({ title, description })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to regenerate", code: "DB_ERROR" });
    return;
  }

  res.json(data);
});

function normalizeCertNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value)
    .replace(/\b(?:cert(?:ification)?|serial|no\.?|number|#)\b/gi, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim();
  return normalized || null;
}

// ── Upload photo for a listing ─────────────────────────

router.post(
  "/listings/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const file = req.file;
    const position = req.body.position as string | undefined;

    if (!file) {
      res.status(400).json({ error: "No photo uploaded" });
      return;
    }

    // Verify the listing belongs to this user
    const { data: listing } = await supabase
      .from("listings")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_id", authReq.userId)
      .single();

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    try {
      const { url } = await uploadPhoto(file.buffer, `listings/${req.params.id}`);

      const { data: photo, error } = await supabase
        .from("photos")
        .insert({
          listing_id: req.params.id,
          file_url: url,
          position: Number(position ?? 1),
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: "Failed to save photo record", code: "DB_ERROR" });
        return;
      }

      res.status(201).json(photo);
    } catch (err) {
      console.error("Photo upload failed:", err);
      res.status(500).json({ error: "Photo upload failed", code: "UPLOAD_ERROR" });
    }
  }
);

// ── Get photos for a listing ───────────────────────────

router.get("/listings/:id/photos", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Verify the listing belongs to this user
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", req.params.id)
    .eq("user_id", authReq.userId)
    .single();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const { data: photos, error } = await supabase
    .from("photos")
    .select("*")
    .eq("listing_id", req.params.id)
    .order("position", { ascending: true });

  if (error) {
    res.status(500).json({ error: "Failed to fetch photos", code: "DB_ERROR" });
    return;
  }

  res.json(photos ?? []);
});

// ── Bulk publish ready listings ───────────────────────

router.post("/listings/bulk-publish", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as {
    listing_ids?: unknown;
    mode?: PublishMode;
    scheduled_at?: string | null;
  };

  const listingIds = Array.isArray(body.listing_ids)
    ? body.listing_ids.filter((id): id is string => typeof id === "string")
    : [];
  const mode: PublishMode = body.mode === "scheduled" ? "scheduled" : "now";

  if (listingIds.length === 0) {
    res.status(400).json({ error: "listing_ids must include at least one listing." });
    return;
  }

  if (listingIds.length > 50) {
    res.status(400).json({ error: "Bulk publish is limited to 50 listings at a time." });
    return;
  }

  if (mode === "scheduled") {
    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      res.status(400).json({
        error: "Choose a valid future publish date/time before scheduling.",
        code: "PUBLISH_ERROR",
      });
      return;
    }
  }

  const results = [];
  for (const listingId of Array.from(new Set(listingIds))) {
    try {
      const readiness = await getPublishReadiness(listingId, authReq.userId);
      if (!readiness.ready) {
        results.push({
          listing_id: listingId,
          status: "blocked",
          error: readiness.missing.map((entry) => entry.message).join(" "),
        });
        continue;
      }

      const result = await requestPublish(listingId, authReq.userId, authReq.userEmail, {
        mode,
        scheduled_at: body.scheduled_at,
      });

      results.push({
        listing_id: listingId,
        status: result.ok ? result.status ?? "publishing" : "error",
        ebay_item_id: result.ebay_item_id,
        scheduled_at: result.scheduled_at,
        error: result.error ?? null,
      });
    } catch (error) {
      results.push({
        listing_id: listingId,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to publish listing.",
      });
    }
  }

  res.json({ results });
});

// ── Publish listing to eBay ────────────────────────────

router.post("/listings/:id/publish", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const listingId = req.params.id as string;
  const body = req.body as {
    mode?: PublishMode;
    scheduled_at?: string | null;
  };
  const mode: PublishMode = body.mode === "scheduled" ? "scheduled" : "now";

  // ── Mock mode ────────────────────────────────────────
  if (isMockMode()) {
    // Validate ownership + status
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .eq("user_id", authReq.userId)
      .single();

    if (listingErr || !listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const row = listing as Record<string, unknown>;

    if (row.status !== "draft" && row.status !== "error") {
      res.status(400).json({ error: `Listing must be in draft or error status to publish (current: ${String(row.status)})` });
      return;
    }

    if (!row.price_cad || Number(row.price_cad) <= 0) {
      res.status(400).json({ error: "Price must be set before publishing" });
      return;
    }

    if (!row.title) {
      res.status(400).json({ error: "Listing title is missing" });
      return;
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (mode === "scheduled") {
      const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null;
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        res.status(400).json({ error: "Choose a valid publish date/time before scheduling.", code: "PUBLISH_ERROR" });
        return;
      }

      if (scheduledAt.getTime() <= Date.now()) {
        res.status(400).json({ error: "Scheduled publish time must be in the future.", code: "PUBLISH_ERROR" });
        return;
      }

      const scheduledAtIso = scheduledAt.toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from("listings")
        .update({
          status: "scheduled",
          scheduled_at: scheduledAtIso,
          publish_attempted_at: new Date().toISOString(),
          publish_started_at: null,
          ebay_error: null,
        })
        .eq("id", listingId)
        .select()
        .single();

      if (updateErr) {
        res.status(500).json({ error: "Failed to schedule listing", code: "DB_ERROR" });
        return;
      }

      res.json({
        message: "Listing scheduled for publish (mock)",
        status: "scheduled",
        scheduled_at: scheduledAtIso,
        mock: true,
        listing: updated,
      });
      return;
    }

    const mockItemId = Date.now();

    const { data: updated, error: updateErr } = await supabase
      .from("listings")
      .update({
        status: "published",
        ebay_item_id: mockItemId,
        published_at: new Date().toISOString(),
        scheduled_at: null,
        publish_attempted_at: new Date().toISOString(),
        publish_started_at: new Date().toISOString(),
        ebay_error: null,
      })
      .eq("id", listingId)
      .select()
      .single();

    if (updateErr) {
      res.status(500).json({ error: "Failed to update listing", code: "DB_ERROR" });
      return;
    }

    res.json({ message: "Listing published (mock)", status: "published", mock: true, listing: updated });
    return;
  }

  // ── Real eBay publish ─────────────────────────────────
  const result = await requestPublish(listingId, authReq.userId, authReq.userEmail, {
    mode,
    scheduled_at: body.scheduled_at,
  });

  if (!result.ok) {
    let readiness = null;
    try {
      readiness = await getPublishReadiness(listingId, authReq.userId);
    } catch {
      readiness = null;
    }

    res.status(400).json({
      error: result.error ?? "Failed to schedule publish",
      code: "PUBLISH_ERROR",
      readiness,
    });
    return;
  }

  if (result.status === "scheduled") {
    res.json({
      status: "scheduled",
      scheduled_at: result.scheduled_at,
    });
    return;
  }

  res.json({
    status: result.status ?? "publishing",
    ebay_item_id: result.ebay_item_id,
    error: result.error,
  });
});

export default router;
