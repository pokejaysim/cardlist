export interface DescriptionPreviewInput {
  title?: string | null;
  card_name: string;
  set_name?: string | null;
  card_number?: string | null;
  rarity?: string | null;
  language?: string | null;
  condition?: string | null;
  card_type?: "raw" | "graded" | string | null;
  grading_company?: string | null;
  grade?: string | null;
  year?: string | number | null;
  price_cad?: number | string | null;
  seller_logo_url?: string | null;
  seller_location?: string | null;
  shipping_summary?: string | null;
  returns_summary?: string | null;
}

export const DESCRIPTION_TEMPLATE_PLACEHOLDERS = [
  "title",
  "card_name",
  "set_name",
  "card_number",
  "rarity",
  "language",
  "condition",
  "condition_description",
  "card_type",
  "grading_company",
  "grade",
  "year",
  "price_cad",
  "seller_logo_url",
  "seller_location",
  "shipping_summary",
  "returns_summary",
] as const;

const SET_YEAR_HINTS: Array<{ pattern: RegExp; year: string }> = [
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

export function renderDescriptionTemplatePreview(
  templateHtml: string,
  input: DescriptionPreviewInput,
): string {
  const safeTemplate = sanitizeDescriptionPreviewHtml(templateHtml);
  const values = buildPlaceholderValues(input);
  const rendered = safeTemplate.replace(
    /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
    (_match, key: string) => escapeHtml(values[key] ?? ""),
  );
  return sanitizeDescriptionPreviewHtml(rendered).trim();
}

export function fallbackDescriptionPreview(input: DescriptionPreviewInput): string {
  const isGraded = input.card_type === "graded";
  const conditionText = isGraded
    ? [input.grading_company, input.grade].filter(Boolean).join(" ")
    : getConditionDescription(input.condition ?? null);

  return `
<div style="font-family: Arial, sans-serif; padding: 16px;">
  <h2>${escapeHtml(input.card_name || "Pokemon Card")}</h2>
  <p><strong>Set:</strong> ${escapeHtml(input.set_name || "Set name")}</p>
  <p><strong>Card Number:</strong> ${escapeHtml(input.card_number || "Card number")}</p>
  <p><strong>Condition:</strong> ${escapeHtml(conditionText)}</p>
  <p>Please review all photos carefully before purchasing.</p>
</div>`.trim();
}

export function sanitizeDescriptionPreviewHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:object|embed|svg|math|noscript)\b[^>]*>/gi, "")
    .replace(/<\/?(?:base|button|input|link|meta|option|select|textarea)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z0-9_-]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z0-9_-]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on[a-z0-9_-]+\s*=\s*[^\s>]+/gi, "")
    .replace(
      /\s+(href|src|action|xlink:href)\s*=\s*"[\s]*(?:javascript|vbscript|data):[^"]*"/gi,
      "",
    )
    .replace(
      /\s+(href|src|action|xlink:href)\s*=\s*'[\s]*(?:javascript|vbscript|data):[^']*'/gi,
      "",
    )
    .replace(
      /\s+(href|src|action|xlink:href)\s*=\s*(?:javascript|vbscript|data):[^\s>]+/gi,
      "",
    )
    .replace(
      /\s+style\s*=\s*"[^"]*(?:expression\s*\(|javascript:|vbscript:)[^"]*"/gi,
      "",
    )
    .replace(
      /\s+style\s*=\s*'[^']*(?:expression\s*\(|javascript:|vbscript:)[^']*'/gi,
      "",
    );
}

function buildPlaceholderValues(
  input: DescriptionPreviewInput,
): Record<string, string> {
  const isGraded = input.card_type === "graded";
  const condition = normalizeText(input.condition);
  const gradingCompany = normalizeText(input.grading_company);
  const grade = normalizeText(input.grade);

  return {
    title: normalizeText(input.title),
    card_name: normalizeText(input.card_name),
    set_name: normalizeText(input.set_name),
    card_number: normalizeText(input.card_number),
    rarity: normalizeText(input.rarity),
    language: normalizeText(input.language),
    condition: isGraded
      ? [gradingCompany, grade].filter(Boolean).join(" ")
      : condition,
    condition_description: isGraded
      ? [gradingCompany, grade].filter(Boolean).join(" ")
      : getConditionDescription(condition || null),
    card_type: isGraded ? "Graded" : "Raw",
    grading_company: gradingCompany,
    grade,
    year: normalizeText(input.year) || inferYear(input),
    price_cad: formatPriceCad(input.price_cad),
    seller_logo_url: normalizeText(input.seller_logo_url),
    seller_location: normalizeText(input.seller_location),
    shipping_summary: normalizeText(input.shipping_summary),
    returns_summary: normalizeText(input.returns_summary),
  };
}

function getConditionDescription(condition: string | null): string {
  const descriptions: Record<string, string> = {
    NM: "Near Mint - Minimal to no wear. Card is in excellent condition.",
    LP: "Light Play - Minor edge or corner wear. No major creases.",
    MP: "Moderate Play - Noticeable wear on edges and corners. May have light scratches.",
    HP: "Heavy Play - Significant wear. May have creases, bends, or surface damage.",
    DMG: "Damaged - Major damage such as tears, heavy creases, or water damage.",
  };
  return condition ? descriptions[condition] ?? condition : "See photos for condition";
}

function inferYear(input: DescriptionPreviewInput): string {
  const titleYear = normalizeText(input.title).match(/\b(19|20)\d{2}\b/)?.[0];
  if (titleYear) return titleYear;

  const setName = normalizeText(input.set_name);
  for (const hint of SET_YEAR_HINTS) {
    if (hint.pattern.test(setName)) return hint.year;
  }
  return "";
}

function formatPriceCad(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `$${numeric.toFixed(2)} CAD`;
}

function normalizeText(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
