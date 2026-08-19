export const DIET_OPTIONS = [
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "eggetarian", label: "Eggs OK (eggetarian)" },
  { value: "non_veg", label: "Non-veg" },
  { value: "custom", label: "Custom" },
];

export const AVOID_OPTIONS = [
  { value: "pork", label: "Pork" },
  { value: "beef", label: "Beef" },
  { value: "chicken", label: "Chicken" },
  { value: "fish", label: "Fish" },
  { value: "shellfish", label: "Shellfish" },
  { value: "egg", label: "Egg" },
  { value: "dairy", label: "Dairy" },
  { value: "gluten", label: "Gluten" },
  { value: "nuts", label: "Nuts" },
  { value: "spicy", label: "Spicy" },
];

/** Avoids already enforced by diet — hide from hard-avoid chips. */
const MEAT_FISH = ["pork", "beef", "chicken", "fish", "shellfish"] as const;
const VEGAN_IMPLIED = [...MEAT_FISH, "egg", "dairy"] as const;

/**
 * Hard-avoid options that still make sense for this diet.
 * Diet matching already blocks meat/fish (and egg/dairy for vegan).
 */
export function avoidOptionsForDiet(dietType: string) {
  const hide = new Set<string>();
  if (dietType === "vegan") {
    for (const v of VEGAN_IMPLIED) hide.add(v);
  } else if (dietType === "vegetarian" || dietType === "eggetarian") {
    for (const v of MEAT_FISH) hide.add(v);
  }
  return AVOID_OPTIONS.filter((o) => !hide.has(o.value));
}

/** Drop selected avoids that no longer apply after a diet change. */
export function filterHardAvoidsForDiet(dietType: string, hardAvoids: string[]) {
  const allowed = new Set(avoidOptionsForDiet(dietType).map((o) => o.value));
  return hardAvoids.filter((v) => allowed.has(v));
}

export const GOAL_OPTIONS = [
  { value: "high_protein", label: "High protein" },
  { value: "lighter_meals", label: "Lighter meals" },
  { value: "more_veggies", label: "More veggies" },
  { value: "low_spice", label: "Low spice" },
];
