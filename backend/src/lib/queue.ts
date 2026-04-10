import Bull from "bull";

// ---------------------------------------------------------------------------
// Bull queue for async listing publish jobs
//
// Requires Redis. Connects to REDIS_URL env var or localhost default.
// Install: npm install bull @types/bull
// ---------------------------------------------------------------------------

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const publishQueue = new Bull<{ listingId: string }>(
  "publish-listing",
  redisUrl,
);
