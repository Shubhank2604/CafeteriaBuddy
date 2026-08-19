import type { StructuredMenu } from "./types";

/** Accurate fixture from Images/Image1.png, used if AI is unavailable. */
export const SAMPLE_MENU: StructuredMenu = {
  date: "2026-07-28",
  meals: [
    {
      type: "breakfast",
      stations: [
        {
          name: "Fruit and Yogurt Bar",
          items: [
            { name: "Mango Turmeric Crush", tags: ["vegan", "fruit"] },
            { name: "Strawberries", tags: ["vegan", "fruit"] },
            { name: "Stella Bella Green Grapes", tags: ["vegan", "fruit"] },
            { name: "Yellow Peaches", tags: ["vegan", "fruit"] },
            { name: "Granny Smith Apples", tags: ["vegan", "fruit"] },
            { name: "Cara Cara Oranges", tags: ["vegan", "fruit"] },
            { name: "Bananas", tags: ["vegan", "fruit"] },
            { name: "Cottage Cheese", tags: ["vegetarian", "dairy"] },
            { name: "Hard Boiled Eggs", tags: ["vegetarian", "egg"] },
            { name: "Plain Greek Yogurt", tags: ["vegetarian", "dairy"] },
            { name: "Vegan Coconut Yogurt", tags: ["vegan"] },
            { name: "Strawberry Yogurt", tags: ["vegetarian", "dairy"] },
          ],
        },
        {
          name: "Breakfast Bar",
          items: [
            { name: "Upside-Down Bagel Sandwich", tags: ["vegetarian", "gluten", "egg", "dairy"] },
            { name: "Bacon", tags: ["pork", "meat", "non_veg"] },
            { name: "Scrambled Eggs", tags: ["vegetarian", "egg"] },
            {
              name: "Biscuits & Sausage Gravy-Inspired Pizza",
              tags: ["pork", "meat", "non_veg", "gluten", "dairy"],
            },
          ],
        },
        {
          name: "Cereal",
          items: [
            { name: "Oatmeal", tags: ["vegan"] },
            { name: "Granola", tags: ["vegetarian"] },
            { name: "Kellogg's Rice Krispies", tags: ["vegetarian", "gluten"] },
            { name: "Purely Elizabeth Granola", tags: ["vegetarian"] },
            { name: "Kellogg's Raisin Bran", tags: ["vegetarian", "gluten"] },
          ],
        },
        {
          name: "Toast and Spreads",
          items: [
            { name: "Mini Raspberry Danish", tags: ["vegetarian", "gluten", "dairy"] },
            { name: "OMGI French Toast Bagels", tags: ["vegetarian", "gluten", "egg", "dairy"] },
            { name: "OMGI Plain Bagels", tags: ["vegetarian", "gluten"] },
            { name: "Stone & Skillet English Muffins", tags: ["vegetarian", "gluten"] },
            { name: "Little Northern Bakehouse Gluten Free Wheat Bread", tags: ["vegan", "gluten_free"] },
            { name: "Whipped Cream Cheese", tags: ["vegetarian", "dairy"] },
            { name: "Veggie Cream Cheese", tags: ["vegetarian", "dairy"] },
            { name: "Vegan Cream Cheese", tags: ["vegan"] },
            { name: "Assorted Jams", tags: ["vegan"] },
          ],
        },
      ],
    },
    {
      type: "lunch",
      stations: [
        {
          name: "Chef's Table",
          items: [
            { name: "Pollo a la Brasa with Aji Verde", tags: ["chicken", "meat", "non_veg"] },
            {
              name: "Spinach & Cheese Empanadas with Chimichurri",
              tags: ["vegetarian", "dairy", "gluten"],
            },
            { name: "Sofrito Rice", tags: ["vegan"] },
            { name: "Refried Beans", tags: ["vegan"] },
          ],
        },
        {
          name: "Hearth",
          items: [
            { name: "Pepperoni & Basil Pizza", tags: ["pork", "meat", "non_veg", "gluten", "dairy"] },
            { name: "Eggplant Parm Pizza", tags: ["vegetarian", "dairy", "gluten"] },
            { name: "Personal Meatball Stromboli", tags: ["beef", "meat", "non_veg", "gluten", "dairy"] },
          ],
        },
        {
          name: "Grill",
          items: [
            { name: "Marinated Grilled Chicken", tags: ["chicken", "meat", "non_veg"] },
            {
              name: "Pineapple Rum Pork Belly Bum Ends",
              tags: ["pork", "meat", "non_veg"],
            },
            { name: "Mushroom Wings with Chipotle Ranch", tags: ["vegetarian", "dairy", "spicy"] },
          ],
        },
        {
          name: "Salad & Antipasti",
          items: [
            { name: "Turmeric Couscous", tags: ["vegan", "gluten"] },
            { name: "Tabbouleh-Inspired Chickpea Salad", tags: ["vegan"] },
            { name: "Corn & Tomato Salad", tags: ["vegan"] },
            { name: "Carrot Salad with Citrus Miso-Ginger Dressing", tags: ["vegan"] },
            { name: "Sesame Tomato Cucumber Salad", tags: ["vegan"] },
            { name: "Summer Melon Salad", tags: ["vegan"] },
          ],
        },
        {
          name: "Seasonal",
          items: [
            { name: "Chicken Shawarma", tags: ["chicken", "meat", "non_veg"] },
            { name: "Saffron Rice", tags: ["vegan"] },
            { name: "Roasted Broccolini with Lemon Tahini", tags: ["vegan"] },
            { name: "Tabbouleh-Inspired Chickpea Salad", tags: ["vegan"] },
          ],
        },
        {
          name: "Soup",
          items: [
            { name: "Shrimp & Sausage Gumbo", tags: ["shellfish", "pork", "meat", "non_veg"] },
            { name: "White Bean & Escarole Soup", tags: ["vegan"] },
          ],
        },
        {
          name: "Speciality Sandwiches",
          items: [
            {
              name: "Turkey & Cheddar Ciabatta Sandwich with Savory Blueberry Jam",
              tags: ["turkey", "meat", "non_veg", "dairy", "gluten"],
            },
            {
              name: "Chicken Salad Croissant Sandwich with Lettuce and Tomato",
              tags: ["chicken", "meat", "non_veg", "egg", "gluten", "dairy"],
            },
            {
              name: "Portobello Muffuletta Picnic Sandwich",
              tags: ["vegetarian", "dairy", "gluten"],
            },
          ],
        },
      ],
    },
  ],
};
