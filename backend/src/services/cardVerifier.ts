/**
 * Verifies and corrects AI-identified card details against the Pokemon TCG API.
 *
 * Opus is accurate at reading card names and numbers but frequently misidentifies
 * the set (especially for promos and pin collections). We use the card_name +
 * card_number combination — which is nearly unique across the entire Pokemon TCG
 * database — to look up the authoritative set name.
 */

const API_BASE = "https://api.pokemontcg.io/v2";

interface PtcgSetInfo {
  name: string;
  series: string;
  printedTotal?: number;
  total?: number;
}

interface PtcgCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: PtcgSetInfo;
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  if (apiKey) headers["X-Api-Key"] = apiKey;
  return headers;
}

/**
 * Parse a card number like "041/217" into { number: "41", setTotal: 217 }.
 * Handles formats: "041/217", "41", "TG05/TG30", "SWSH101", etc.
 */
export function parseCardNumber(
  cardNumber: string,
): { number: string; setTotal: number | null } {
  const trimmed = cardNumber.trim();
  const match = /^(.+?)\s*\/\s*(\d+)$/.exec(trimmed);
  if (match?.[1] && match[2]) {
    // Strip leading zeros from numeric portion, but preserve letters (e.g. "SWSH101")
    const num = /^\d+$/.test(match[1]) ? String(parseInt(match[1], 10)) : match[1];
    return { number: num, setTotal: parseInt(match[2], 10) };
  }
  const num = /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
  return { number: num, setTotal: null };
}

async function queryTcg(q: string): Promise<PtcgCard[]> {
  const url = new URL(`${API_BASE}/cards`);
  url.searchParams.set("q", q);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("select", "id,name,number,rarity,set");

  const response = await fetch(url.toString(), { headers: apiHeaders() });
  if (!response.ok) {
    console.warn(`[cardVerifier] TCG API ${String(response.status)} for q=${q}`);
    return [];
  }
  const data = (await response.json()) as { data: PtcgCard[] };
  return data.data;
}

export interface VerificationResult {
  set_name: string;
  rarity: string | null;
  match_count: number;
  /** How sure we are this verification is correct. 0.98 for exact single match. */
  confidence: number;
}

/**
 * Extract candidate English names from the raw card_name Opus returned.
 * Opus often returns foreign-language cards as "ニョロモ (Poliwag)" — we want
 * to try both the raw name and the parenthetical English name against the
 * Pokemon TCG database (which is English-dominant).
 */
function extractNameCandidates(rawName: string): string[] {
  const names: string[] = [];
  const primary = rawName.replace(/"/g, "").trim();
  if (primary) names.push(primary);

  // "ニョロモ (Poliwag)" → also try "Poliwag"
  const parenMatch = /\(([^)]+)\)/.exec(primary);
  if (parenMatch?.[1]) {
    const inside = parenMatch[1].trim();
    if (inside && inside !== primary) names.push(inside);
  }

  // "Poliwag (ニョロモ)" → also try "Poliwag" (the part before the parens)
  const beforeParen = primary.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (beforeParen && beforeParen !== primary && !names.includes(beforeParen)) {
    names.push(beforeParen);
  }

  return names;
}

/**
 * Look up a Pokemon card by name + number to get the authoritative set name.
 * Returns null if no match found or the API is unreachable.
 */
export async function verifyPokemonCard(
  cardName: string,
  cardNumber: string,
): Promise<VerificationResult | null> {
  if (!cardName || !cardNumber) return null;

  const { number, setTotal } = parseCardNumber(cardNumber);
  if (!number) return null;

  const nameCandidates = extractNameCandidates(cardName);
  if (nameCandidates.length === 0) return null;

  try {
    let candidates: PtcgCard[] = [];

    // Try each name candidate through the query ladder (strictest → loosest)
    // until we get a hit.
    for (const name of nameCandidates) {
      // Strictest: exact name + number + setTotal
      if (setTotal) {
        candidates = await queryTcg(
          `name:"${name}" number:${number} (set.printedTotal:${String(setTotal)} OR set.total:${String(setTotal)})`,
        );
        if (candidates.length > 0) break;
      }

      // Exact name + number
      candidates = await queryTcg(`name:"${name}" number:${number}`);
      if (candidates.length > 0) break;

      // Loose name + number (matches "Charizard VMAX" for "Charizard")
      candidates = await queryTcg(`name:${name} number:${number}`);
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) return null;

    // Exact match on first candidate
    const best = candidates[0];
    if (!best) return null;

    // If we got exactly 1 candidate, very high confidence.
    // Multiple candidates = same card number/name exists in several sets (promos),
    // in which case prefer the one whose setTotal matched our input.
    let confidence = 0.98;
    if (candidates.length > 1) {
      confidence = setTotal ? 0.9 : 0.8;
    }

    return {
      set_name: best.set.name,
      rarity: best.rarity ?? null,
      match_count: candidates.length,
      confidence,
    };
  } catch (err) {
    console.warn(
      "[cardVerifier] verifyPokemonCard failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
