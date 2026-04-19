import "dotenv/config";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import listingsRouter from "./routes/listings.js";
import photosRouter from "./routes/photos.js";
import cardsRouter from "./routes/cards.js";
import cardSearchRouter from "./routes/cardSearch.js";
import pricingRouter from "./routes/pricing.js";
import accountRouter from "./routes/account.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { publishQueue } from "./lib/queue.js";
import { processPublishJob } from "./jobs/publishListing.js";
import { sendListingPublishedEmail, sendListingErrorEmail } from "./services/email.js";

const app = express();
const port = process.env.PORT ?? 3001;

// Startup diagnostic — verify critical env vars are loaded by the running process.
// Logs length only, not the values themselves.
const envReport = (name: string): string => {
  const value = process.env[name];
  return value ? `present (length=${String(value.length)})` : "MISSING";
};
console.log(`[Startup] ANTHROPIC_API_KEY: ${envReport("ANTHROPIC_API_KEY")}`);
console.log(`[Startup] CLOUDINARY_CLOUD_NAME: ${envReport("CLOUDINARY_CLOUD_NAME")}`);
console.log(`[Startup] CLOUDINARY_API_KEY: ${envReport("CLOUDINARY_API_KEY")}`);
console.log(`[Startup] CLOUDINARY_API_SECRET: ${envReport("CLOUDINARY_API_SECRET")}`);
console.log(`[Startup] PRICECHARTING_API_KEY: ${envReport("PRICECHARTING_API_KEY")}`);
console.log(`[Startup] EBAY_APP_ID: ${envReport("EBAY_APP_ID")}`);
console.log(
  `[Startup] USD_TO_CAD_RATE: ${process.env.USD_TO_CAD_RATE ?? "(unset, default 1.37)"}`,
);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
].filter(Boolean) as string[];

app.use(cors({ origin: allowedOrigins }));
// 25mb limit — enough for a 10-15mb photo as base64 data URL
app.use(express.json({ limit: "25mb" }));

// Routes
app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", listingsRouter);
app.use("/api", photosRouter);
app.use("/api", cardsRouter);
app.use("/api", cardSearchRouter);
app.use("/api", pricingRouter);
app.use("/api", accountRouter);

// Error handling
app.use(errorHandler);

// ── Register Bull queue processor ─────────────────────────
if (publishQueue) {
  publishQueue.process(async (job) => {
    console.log(`[Queue] Processing publish job for listing ${job.data.listingId}`);
    await processPublishJob(job.data);
  });

  publishQueue.on("completed", async (job) => {
    console.log(`[Queue] Listing ${job.data.listingId} published successfully`);

    // Send success email
    try {
      const { data: listing } = await import("./lib/supabase.js").then((m) =>
        m.supabase
          .from("listings")
          .select("card_name, ebay_item_id, user_id")
          .eq("id", job.data.listingId)
          .single(),
      );
      if (listing) {
        const { data: user } = await import("./lib/supabase.js").then((m) =>
          m.supabase.from("users").select("email").eq("id", listing.user_id).single(),
        );
        if (user?.email) {
          await sendListingPublishedEmail(
            user.email,
            listing.card_name as string,
            String(listing.ebay_item_id),
          );
        }
      }
    } catch (err) {
      console.error("[Queue] Failed to send publish success email:", err);
    }
  });

  publishQueue.on("failed", async (job, err) => {
    console.error(`[Queue] Listing ${job.data.listingId} publish failed:`, err.message);

    // Send failure email
    try {
      const { data: listing } = await import("./lib/supabase.js").then((m) =>
        m.supabase
          .from("listings")
          .select("card_name, user_id")
          .eq("id", job.data.listingId)
          .single(),
      );
      if (listing) {
        const { data: user } = await import("./lib/supabase.js").then((m) =>
          m.supabase.from("users").select("email").eq("id", listing.user_id).single(),
        );
        if (user?.email) {
          await sendListingErrorEmail(user.email, listing.card_name as string, err.message);
        }
      }
    } catch (emailErr) {
      console.error("[Queue] Failed to send publish error email:", emailErr);
    }
  });
} else {
  console.log("[Queue] No REDIS_URL — publish jobs will run synchronously");
}

app.listen(port, () => {
  console.log(`SnapCard API running on port ${port}`);
});

export default app;
