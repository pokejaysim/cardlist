import { getConditionDescription } from "./descriptionGenerator.js";

export interface DescriptionTemplateInput {
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
  cert_number?: string | null;
  year?: string | number | null;
  price_cad?: number | string | null;
  seller_logo_url?: string | null;
  seller_location?: string | null;
  shipping_summary?: string | null;
  returns_summary?: string | null;
}

const BLOCKED_PAIRED_TAGS = [
  "script",
  "iframe",
  "form",
  "object",
  "embed",
  "style",
  "svg",
  "math",
  "noscript",
];

const BLOCKED_VOID_TAGS = [
  "base",
  "button",
  "input",
  "link",
  "meta",
  "option",
  "select",
  "textarea",
];

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

export function renderDescriptionTemplate(
  templateHtml: string,
  input: DescriptionTemplateInput,
): string {
  const safeTemplate = sanitizeDescriptionHtml(templateHtml);
  const values = buildPlaceholderValues(input);

  const rendered = safeTemplate.replace(
    /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
    (_match, key: string) => escapeHtml(values[key] ?? ""),
  );

  return sanitizeDescriptionHtml(rendered).trim();
}

export function sanitizeDescriptionHtml(html: string): string {
  let output = html;

  for (const tag of BLOCKED_PAIRED_TAGS) {
    output = output.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      "",
    );
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
    output = output.replace(new RegExp(`<\\/${tag}>`, "gi"), "");
  }

  for (const tag of BLOCKED_VOID_TAGS) {
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
    output = output.replace(new RegExp(`<\\/${tag}>`, "gi"), "");
  }

  return output
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPlaceholderValues(
  input: DescriptionTemplateInput,
): Record<string, string> {
  const isGraded = input.card_type === "graded";
  const condition = normalizeText(input.condition);
  const gradingCompany = normalizeText(input.grading_company);
  const grade = normalizeText(input.grade);
  const certNumber = normalizeText(input.cert_number);
  const priceCad = formatPriceCad(input.price_cad);

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
    cert_number: isGraded ? certNumber : "",
    year: normalizeText(input.year) || inferYear(input),
    price_cad: priceCad,
    seller_logo_url: normalizeText(input.seller_logo_url),
    seller_location: normalizeText(input.seller_location),
    shipping_summary: normalizeText(input.shipping_summary),
    returns_summary: normalizeText(input.returns_summary),
  };
}

function formatPriceCad(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `$${numeric.toFixed(2)} CAD`;
}

function inferYear(input: DescriptionTemplateInput): string {
  const titleYear = normalizeText(input.title)?.match(/\b(19|20)\d{2}\b/)?.[0];
  if (titleYear) return titleYear;

  const setName = normalizeText(input.set_name);
  if (!setName) return "";

  for (const hint of SET_YEAR_HINTS) {
    if (hint.pattern.test(setName)) {
      return hint.year;
    }
  }

  return "";
}

function normalizeText(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}
