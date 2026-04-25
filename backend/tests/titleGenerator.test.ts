import { describe, expect, it } from "vitest";
import { generateTitle } from "../src/services/titleGenerator.js";

describe("generateTitle", () => {
  it("uses year, Pokemon, set, card, number, rarity, and raw condition", () => {
    expect(
      generateTitle({
        card_name: "Fan Rotom",
        set_name: "Prismatic Evolutions",
        card_number: "085/131",
        rarity: "Holo Rare",
        condition: "NM",
        language: "English",
        card_type: "raw",
      }),
    ).toBe("2025 Pokemon Prismatic Evolutions Fan Rotom #085/131 Holo Rare - NM");
  });

  it("adds non-English language near the front for search visibility", () => {
    expect(
      generateTitle({
        card_name: "Pikachu",
        set_name: "S-P Promo",
        card_number: "208/S-P",
        rarity: "Promo Holo",
        condition: null,
        language: "Japanese",
        card_type: "graded",
        grading_company: "PSA",
        grade: "9",
      }),
    ).toBe("Pokemon Japanese S-P Promo Pikachu #208/S-P Promo Holo - PSA 9 MINT");
  });

  it("keeps titles within eBay's 80 character limit", () => {
    const title = generateTitle({
      card_name: "Charizard ex Special Illustration Rare Alternate Art",
      set_name: "Obsidian Flames",
      card_number: "223/197",
      rarity: "Special Illustration Rare",
      condition: "NM",
      language: "English",
      card_type: "raw",
    });

    expect(title.length).toBeLessThanOrEqual(80);
  });

  it("infers 2025 for Destined Rivals cards", () => {
    expect(
      generateTitle({
        card_name: "Team Rocket's Meowth",
        set_name: "Destined Rivals",
        card_number: "149/182",
        rarity: "Common",
        condition: "NM",
        language: "English",
        card_type: "raw",
      }),
    ).toBe("2025 Pokemon Destined Rivals Team Rocket's Meowth #149/182 Common - NM");
  });
});
