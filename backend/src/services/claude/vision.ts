import Anthropic from "@anthropic-ai/sdk";
import { verifyPokemonCard } from "../cardVerifier.js";

const anthropic = new Anthropic();

export interface CardIdentificationResult {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: string;
  card_game: string;
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
          "The full name of the card (e.g., 'Charizard', 'Dark Magician', 'Mike Trout').",
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

export async function identifyCard(
  imageUrl: string
): Promise<CardIdentificationResult> {
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
