import { describe, expect, it } from "vitest";
import {
  ALLERGY_FAMILIES,
  dishHitsTerm,
  matchMenuLocal,
} from "./matching";
import type { PrefsInput, StructuredMenu } from "./types";

const menu: StructuredMenu = {
  date: "2026-07-28",
  meals: [
    {
      type: "lunch",
      stations: [
        {
          name: "Mains",
          items: [
            { name: "Falafel Bowl", tags: ["vegan", "beans"] },
            { name: "Grilled Chicken", tags: ["chicken", "meat"] },
            { name: "Paneer Wrap", tags: ["vegetarian", "dairy"] },
            { name: "Garden Salad", tags: ["vegan"] },
          ],
        },
      ],
    },
  ],
};

const basePrefs: PrefsInput = {
  dietType: "non_veg",
  hardAvoids: [],
  softDislikes: [],
  likes: [],
  goals: [],
  allergies: [],
  freeformNotes: "",
};

describe("dishHitsTerm + families", () => {
  it("expands beans to falafel", () => {
    expect(dishHitsTerm("Falafel Bowl", ["vegan"], "beans")).toBe(true);
    expect(ALLERGY_FAMILIES.beans).toContain("falafel");
  });

  it("matches dairy family on paneer", () => {
    expect(dishHitsTerm("Paneer Wrap", ["vegetarian"], "dairy")).toBe(true);
  });

  it("does not false-hit unrelated dish", () => {
    expect(dishHitsTerm("Garden Salad", ["vegan"], "pork")).toBe(false);
  });
});

describe("matchMenuLocal", () => {
  it("skips beans allergy on falafel", () => {
    const r = matchMenuLocal(
      menu,
      { ...basePrefs, allergies: ["beans"] },
      []
    );
    const fal = r.items.find((i) => i.name === "Falafel Bowl");
    expect(fal?.decision).toBe("avoid");
  });

  it("blocks meat for vegetarian", () => {
    const r = matchMenuLocal(
      menu,
      { ...basePrefs, dietType: "vegetarian" },
      []
    );
    const ch = r.items.find((i) => i.name === "Grilled Chicken");
    expect(ch?.decision).toBe("avoid");
  });

  it("recommends safe vegan salad", () => {
    const r = matchMenuLocal(
      menu,
      { ...basePrefs, dietType: "vegan", allergies: ["dairy"] },
      []
    );
    const salad = r.items.find((i) => i.name === "Garden Salad");
    expect(salad?.decision).toBe("recommended");
  });
});
