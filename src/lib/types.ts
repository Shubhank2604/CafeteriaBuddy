export type DietType = "vegan" | "vegetarian" | "eggetarian" | "non_veg" | "custom";

export type Verdict = "great" | "mostly_fine" | "thin_options" | "not_your_day";

export type ItemDecision = "recommended" | "caution" | "avoid";

export type MealType = "breakfast" | "lunch" | "other";

export interface MenuItemData {
  name: string;
  tags: string[];
  notes?: string | null;
}

export interface MenuStation {
  name: string;
  items: MenuItemData[];
}

export interface MenuMeal {
  type: MealType;
  stations: MenuStation[];
}

export interface StructuredMenu {
  date: string;
  meals: MenuMeal[];
}

export interface PrefsInput {
  dietType: DietType;
  hardAvoids: string[];
  softDislikes: string[];
  likes: string[];
  goals: string[];
  allergies: string[];
  freeformNotes: string;
}

export interface AiInterpretation {
  diet_type: DietType | null;
  hard_avoids: string[];
  soft_dislikes: string[];
  likes: string[];
  goals: string[];
  allergies: string[];
  interpreted_notes: string;
  user_facing_summary: string;
}

export interface MatchItem {
  name: string;
  meal: MealType | string;
  station: string;
  decision: ItemDecision;
  reason: string;
  tags?: string[];
}

export interface MatchCombo {
  title: string;
  items: string[];
  why: string;
  /** Per-item “why it’s on this plate” (same order as items) */
  itemReasons?: string[];
}

/** How the final match was produced (honest UI badge). */
export type MatchSource = "ai" | "hybrid" | "baseline";

export interface MatchPayload {
  verdict: Verdict;
  headline: string;
  summary: string;
  score: number;
  items: MatchItem[];
  combos: MatchCombo[];
  /** Rules-only, AI polish applied, or mostly AI (rare). */
  source?: MatchSource;
  /** Non-user-facing diagnostics; never paste into summary. */
  aiStatus?: {
    ok: boolean;
    detail?: string;
  };
}

export interface TempRestrictionInput {
  label: string;
  avoidTags: string[];
  startsOn: string;
  endsOn: string;
  reason?: string;
}
