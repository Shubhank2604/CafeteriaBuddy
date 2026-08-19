/**
 * Always-on Salad Compose bar — not from daily photo extraction.
 * Merged into every active menu for matching + display.
 */
import type { MenuStation, StructuredMenu } from "./types";

export const SALAD_COMPOSE_STATION = "Salad Compose";

export const SALAD_COMPOSE_ITEMS: { name: string; tags: string[] }[] = [
  { name: "Lettuce", tags: ["vegan", "vegetable"] },
  { name: "Croutons", tags: ["vegetarian", "gluten"] },
  { name: "Plain tuna", tags: ["fish", "non_veg"] },
  { name: "Roasted chicken", tags: ["chicken", "meat", "non_veg"] },
  { name: "Hard boiled eggs", tags: ["vegetarian", "egg"] },
  { name: "Hummus", tags: ["vegan"] },
  { name: "Tofu", tags: ["vegan"] },
  { name: "Carrot", tags: ["vegan", "vegetable"] },
  { name: "Onion", tags: ["vegan", "vegetable"] },
  { name: "Broccoli", tags: ["vegan", "vegetable"] },
  { name: "Bell peppers", tags: ["vegan", "vegetable"] },
  { name: "Cucumber", tags: ["vegan", "vegetable"] },
  { name: "Cherry tomatoes", tags: ["vegan", "vegetable", "fruit"] },
  { name: "Feta cheese", tags: ["vegetarian", "dairy"] },
  { name: "Parmesan cheese", tags: ["vegetarian", "dairy"] },
  { name: "Olives", tags: ["vegan"] },
];

export function saladComposeStation(): MenuStation {
  return {
    name: SALAD_COMPOSE_STATION,
    items: SALAD_COMPOSE_ITEMS.map((i) => ({
      name: i.name,
      tags: [...i.tags],
    })),
  };
}

/**
 * Attach Salad Compose to lunch (create lunch if missing).
 * Strips any prior "Salad Compose" station so photo OCR can't duplicate.
 */
export function mergeAlwaysOnStations(menu: StructuredMenu): StructuredMenu {
  const salad = saladComposeStation();
  const meals = (menu.meals || []).map((meal) => ({
    ...meal,
    stations: (meal.stations || []).filter(
      (s) => s.name.toLowerCase() !== SALAD_COMPOSE_STATION.toLowerCase()
    ),
  }));

  const lunchIdx = meals.findIndex(
    (m) => String(m.type).toLowerCase() === "lunch"
  );
  if (lunchIdx >= 0) {
    meals[lunchIdx] = {
      ...meals[lunchIdx],
      stations: [...meals[lunchIdx].stations, salad],
    };
  } else {
    meals.push({ type: "lunch", stations: [salad] });
  }

  // Drop empty meals left after stripping
  const cleaned = meals.filter(
    (m) => m.stations.length > 0 || String(m.type).toLowerCase() === "lunch"
  );

  return {
    date: menu.date,
    meals: cleaned,
  };
}
