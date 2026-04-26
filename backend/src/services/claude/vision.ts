import Anthropic from "@anthropic-ai/sdk";
import { verifyPokemonCard } from "../cardVerifier.js";
import {
  computeDHash,
  findNearestCard,
  PHASH_MATCH_THRESHOLD,
} from "../hashMatching.js";

const anthropic = new Anthropic();

export interface CardIdentificationResult {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: string;
  card_game: string;
  card_type: "raw" | "graded";
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  confidence: number;
}

const IDENTIFY_CARD_TOOL: Anthropic.Tool = {
  name: "identify_card",
  description:
    "Report the identified trading card details from the provided photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      card_name: {
        type: "string",
        description:
          "The full name of the card (e.g., 'Charizard', 'Dark Magician', 'Mike Trout'). For cards printed in non-English languages, format as 'NativeName (EnglishName)' — e.g. 'ニョロモ (Poliwag)', 'リザードン (Charizard)'. The English name in parentheses is important for database lookup.",
      },
      set_name: {
        type: "string",
        description:
          "The set or expansion the card belongs to (e.g., 'Base Set', 'Legend of Blue Eyes', '2011 Topps Update').",
      },
      card_number: {
        type: "string",
        description:
          "The collector number printed on the card (e.g., '4/102', 'LOB-001', 'US175').",
      },
      rarity: {
        type: "string",
        description:
          "The rarity of the card (e.g., 'Holo Rare', 'Ultra Rare', 'Common', 'Rookie Card').",
      },
      language: {
        type: "string",
        description: "The language printed on the card (e.g., 'English', 'Japanese', 'French').",
      },
      condition: {
        type: "string",
        enum: ["NM", "LP", "MP", "HP", "DMG"],
        description:
          "Estimated condition: NM (Near Mint), LP (Light Play), MP (Moderate Play), HP (Heavy Play), DMG (Damaged). Base this on visible wear, edges, corners, and surface.",
      },
      card_game: {
        type: "string",
        enum: ["pokemon", "yugioh", "mtg", "sports", "other"],
        description:
          "The type of trading card game: pokemon (Pokemon TCG), yugioh (Yu-Gi-Oh!), mtg (Magic: The Gathering), sports (baseball, basketball, football, hockey), or other.",
      },
      card_type: {
        type: "string",
        enum: ["raw", "graded"],
        description:
          "Use graded if the card is inside a grading slab/case with a visible grade label. Otherwise use raw.",
      },
      grading_company: {
        type: "string",
        description:
          "For graded cards, report PSA, BGS, CGC, SGC, or other. For raw cards, return an empty string.",
      },
      grade: {
        type: "string",
        description:
          "For graded cards, report the grade exactly as shown on the slab label (for example 10 or 9.5). For raw cards, return an empty string.",
      },
      cert_number: {
        type: "string",
        description:
          "For graded cards, report the certification or serial number printed on the slab label if visible. Keep only the number/letters shown, without spaces or labels like Cert #. For raw cards or unreadable labels, return an empty string.",
      },
      confidence: {
        type: "number",
        description:
          "Your confidence in the identification from 0.0 to 1.0. Use 0.9+ if you can clearly read the card name and number. Use lower values if the image is blurry or partially obscured.",
      },
    },
    required: [
      "card_name",
      "set_name",
      "card_number",
      "rarity",
      "language",
      "condition",
      "card_game",
      "card_type",
      "grading_company",
      "grade",
      "cert_number",
      "confidence",
    ],
  },
};

type ImageSource = Anthropic.ImageBlockParam["source"];

/**
 * Build the appropriate Anthropic image source.
 * Data URLs (`data:image/jpeg;base64,...`) must be sent as base64 — passing
 * them as `type:"url"` makes Anthropic try to HTTP-fetch the data URL and fail
 * with "Unable to download the file."
 */
function imageSourceFor(imageUrl: string): ImageSource {
  if (imageUrl.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
    if (!match?.[1] || !match[2]) {
      throw new Error("Invalid data URL — expected base64-encoded image");
    }
    return {
      type: "base64",
      media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: match[2],
    };
  }
  return { type: "url", url: imageUrl };
}

/**
 * Fetch an image URL or parse a data URL into a raw Buffer.
 * Returns null if the URL can't be loaded.
 */
async function loadImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    if (imageUrl.startsWith("data:")) {
      const match = /^data:[^;]+;base64,(.+)$/.exec(imageUrl);
      if (!match?.[1]) return null;
      return Buffer.from(match[1], "base64");
    }
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Try to identify a card purely from its image fingerprint (pHash) against the
 * pre-built card_hashes index. Returns a CardIdentificationResult populated
 * from the Pokemon TCG database, or null if no confident match is found.
 *
 * When this succeeds, we skip the Opus call entirely — cutting per-card
 * identification cost from ~$0.15 to ~$0 and latency from ~3s to ~500ms.
 */
async function identifyFromPhash(
  imageUrl: string,
): Promise<CardIdentificationResult | null> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) return null;

  let hash: Buffer;
  try {
    // Center-crop helps strip background clutter from user photos (card on a
    // stand, dark background, etc.) before hashing. Not perfect but gives us
    // a real chance of matching the clean reference image.
    hash = await computeDHash(buffer, true);
  } catch (err) {
    console.warn(
      "[vision] computeDHash failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }

  const match = await findNearestCard(hash, PHASH_MATCH_THRESHOLD);
  if (!match) return null;

  console.log(
    `[vision] pHash match: ${match.card_name} (${match.pokemon_tcg_id}) — distance=${String(match.distance)}`,
  );

  // pHash matches don't tell us condition, so default to NM and let the user
  // adjust in the UI. Language defaults to English since our index is English.
  return {
    card_name: match.card_name,
    set_name: match.set_name ?? "",
    card_number: match.card_number ?? "",
    rarity: match.rarity ?? "",
    language: "English",
    condition: "NM",
    card_game: "pokemon",
    card_type: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    // Confidence scales from 1.0 (perfect match, distance=0) down to ~0.85
    // at the threshold. Still high enough that the UI treats it as confident.
    confidence: Math.max(0.85, 1 - match.distance / 64),
  };
}

/**
 * Feature flag for the pHash fast-path. Disabled by default because the
 * current dHash implementation produces too many false positives on real
 * user photos (cards on stands, glare, backgrounds, perspective) versus the
 * clean top-down reference scans in the pokemontcg.io index. Distance=10
 * threshold was catching semantically-unrelated cards as "confident" matches.
 *
 * Re-enable via env var once we have a more robust matcher — candidates:
 *   - Tighten threshold drastically (distance ≤ 3 or 4) for exact-match only
 *   - DCT-based pHash instead of dHash (better perspective tolerance)
 *   - CLIP-style embeddings from a small vision model
 *
 * The card_hashes table and RPC are still useful for catalog autocomplete /
 * duplicate detection even with the fast-path off, so we keep the scaffolding.
 */
const PHASH_FAST_PATH_ENABLED = process.env.PHASH_FAST_PATH_ENABLED === "true";

export async function identifyCard(
  imageUrl: string
): Promise<CardIdentificationResult> {
  // Fast path: try pHash matching against the pre-built Pokemon TCG card
  // index. If we find a confident match, we can skip the Opus call entirely.
  // If not (e.g. photo too cluttered, card not in index, non-Pokemon card),
  // fall through to the vision model.
  if (PHASH_FAST_PATH_ENABLED) {
    const phashResult = await identifyFromPhash(imageUrl);
    if (phashResult) return phashResult;
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    tools: [IDENTIFY_CARD_TOOL],
    tool_choice: { type: "tool", name: "identify_card" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: imageSourceFor(imageUrl),
          },
          {
            type: "text",
            text: `Identify this trading card.

**Priority order for accuracy** (most important first):
1. **Card name** — exactly as printed.
2. **Card number** — the collector number in the bottom-left or bottom-right (e.g. "041/217", "4/102", "TG05/TG30"). Report it EXACTLY as printed including any set total (e.g. "/217"). This is critical — we use it to verify the set.
3. **Condition** — based on visible wear on edges, corners, and surface.
4. **Set / expansion** — the hardest to identify from a photo. Look at the set symbol (small icon near the card number) and the copyright/era text at the bottom. If you cannot clearly identify the set, make your best guess but lower the overall confidence score accordingly — it is better to be uncertain than to confidently guess wrong.
5. **Rarity, language** — from the card's rarity symbol and printed language.
6. **Raw vs graded** — if the card is in a PSA/BGS/CGC/SGC style slab, report it as graded and include the grader, grade, and visible certification/cert number from the label.

If you can read the card details clearly, report them exactly as printed. If anything is unclear, lower the confidence score.

This could be a Pokemon card, Yu-Gi-Oh card, Magic: The Gathering card, sports card, or another collectible trading card. Identify the type and report accordingly.`,
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolBlock) {
    throw new Error("Claude did not return card identification");
  }

  const result = toolBlock.input as CardIdentificationResult;
  result.card_type = result.card_type === "graded" ? "graded" : "raw";
  result.grading_company =
    result.card_type === "graded" && result.grading_company
      ? result.grading_company
      : null;
  result.grade =
    result.card_type === "graded" && result.grade
      ? result.grade
      : null;
  result.cert_number =
    result.card_type === "graded" && result.cert_number
      ? normalizeCertNumber(result.cert_number)
      : null;

  // Cross-check Pokemon set name against the authoritative Pokemon TCG database.
  // Opus reads card names and numbers accurately but often misidentifies sets
  // (especially promos / pin collections). Looking up name + number in the TCG
  // database gives us the correct set name almost for free.
  if (result.card_game === "pokemon" && result.card_name && result.card_number) {
    const verified = await verifyPokemonCard(result.card_name, result.card_number);
    if (verified) {
      const originalSet = result.set_name;
      result.set_name = verified.set_name;
      // If DB had authoritative rarity and Opus's value is generic/empty, use DB's
      if (verified.rarity && (!result.rarity || result.rarity.toLowerCase() === "common")) {
        result.rarity = verified.rarity;
      }
      // Bump confidence toward the verification's confidence (weighted average)
      result.confidence = Math.min(1, (result.confidence + verified.confidence) / 2);
      if (originalSet !== verified.set_name) {
        console.log(
          `[vision] Set corrected: "${originalSet}" → "${verified.set_name}" (match_count=${String(verified.match_count)})`,
        );
      }
    }
  }

  return result;
}

function normalizeCertNumber(value: string): string | null {
  const normalized = value
    .replace(/\b(?:cert(?:ification)?|serial|no\.?|number|#)\b/gi, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim();
  return normalized || null;
}
