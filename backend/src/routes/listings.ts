import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { generateTitle } from "../services/titleGenerator.js";
import { generateDescription } from "../services/descriptionGenerator.js";
import { schedulePublish } from "../services/ebay/publish.js";
import { PLAN_LIMITS, type PlanName } from "../lib/plans.js";

const router = Router();

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
    identified_by?: string;
    listing_type?: string;
    duration?: number;
    price_cad?: number;
  };

  if (!body.card_name) {
    res.status(400).json({ error: "card_name is required" });
    return;
  }

  if (!body.condition) {
    res.status(400).json({ error: "condition is required" });
    return;
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
  });

  const description = generateDescription({
    card_name: body.card_name,
    set_name: body.set_name ?? null,
    card_number: body.card_number ?? null,
    rarity: body.rarity ?? null,
    condition: body.condition ?? null,
    language: body.language ?? null,
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
      identified_by: body.identified_by ?? "manual",
      listing_type: body.listing_type ?? "auction",
      duration: body.duration ?? 7,
      price_cad: body.price_cad ?? null,
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

  // Only allow updating drafts
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

  if (existing.status !== "draft") {
    res.status(400).json({ error: "Can only edit draft listings", code: "INVALID_STATUS" });
    return;
  }

  // If card details changed, regenerate title/description
  const cardFields = ["card_name", "set_name", "card_number", "rarity", "condition", "language"];
  const hasCardChanges = cardFields.some((f) => f in body);

  const updates: Record<string, unknown> = { ...body };

  if (hasCardChanges && typeof body.card_name === "string") {
    updates.title = generateTitle({
      card_name: body.card_name as string,
      card_number: (body.card_number as string) ?? null,
      set_name: (body.set_name as string) ?? null,
      rarity: (body.rarity as string) ?? null,
      condition: (body.condition as string) ?? null,
      language: (body.language as string) ?? null,
    });

    updates.description = generateDescription({
      card_name: body.card_name as string,
      set_name: (body.set_name as string) ?? null,
      card_number: (body.card_number as string) ?? null,
      rarity: (body.rarity as string) ?? null,
      condition: (body.condition as string) ?? null,
      language: (body.language as string) ?? null,
    });
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
    condition: listing.condition as string | null,
    language: listing.language as string | null,
  });

  const description = generateDescription({
    card_name: listing.card_name as string,
    set_name: listing.set_name as string | null,
    card_number: listing.card_number as string | null,
    rarity: listing.rarity as string | null,
    condition: listing.condition as string | null,
    language: listing.language as string | null,
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

// ── Publish listing to eBay ────────────────────────────

router.post("/listings/:id/publish", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Check if eBay integration is configured
  if (!process.env.EBAY_APP_ID) {
    res.status(503).json({ error: "eBay integration not configured", code: "EBAY_NOT_CONFIGURED" });
    return;
  }

  const listingId = req.params.id as string;

  const result = await schedulePublish(listingId, authReq.userId);

  if (!result.scheduled) {
    res.status(400).json({ error: result.error ?? "Failed to schedule publish", code: "PUBLISH_ERROR" });
    return;
  }

  res.json({ message: "Listing scheduled for publish", status: "scheduled" });
});

export default router;
