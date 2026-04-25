import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { PLAN_LIMITS, type PlanName } from "../lib/plans.js";
import {
  getEbayPublishSettingsState,
  saveEbayPublishSettings,
} from "../services/ebay/sellerSettings.js";
import {
  getListingPreferences,
  saveListingPreferences,
} from "../services/listingPreferences.js";
import { uploadSellerLogo } from "../services/storage.js";

const router = Router();
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Get user profile ───────────────────────────────────

router.get("/account", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authReq.userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(data);
});

// ── Update user profile ────────────────────────────────

router.put("/account", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { name } = req.body as { name?: string };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", authReq.userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to update profile", code: "DB_ERROR" });
    return;
  }

  res.json(data);
});

// ── Get usage stats ────────────────────────────────────

router.get("/account/usage", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Count listings created this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: monthlyListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId)
    .gte("created_at", startOfMonth.toISOString());

  const { count: totalListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId);

  const { count: publishedListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId)
    .eq("status", "published");

  // Fetch user plan
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", authReq.userId)
    .single();

  const plan = (user?.plan ?? "free") as PlanName;
  const planLimits = PLAN_LIMITS[plan];

  res.json({
    plan,
    listings_this_month: monthlyListings ?? 0,
    listings_limit: planLimits.monthly_listings === Infinity ? null : planLimits.monthly_listings,
    total_listings: totalListings ?? 0,
    published_listings: publishedListings ?? 0,
    ai_identify: planLimits.ai_identify,
    pricing_suggestions: planLimits.pricing_suggestions,
  });
});

// ── Complete onboarding ───────────────────────────────

router.patch("/account/onboarding", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { onboarding_complete } = req.body as { onboarding_complete?: boolean };

  if (typeof onboarding_complete !== "boolean") {
    res.status(400).json({ error: "onboarding_complete must be a boolean" });
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .update({ onboarding_complete })
    .eq("id", authReq.userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to update onboarding status", code: "DB_ERROR" });
    return;
  }

  res.json(data);
});

// ── Seller listing preferences ────────────────────────

router.get("/account/listing-preferences", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const preferences = await getListingPreferences(authReq.userId);
    res.json(preferences);
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to load listing preferences",
      code: "LISTING_PREFERENCES_ERROR",
    });
  }
});

router.put("/account/listing-preferences", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const preferences = await saveListingPreferences(authReq.userId, req.body);
    res.json(preferences);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to save listing preferences",
      code: "LISTING_PREFERENCES_SAVE_ERROR",
    });
  }
});

router.post(
  "/account/listing-preferences/logo",
  requireAuth,
  uploadLogo.single("logo"),
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No logo uploaded" });
      return;
    }

    if (!file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Logo must be an image file" });
      return;
    }

    try {
      const { url } = await uploadSellerLogo(file.buffer, authReq.userId);
      const preferences = await saveListingPreferences(authReq.userId, {
        seller_logo_url: url,
      });
      res.status(201).json(preferences);
    } catch (error) {
      console.error("Seller logo upload failed:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Seller logo upload failed",
        code: "LOGO_UPLOAD_ERROR",
      });
    }
  },
);

// ── Check eBay account link status ─────────────────────

router.get("/account/ebay-status", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data } = await supabase
    .from("ebay_accounts")
    .select("ebay_user_id, site_id, created_at, refreshed_at")
    .eq("user_id", authReq.userId)
    .single();

  if (!data) {
    res.json({ linked: false });
    return;
  }

  res.json({
    linked: true,
    ebay_user_id: data.ebay_user_id,
    site_id: data.site_id,
    linked_at: data.created_at,
    refreshed_at: data.refreshed_at,
  });
});

// ── Get eBay publish settings ─────────────────────────

router.get("/account/ebay-publish-settings", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const marketplaceId = req.query.marketplace_id as string | undefined;

  try {
    const settings = await getEbayPublishSettingsState(authReq.userId, marketplaceId);
    res.json(settings);
  } catch (error) {
    console.error("Failed to load eBay publish settings:", error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to load eBay publish settings",
      code: "EBAY_SETTINGS_ERROR",
    });
  }
});

// ── Save eBay publish settings ────────────────────────

router.put("/account/ebay-publish-settings", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const {
    location,
    postal_code,
    fulfillment_policy_id,
    payment_policy_id,
    return_policy_id,
    shipping_service,
    shipping_cost,
    handling_time_days,
    returns_accepted,
    return_period_days,
    return_shipping_cost_payer,
    marketplace_id,
  } = req.body as {
    location?: string | null;
    postal_code?: string | null;
    fulfillment_policy_id?: string | null;
    payment_policy_id?: string | null;
    return_policy_id?: string | null;
    shipping_service?: string | null;
    shipping_cost?: number | null;
    handling_time_days?: number | null;
    returns_accepted?: boolean | null;
    return_period_days?: number | null;
    return_shipping_cost_payer?: "Buyer" | "Seller" | null;
    marketplace_id?: string | null;
  };

  try {
    const settings = await saveEbayPublishSettings(authReq.userId, {
      location,
      postal_code,
      fulfillment_policy_id,
      payment_policy_id,
      return_policy_id,
      shipping_service,
      shipping_cost,
      handling_time_days,
      returns_accepted,
      return_period_days,
      return_shipping_cost_payer,
      marketplace_id,
    });
    res.json(settings);
  } catch (error) {
    console.error("Failed to save eBay publish settings:", error);
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to save eBay publish settings",
      code: "EBAY_SETTINGS_SAVE_ERROR",
    });
  }
});

// ── Marketplace Account Deletion Notification ─────────
// Required by eBay for production keyset approval.
// eBay calls this webhook when a user requests account deletion.

router.post("/marketplace-account-deletion", async (req, res) => {
  const notification = req.body as {
    metadata?: { topic?: string };
    notification?: { data?: { username?: string; userId?: string; eiasToken?: string } };
  };

  const ebayUserId = notification?.notification?.data?.username
    || notification?.notification?.data?.userId;

  if (ebayUserId) {
    const { error } = await supabase
      .from("ebay_accounts")
      .delete()
      .eq("ebay_user_id", ebayUserId);

    if (error) {
      console.error("[eBay] Failed to delete account for user:", ebayUserId, error);
    } else {
      console.log("[eBay] Deleted account data for user:", ebayUserId);
    }
  }

  // Always respond 200 to acknowledge receipt
  res.status(200).json({ status: "ok" });
});

// ── Disconnect eBay account ───────────────────────────

router.delete("/account/ebay", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Check for any listings currently scheduled
  const { count: scheduledCount } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId)
    .eq("status", "scheduled");

  if (scheduledCount && scheduledCount > 0) {
    res.status(400).json({
      error: `You have ${scheduledCount} listing(s) scheduled to publish. Wait for them to complete or cancel them before disconnecting eBay.`,
    });
    return;
  }

  const { error } = await supabase
    .from("ebay_accounts")
    .delete()
    .eq("user_id", authReq.userId);

  if (error) {
    res.status(500).json({ error: "Failed to disconnect eBay account", code: "DB_ERROR" });
    return;
  }

  res.json({ unlinked: true });
});

export default router;
