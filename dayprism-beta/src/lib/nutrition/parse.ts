import { FOODS, Food } from './foods';

// Turns "100g dal rice, 50 g fries and 200ml watermelon juice" into items with a matched food
// and an amount in grams. Nothing is guessed silently: each item shows what it matched and the
// grams used, and you can pick another match or change the amount before saving.

export type Unit = 'g' | 'ml' | 'piece' | 'bowl' | 'cup' | 'glass' | 'tbsp' | 'tsp';

export interface ParsedItem {
  /** The text this item came from. */
  text: string;
  query: string;
  quantity: number;
  unit: Unit;
  /** Best matches, best first (may be empty). */
  matches: Food[];
  food: Food | null;
  /** Null when the amount can't be converted for this food (e.g. "2 rice"). */
  grams: number | null;
}

const UNIT_WORDS: [RegExp, Unit, number][] = [
  [/^(kg|kgs|kilo|kilos|kilograms?)$/, 'g', 1000],
  [/^(g|gm|gms|gr|grams?|grammes?)$/, 'g', 1],
  [/^(l|ltr|litres?|liters?)$/, 'ml', 1000],
  [/^(ml|mls|millilitres?|milliliters?)$/, 'ml', 1],
  [/^(pcs?|pieces?|nos?|slices?|servings?|whole|plates?)$/, 'piece', 1],
  [/^(bowls?|katoris?)$/, 'bowl', 1],
  [/^(cups?)$/, 'cup', 1],
  [/^(glass|glasses)$/, 'glass', 1],
  [/^(tbsp|tbsps|tablespoons?)$/, 'tbsp', 1],
  [/^(tsp|tsps|teaspoons?)$/, 'tsp', 1],
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, quarter: 0.25,
};

const STOP = new Set(['of', 'the', 'some', 'with', 'plain', 'fresh', 'homemade', 'cooked']);

export const normalise = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Splits a sentence into items: commas, semicolons, new lines, "+" and " and ". */
export function splitItems(input: string): string[] {
  return input.split(/[,;\n+]|\band\b|&/i).map((s) => s.trim()).filter(Boolean);
}

function readUnit(word: string | undefined): [Unit, number] | null {
  if (!word) return null;
  for (const [re, unit, factor] of UNIT_WORDS) if (re.test(word)) return [unit, factor];
  return null;
}

/** Finds quantity + unit at the start ("100g dal", "2 idli", "half bowl rice") or the end ("dal rice 100 g"). */
export function readAmount(text: string): { quantity: number; unit: Unit; rest: string } | null {
  const words = normalise(text).replace(/(\d)([a-z])/g, '$1 $2').split(' ');
  const num = (w: string | undefined) => (w == null ? NaN : /^\d+(\.\d+)?$/.test(w) ? Number(w) : NUMBER_WORDS[w] ?? NaN);

  // leading: <n> [unit] [of] food
  const n0 = num(words[0]);
  if (!Number.isNaN(n0)) {
    const u = readUnit(words[1]);
    const rest = words.slice(u ? 2 : 1).filter((w, i) => !(i === 0 && w === 'of')).join(' ');
    if (u) return { quantity: n0 * u[1], unit: u[0], rest };
    return { quantity: n0, unit: 'piece', rest };
  }
  // trailing: food <n> [unit]
  const last = words.length - 1;
  const uEnd = readUnit(words[last]);
  const nEnd = num(words[uEnd ? last - 1 : last]);
  if (!Number.isNaN(nEnd) && words.length > 1) {
    const rest = words.slice(0, uEnd ? last - 1 : last).join(' ');
    return uEnd ? { quantity: nEnd * uEnd[1], unit: uEnd[0], rest } : { quantity: nEnd, unit: 'g', rest };
  }
  return null;
}

/** Scores how well a query names a food (0–100). */
export function score(query: string, food: Food): number {
  const q = normalise(query);
  if (!q) return 0;
  const qTokens = q.split(' ').filter((w) => !STOP.has(w));
  let best = 0;
  for (const name of [food.name, ...food.aliases]) {
    const n = normalise(name);
    if (n === q) return 100;
    const nTokens = n.split(' ').filter((w) => !STOP.has(w));
    const hit = qTokens.filter((w) => nTokens.some((x) => x === w || (w.length > 3 && (x.startsWith(w) || w.startsWith(x))))).length;
    if (hit === 0) continue;
    const coverQ = hit / qTokens.length;
    const coverN = hit / nTokens.length;
    // Every word you typed matters most; extra words in the food's name cost a little.
    const s = 90 * coverQ * (0.6 + 0.4 * coverN);
    best = Math.max(best, s);
  }
  return best;
}

export function search(query: string, limit = 5): Food[] {
  return FOODS.map((f) => ({ f, s: score(query, f) }))
    .filter((x) => x.s >= 30)
    .sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map((x) => x.f);
}

/** Converts an amount to grams for this food, or null when it can't be. */
export function toGrams(food: Food, quantity: number, unit: Unit): number | null {
  const ml = (v: number) => v * (food.density ?? 1);
  switch (unit) {
    case 'g': return quantity;
    case 'ml': return ml(quantity);
    case 'tbsp': return ml(quantity * 15);
    case 'tsp': return ml(quantity * 5);
    case 'glass': return food.density ? ml(quantity * 250) : null;
    case 'cup': return food.density ? ml(quantity * 240) : food.cup ? quantity * food.cup : null;
    case 'bowl': return food.bowl ? quantity * food.bowl : food.density ? ml(quantity * 200) : null;
    case 'piece': return food.piece ? quantity * food.piece : food.density ? ml(quantity * 250) : food.bowl ? quantity * food.bowl : null;
  }
}

export function parseMeal(input: string): ParsedItem[] {
  return splitItems(input).map((text) => {
    const amount = readAmount(text);
    const query = amount?.rest || normalise(text);
    const quantity = amount?.quantity ?? 1;
    const unit = amount?.unit ?? 'piece';
    const matches = search(query);
    const food = matches[0] ?? null;
    return { text, query, quantity, unit, matches, food, grams: food ? toGrams(food, quantity, unit) : null };
  });
}

export const UNIT_LABEL: Record<Unit, string> = {
  g: 'g', ml: 'ml', piece: 'piece', bowl: 'bowl', cup: 'cup', glass: 'glass', tbsp: 'tbsp', tsp: 'tsp',
};
