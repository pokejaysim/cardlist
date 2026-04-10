import Anthropic from "@anthropic-ai/sdk";

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

export async function identifyCard(
  imageUrl: string
): Promise<CardIdentificationResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    tools: [IDENTIFY_CARD_TOOL],
    tool_choice: { type: "tool", name: "identify_card" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: imageUrl },
          },
          {
            type: "text",
            text: `Identify this trading card. Look at the card name, set/expansion, collector number, rarity symbol, language, and estimate the physical condition based on visible wear on edges, corners, and surface.

If you can read the card details clearly, report them exactly as printed. If anything is unclear, make your best estimate and lower the confidence score.

This could be a Pokemon card, Yu-Gi-Oh card, Magic: The Gathering card, sports card (baseball, basketball, football, hockey), or any other collectible trading card. Identify the type and report accordingly.`,
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

  return toolBlock.input as CardIdentificationResult;
}
