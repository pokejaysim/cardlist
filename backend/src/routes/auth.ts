import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { sendWelcomeEmail } from "../services/email.js";

const router = Router();

// ── Register ───────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body as {
    email?: string;
    password?: string;
    name?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name ?? null },
  });

  if (error) {
    res.status(400).json({ error: error.message, code: "AUTH_ERROR" });
    return;
  }

  // Insert into our users table
  await supabase.from("users").insert({
    id: data.user.id,
    email: data.user.email,
    name: name ?? null,
  });

  // Sign in to get tokens
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    res.status(400).json({ error: signInError.message, code: "AUTH_ERROR" });
    return;
  }

  // Send welcome email (non-blocking)
  sendWelcomeEmail(email, name ?? null).catch((err) =>
    console.error("Failed to send welcome email:", err)
  );

  res.status(201).json({
    user: { id: data.user.id, email, name: name ?? null },
    access_token: session.session?.access_token,
    refresh_token: session.session?.refresh_token,
  });
});

// ── Login ──────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    res.status(401).json({ error: error.message, code: "AUTH_ERROR" });
    return;
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single();

  res.json({
    user,
    access_token: data.session?.access_token,
    refresh_token: data.session?.refresh_token,
  });
});

// ── Logout ─────────────────────────────────────────────

router.post("/auth/logout", requireAuth, async (_req, res) => {
  res.json({ message: "Logged out" });
});

// ── eBay OAuth: Get consent URL ────────────────────────

router.get("/auth/ebay-oauth-url", requireAuth, (_req, res) => {
  const appId = process.env.EBAY_APP_ID;
  const redirectUri = process.env.EBAY_REDIRECT_URI;

  if (!appId || !redirectUri) {
    res.status(500).json({ error: "eBay OAuth not configured", code: "CONFIG_ERROR" });
    return;
  }

  // eBay OAuth2 authorization endpoint (production)
  const ebayAuthUrl = new URL("https://auth.ebay.com/oauth2/authorize");
  ebayAuthUrl.searchParams.set("client_id", appId);
  ebayAuthUrl.searchParams.set("response_type", "code");
  ebayAuthUrl.searchParams.set("redirect_uri", redirectUri);
  ebayAuthUrl.searchParams.set(
    "scope",
    "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment"
  );

  res.json({ url: ebayAuthUrl.toString() });
});

// ── eBay OAuth: Handle callback ────────────────────────

router.post("/auth/ebay-callback", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Authorization code is required" });
    return;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const redirectUri = process.env.EBAY_REDIRECT_URI;

  if (!appId || !certId || !redirectUri) {
    res.status(500).json({ error: "eBay OAuth not configured", code: "CONFIG_ERROR" });
    return;
  }

  // Exchange auth code for user token
  const credentials = Buffer.from(`${appId}:${certId}`).toString("base64");

  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("eBay token exchange failed:", errorBody);
    res.status(400).json({ error: "Failed to exchange eBay authorization code", code: "EBAY_AUTH_ERROR" });
    return;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
  };

  // Get eBay user ID via Trading API GetUser call
  const ebayUserId = await fetchEbayUserId(tokenData.access_token);

  // Compute token expiry time
  const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Upsert eBay account with refresh_token and token_expires_at
  const upsertData: Record<string, unknown> = {
    user_id: authReq.userId,
    ebay_token: tokenData.access_token,
    ebay_user_id: ebayUserId ?? "unknown",
    site_id: Number(process.env.EBAY_SITE_ID ?? 2),
    refreshed_at: new Date().toISOString(),
  };

  if (tokenData.refresh_token) {
    upsertData.refresh_token = tokenData.refresh_token;
    upsertData.token_expires_at = tokenExpiresAt;
  }

  const { error } = await supabase
    .from("ebay_accounts")
    .upsert(upsertData, { onConflict: "user_id" });

  if (error) {
    console.error("Failed to store eBay account:", error);
    res.status(500).json({ error: "Failed to save eBay account", code: "DB_ERROR" });
    return;
  }

  res.json({
    message: "eBay account linked successfully",
    ebay_user_id: ebayUserId,
  });
});

// ── Helper: fetch eBay user ID ─────────────────────────

async function fetchEbayUserId(token: string): Promise<string | null> {
  const siteId = process.env.EBAY_SITE_ID ?? "2";

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
</GetUserRequest>`;

  try {
    const res = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-SITEID": siteId,
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-CALL-NAME": "GetUser",
      },
      body: xml,
    });

    const text = await res.text();
    const match = text.match(/<UserID>([^<]+)<\/UserID>/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export default router;
