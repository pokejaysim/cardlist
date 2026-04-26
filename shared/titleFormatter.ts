export interface TitleFormatInput {
  card_name: string;
  card_number?: string | null;
  set_name?: string | null;
  rarity?: string | null;
  condition?: string | null;
  language?: string | null;
  card_type?: "raw" | "graded" | null;
  grading_company?: string | null;
  grade?: string | null;
  cert_number?: string | null;
  year?: string | number | null;
}

const MAX_TITLE_LENGTH = 80;

const SET_YEAR_HINTS: Array<{ pattern: RegExp; year: string }> = [
  { pattern: /destined rivals/i, year: "2025" },
  { pattern: /prismatic evolutions/i, year: "2025" },
  { pattern: /surging sparks/i, year: "2024" },
  { pattern: /stellar crown/i, year: "2024" },
  { pattern: /twilight masquerade/i, year: "2024" },
  { pattern: /temporal forces/i, year: "2024" },
  { pattern: /paldean fates/i, year: "2024" },
  { pattern: /obsidian flames/i, year: "2023" },
  { pattern: /scarlet.*violet|pokemon 151|paldea evolved|paradox rift/i, year: "2023" },
  { pattern: /crown zenith|silver tempest|lost origin|astral radiance|brilliant stars/i, year: "2022" },
  { pattern: /fusion strike|evolving skies|chilling reign|battle styles|shining fates/i, year: "2021" },
  { pattern: /vivid voltage|champion.?s path|darkness ablaze|rebel clash|sword.*shield/i, year: "2020" },
  { pattern: /cosmic eclipse|hidden fates|unified minds|unbroken bonds|team up/i, year: "2019" },
  { pattern: /base set/i, year: "1999" },
];

export function formatEbayTitle(input: TitleFormatInput): string {
  const year = normalizeText(input.year) ?? inferYearFromSet(input.set_name);
  const language = normalizeText(input.language);
  const setName = normalizeText(input.set_name);
  const cardNumber = normalizeText(input.card_number);
  const rarity = normalizeText(input.rarity);
  const conditionOrGrade = formatConditionOrGrade(input);

  const parts = [
    year,
    "Pokemon",
    language && language !== "English" ? language : null,
    setName,
    normalizeText(input.card_name),
    cardNumber ? `#${cardNumber}` : null,
    rarity,
  ].filter((part): part is string => Boolean(part));

  const title = [
    parts.join(" "),
    conditionOrGrade ? `- ${conditionOrGrade}` : null,
  ].filter((part): part is string => Boolean(part)).join(" ");

  return trimTitle(title);
}

function formatConditionOrGrade(input: TitleFormatInput): string | null {
  if (input.card_type === "graded") {
    const gradingCompany = normalizeText(input.grading_company);
    const grade = normalizeText(input.grade);
    return [gradingCompany, grade, grade ? "MINT" : null]
      .filter((part): part is string => Boolean(part))
      .join(" ") || null;
  }

  return normalizeText(input.condition);
}

function inferYearFromSet(setName?: string | null): string | null {
  if (!setName) return null;

  for (const hint of SET_YEAR_HINTS) {
    if (hint.pattern.test(setName)) {
      return hint.year;
    }
  }

  return null;
}

function normalizeText(value?: string | number | null): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function trimTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) {
    return title;
  }

  return title
    .replace(/\s+Holo Rare\b/i, " Holo")
    .replace(/\s+Ultra Rare\b/i, " UR")
    .replace(/\s+Illustration Rare\b/i, " IR")
    .replace(/\s+Special Illustration Rare\b/i, " SIR")
    .replace(/\s+Secret Rare\b/i, " SR")
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}
