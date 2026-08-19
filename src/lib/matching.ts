/**
 * Deterministic, instant preference matching.
 * Allergies/avoids match tags AND dish names (e.g. "beans" → Refried Beans).
 * Score is always computed from this user's results.
 */
import type {
  ItemDecision,
  MatchPayload,
  PrefsInput,
  StructuredMenu,
  TempRestrictionInput,
  Verdict,
} from "./types";
import { uniqueStrings } from "./utils";

const DIET_MEAT_TAGS = [
  "meat",
  "non_veg",
  "chicken",
  "beef",
  "pork",
  "fish",
  "shellfish",
  "turkey",
  "bacon",
];

const STOP = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "this",
  "that",
  "have",
  "dont",
  "don't",
  "cant",
  "can't",
  "only",
  "just",
  "very",
  "really",
  "please",
  "also",
  "like",
  "food",
  "foods",
  "eat",
  "eating",
  "any",
  "some",
  "all",
  "not",
  "but",
  "will",
  "want",
  "need",
  "am",
  "im",
  "i'm",
  "my",
  "me",
  "to",
  "of",
  "in",
  "on",
  "a",
  "an",
  "is",
  "are",
  "be",
  "due",
  "because",
  "allergic",
  "allergy",
  "intolerant",
  "intolerance",
  "avoid",
  "cannot",
  "sensitive",
]);

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return uniqueStrings(tags.map(String));
}

/** Pull searchable hard-avoid terms from free-form notes. */
export function termsFromFreeform(notes: string): string[] {
  if (!notes?.trim()) return [];
  const n = notes.toLowerCase();
  const out: string[] = [];

  // Pattern: allergic/intolerant/avoid X
  const patterns = [
    /(?:allergic to|allergy to|intolerant to|intolerance to|avoid|can't have|cannot have|don't eat|do not eat|no)\s+([a-z][a-z\s-]{1,40}?)(?:\.|,|;|!|\band\b|$)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(n)) !== null) {
      const chunk = m[1]
        .split(/\s+and\s+|\/|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      out.push(...chunk);
    }
  }

  // Lactose → dairy
  if (/lactose/.test(n)) out.push("dairy", "lactose");

  // Short list style: "beans, peanuts" or single word "beans"
  if (n.length < 100) {
    const cleaned = n
      .replace(/(?:allergic to|allergy to|intolerant to|avoid|no)\s+/gi, " ")
      .replace(/[^a-z,\s-]/g, " ");
    out.push(
      ...cleaned
        .split(/[,;/|]+|\s+and\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && !STOP.has(s) && !s.includes(" "))
    );
  }

  // Tokenize content words (skip stopwords)
  for (const w of n.replace(/[^a-z\s-]/g, " ").split(/\s+/)) {
    if (w.length >= 4 && !STOP.has(w)) out.push(w);
  }

  return uniqueStrings(out).filter((t) => !STOP.has(t) && t.length >= 3 && t.length < 24);
}

export function collectHardTerms(
  prefs: PrefsInput,
  activeTempTags: string[]
): string[] {
  return uniqueStrings([
    ...prefs.allergies,
    ...prefs.hardAvoids,
    ...activeTempTags,
    ...termsFromFreeform(prefs.freeformNotes || ""),
  ]);
}

/**
 * Category expansions: user says one word → whole food family is Skip.
 * e.g. "beans" covers chickpea, lentil, hummus, dal, white bean, etc.
 */
export const ALLERGY_FAMILIES: Record<string, string[]> = {
  beans: [
    "bean",
    "beans",
    "chickpea",
    "chickpeas",
    "garbanzo",
    "lentil",
    "lentils",
    "legume",
    "legumes",
    "dal",
    "dahl",
    "daal",
    "hummus",
    "houmous",
    "edamame",
    "soybean",
    "soya",
    "falafel",
    "black bean",
    "kidney bean",
    "pinto",
    "navy bean",
    "cannellini",
    "refried",
  ],
  bean: [
    "bean",
    "beans",
    "chickpea",
    "lentil",
    "legume",
    "dal",
    "hummus",
    "edamame",
    "falafel",
  ],
  dairy: [
    "dairy",
    "milk",
    "cheese",
    "yogurt",
    "yoghurt",
    "curd",
    "butter",
    "cream",
    "paneer",
    "lactose",
    "cottage",
    "ghee",
    "whey",
    "casein",
  ],
  nuts: [
    "nut",
    "nuts",
    "almond",
    "cashew",
    "walnut",
    "pecan",
    "pistachio",
    "hazelnut",
    "macadamia",
    "peanut", // often grouped by users even if botanically different
  ],
  peanut: ["peanut", "peanuts", "groundnut"],
  shellfish: [
    "shellfish",
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "clam",
    "mussel",
    "oyster",
    "scallop",
    "crawfish",
    "crayfish",
  ],
  fish: ["fish", "salmon", "tuna", "cod", "tilapia", "anchovy", "sardine"],
  gluten: ["gluten", "wheat", "barley", "rye", "bread", "pasta", "flour", "bagel", "croissant", "ciabatta"],
  egg: ["egg", "eggs", "omelet", "omelette", "mayonnaise", "mayo"],
  pork: ["pork", "bacon", "ham", "pepperoni", "sausage", "prosciutto", "lard"],
  beef: ["beef", "steak", "burger", "meatball"], // meatball often beef; may false-positive
  chicken: ["chicken", "pollo", "shawarma"], // shawarma often chicken in this café
};

/**
 * Does this dish hit a restriction term?
 * Checks tags, dish name, singular/plural, and food-family expansions.
 */
export function dishHitsTerm(
  itemName: string,
  tags: string[],
  term: string
): boolean {
  const t = term.toLowerCase().trim();
  if (!t || t.length < 2) return false;
  const name = itemName.toLowerCase();
  const tagSet = new Set(tags.map((x) => x.toLowerCase()));
  const haystack = `${name} ${tags.join(" ")}`;

  if (tagSet.has(t)) return true;

  // Category family (beans → chickpea, lentil, hummus…)
  const family = ALLERGY_FAMILIES[t];
  if (family) {
    for (const w of family) {
      if (tagSet.has(w)) return true;
      if (name.includes(w)) return true;
      const re = new RegExp(
        `(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`,
        "i"
      );
      if (re.test(haystack)) return true;
    }
  }

  // Singular/plural: beans ↔ bean
  const variants = new Set([t]);
  if (t.endsWith("es") && t.length > 4) variants.add(t.slice(0, -2));
  else if (t.endsWith("s") && t.length > 3) variants.add(t.slice(0, -1));
  else {
    variants.add(t + "s");
    variants.add(t + "es");
  }

  for (const v of variants) {
    if (v.length < 3) continue;
    if (tagSet.has(v)) return true;
    const re = new RegExp(
      `(^|[^a-z])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`,
      "i"
    );
    if (re.test(name)) return true;
    if (name.includes(v)) return true;
  }

  return false;
}

function dietBlocks(diet: string, tags: string[]): string | null {
  const t = new Set(tags.map((x) => x.toLowerCase()));
  if (diet === "vegan") {
    if (
      [...DIET_MEAT_TAGS, "egg", "dairy", "honey"].some((x) => t.has(x))
    ) {
      return "Does not fit a vegan diet";
    }
  }
  if (diet === "vegetarian" || diet === "eggetarian") {
    if (DIET_MEAT_TAGS.some((x) => t.has(x))) {
      return diet === "vegetarian"
        ? "Contains meat/fish, not vegetarian"
        : "Contains meat/fish, not eggetarian";
    }
  }
  return null;
}

function scoreFromItems(items: { decision: ItemDecision }[]): {
  score: number;
  verdict: Verdict;
  recommended: number;
} {
  const total = items.length || 1;
  const recommended = items.filter((i) => i.decision === "recommended").length;
  const avoid = items.filter((i) => i.decision === "avoid").length;
  // Personalized fit: weight safe options, penalize avoids
  const ratio = recommended / total;
  const avoidRatio = avoid / total;
  let score = Math.round(ratio * 100 - avoidRatio * 15);
  score = Math.max(0, Math.min(100, score));

  let verdict: Verdict;
  if (ratio >= 0.45 && avoidRatio < 0.55) verdict = "great";
  else if (ratio >= 0.25) verdict = "mostly_fine";
  else if (ratio >= 0.1) verdict = "thin_options";
  else verdict = "not_your_day";

  return { score, verdict, recommended };
}

const HEADLINES: Record<Verdict, string> = {
  great: "Great day for you at the café",
  mostly_fine: "Mostly fine: a few things to skip",
  thin_options: "Thin options today",
  not_your_day: "Not your day: packing food may be smarter",
};

export function matchMenuLocal(
  menu: StructuredMenu,
  prefs: PrefsInput,
  tempRestrictions: TempRestrictionInput[]
): MatchPayload {
  const today = new Date().toISOString().slice(0, 10);
  const activeTempTags = uniqueStrings(
    tempRestrictions
      .filter((t) => t.startsOn <= today && t.endsOn >= today)
      .flatMap((t) => t.avoidTags)
  );
  const hardTerms = collectHardTerms(prefs, activeTempTags);
  const soft = uniqueStrings(prefs.softDislikes);
  const likes = uniqueStrings(prefs.likes);
  const goals = uniqueStrings(prefs.goals);

  const items: MatchPayload["items"] = [];

  for (const meal of menu.meals) {
    const mealType = (meal.type || "other").toLowerCase();
    for (const station of meal.stations) {
      for (const item of station.items) {
        const tags = normalizeTags(item.tags);
        let decision: ItemDecision = "recommended";
        let reason = "Fits your preferences";

        let hitTerm: string | null = null;
        for (const term of hardTerms) {
          if (dishHitsTerm(item.name, tags, term)) {
            hitTerm = term;
            break;
          }
        }

        const dietReason = dietBlocks(prefs.dietType, tags);

        if (hitTerm) {
          decision = "avoid";
          reason = `Allergy / avoid: “${hitTerm}” (matched in this dish)`;
        } else if (dietReason) {
          decision = "avoid";
          reason = dietReason;
        } else if (
          soft.some((t) => dishHitsTerm(item.name, tags, t))
        ) {
          decision = "caution";
          reason = "Matches something you usually dislike";
        } else if (
          likes.some((t) => dishHitsTerm(item.name, tags, t)) ||
          (goals.includes("high_protein") &&
            tags.some((t) =>
              ["chicken", "egg", "fish", "turkey", "dairy"].includes(t)
            ))
        ) {
          decision = "recommended";
          reason = "Aligned with your likes or goals";
        }

        items.push({
          name: item.name,
          meal: mealType,
          station: station.name,
          decision,
          reason,
          tags,
        });
      }
    }
  }

  const { score, verdict, recommended } = scoreFromItems(items);
  const combos = buildPlateIdeas(items);

  return {
    verdict,
    headline: HEADLINES[verdict],
    summary: `${recommended} of ${items.length} dishes look good for your profile today. Score is your personal fit (not a fixed number).`,
    score,
    items,
    combos,
  };
}

type Ranked = MatchPayload["items"][number];

/**
 * Always 3 plate ideas for the cylinder carousel:
 * Breakfast · Lunch · Salad — personalized (Good items only).
 */
function buildPlateIdeas(items: Ranked[]): MatchPayload["combos"] {
  const breakfastPool = items.filter(
    (i) =>
      i.meal === "breakfast" &&
      i.decision === "recommended" &&
      i.station !== "Salad Compose"
  );
  const lunchPool = items.filter(
    (i) =>
      i.meal === "lunch" &&
      i.decision === "recommended" &&
      i.station !== "Salad Compose"
  );
  const saladPool = items.filter(
    (i) => i.station === "Salad Compose" && i.decision === "recommended"
  );

  // Fixed 3 picks per card (same as original breakfast/lunch plate ideas)
  return [
    slotCombo(
      "Breakfast idea",
      breakfastPool,
      3,
      "Thin breakfast options for you today"
    ),
    slotCombo(
      "Lunch idea",
      lunchPool,
      3,
      "Thin lunch options for you today"
    ),
    slotCombo(
      "Salad bowl",
      saladPool,
      3,
      "Few salad toppings fit you today — check the bar"
    ),
  ];
}

function slotCombo(
  title: string,
  pool: Ranked[],
  max: number,
  emptyWhy: string
): MatchPayload["combos"][number] {
  if (pool.length === 0) {
    return {
      title,
      items: [],
      itemReasons: [],
      why: emptyWhy,
    };
  }
  const picked = pickDiversePlate(pool, max);
  const use = picked.length > 0 ? picked : pool.slice(0, Math.min(max, pool.length));
  return {
    title,
    items: use.map((p) => p.name),
    itemReasons: use.map(
      (p) => p.reason || "Marked Good for you"
    ),
    why:
      title === "Salad bowl"
        ? "Always available · built from Salad Compose items marked Good"
        : `Built from dishes marked Good for you · ${use.length} pick${use.length === 1 ? "" : "s"}`,
  };
}

function pickDiversePlate(pool: Ranked[], max: number): Ranked[] {
  // Prefer variety of stations; fall back to fill remaining slots
  const byStation = new Map<string, Ranked[]>();
  for (const item of pool) {
    const key = item.station || "Other";
    if (!byStation.has(key)) byStation.set(key, []);
    byStation.get(key)!.push(item);
  }

  const picked: Ranked[] = [];
  const usedNames = new Set<string>();
  const stations = Array.from(byStation.keys());

  // Round-robin across stations
  let guard = 0;
  while (picked.length < max && guard < 40) {
    guard += 1;
    let added = false;
    for (const st of stations) {
      if (picked.length >= max) break;
      const list = byStation.get(st)!;
      const next = list.find((i) => !usedNames.has(i.name));
      if (next) {
        picked.push(next);
        usedNames.add(next.name);
        added = true;
      }
    }
    if (!added) break;
  }

  return picked;
}

/** Fast local preference interpretation (no network). */
export function interpretPreferencesLocal(input: PrefsInput) {
  const fromNotes = termsFromFreeform(input.freeformNotes || "");
  const hard = uniqueStrings([
    ...input.hardAvoids,
    ...input.allergies,
    ...fromNotes,
  ]);
  // lactose → dairy already in termsFromFreeform
  if (fromNotes.includes("lactose") || /lactose/i.test(input.freeformNotes || "")) {
    hard.push("dairy");
  }
  const allergies = uniqueStrings([...input.allergies, ...fromNotes]);

  const parts = [`Diet: ${input.dietType.replace(/_/g, "-")}`];
  if (allergies.length) parts.push(`Allergies: ${allergies.join(", ")}`);
  if (hard.length) parts.push(`Avoids: ${uniqueStrings(hard).join(", ")}`);
  if (input.freeformNotes.trim()) parts.push(`Notes: ${input.freeformNotes.trim()}`);

  return {
    diet_type: input.dietType,
    hard_avoids: uniqueStrings(hard),
    soft_dislikes: uniqueStrings(input.softDislikes),
    likes: uniqueStrings(input.likes),
    goals: uniqueStrings(input.goals),
    allergies,
    interpreted_notes: input.freeformNotes || "No free-form notes.",
    user_facing_summary: parts.join(" · "),
  };
}
