import pLimit from "p-limit";
import { identifyCard, type CardIdentificationResult } from "./vision.js";

// ---------------------------------------------------------------------------
// Batch card identification
//
// Runs identifyCard() in parallel with bounded concurrency to stay within
// Anthropic rate limits. Returns results in the same order as the input,
// with per-item success/error status so one failure doesn't kill the batch.
// ---------------------------------------------------------------------------

export interface BatchResult {
  index: number;
  image_url: string;
  status: "ok" | "error";
  result?: CardIdentificationResult;
  error?: string;
}

// Concurrency cap: 5 parallel Anthropic calls at a time. Safe for tier 1,
// fast enough for 5-20 card batches (~3-4 seconds per card serial → ~8-16s total).
const CONCURRENCY = 5;

export async function identifyCardsBatch(
  imageUrls: string[],
): Promise<BatchResult[]> {
  const limit = pLimit(CONCURRENCY);

  const tasks = imageUrls.map((url, index) =>
    limit(async (): Promise<BatchResult> => {
      try {
        const result = await identifyCard(url);
        return { index, image_url: url, status: "ok", result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Batch identification failed for index ${String(index)}:`, message);
        return { index, image_url: url, status: "error", error: message };
      }
    }),
  );

  return Promise.all(tasks);
}
