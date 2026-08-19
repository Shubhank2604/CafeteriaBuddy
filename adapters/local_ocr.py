from pathlib import Path

from models import Meal, OCRLine, OCRResult


def _line(text: str, x: float, y: float, width: float = 0.2, height: float = 0.03) -> OCRLine:
    return OCRLine(
        text=text,
        x=x,
        y=y,
        width=width,
        height=height,
        confidence=0.98,
    )


BREAKFAST_LINES = [
    _line("BREAKFAST SPECIALS | WEDNESDAY JULY 22", 0.22, 0.08, 0.70, 0.05),
    _line("FRUIT AND YOGURT BAR", 0.04, 0.30, 0.25, 0.04),
    _line("Sliced Fruit", 0.05, 0.39),
    _line("Jumbo Red Gem Grapes", 0.05, 0.43),
    _line("Local Blueberries", 0.05, 0.47),
    _line("Flavor Grenade Plumcots", 0.05, 0.51),
    _line("Clementines", 0.05, 0.55),
    _line("Royal Gala Apples", 0.05, 0.59),
    _line("Bananas", 0.05, 0.63),
    _line("Cottage Cheese", 0.05, 0.67),
    _line("Hard Boiled Eggs", 0.05, 0.71),
    _line("Plain Greek Yogurt", 0.05, 0.75),
    _line("Vegan Coconut Yogurt", 0.05, 0.79),
    _line("Strawberry Yogurt", 0.05, 0.83),
    _line("BREAKFAST BAR", 0.37, 0.30, 0.25, 0.04),
    _line("Croissan'wich", 0.38, 0.39),
    _line("Sausage Patties", 0.38, 0.43),
    _line("Squash Blossom & Goat Cheese", 0.38, 0.47, 0.24),
    _line("Frittata", 0.38, 0.50),
    _line("Banana Bread Pancakes", 0.38, 0.55),
    _line("CEREAL", 0.37, 0.60, 0.25, 0.04),
    _line("Oatmeal", 0.38, 0.67),
    _line("Granola", 0.38, 0.71),
    _line("Quaker Life Cereal", 0.38, 0.75),
    _line("Purely Elizabeth Granola", 0.38, 0.79),
    _line("Special K with Red Berries", 0.38, 0.83),
    _line("TOAST AND SPREADS", 0.70, 0.30, 0.25, 0.04),
    _line("Cream Cheese Biscuits", 0.71, 0.39),
    _line("OMG! Garlic Bagels", 0.71, 0.43),
    _line("OMG! Plain Bagels", 0.71, 0.47),
    _line("Stone & Skillet English Muffins", 0.71, 0.51, 0.25),
    _line("Little Northern Bakehouse Gluten Free", 0.71, 0.55, 0.28),
    _line("Wheat Bread", 0.71, 0.58),
    _line("Whipped Cream Cheese", 0.71, 0.63),
    _line("Veggie Cream Cheese", 0.71, 0.67),
    _line("Vegan Cream Cheese", 0.71, 0.71),
    _line("Assorted Jams", 0.71, 0.75),
]


LUNCH_LINES = [
    _line("LUNCH SPECIALS | WEDNESDAY JULY 22", 0.22, 0.08, 0.65, 0.05),
    _line("CHEF'S TABLE", 0.04, 0.27, 0.27, 0.04),
    _line("Chicken Scarpariello with Sausage", 0.05, 0.34, 0.27),
    _line("Arancini alla Nonna with Pomodoro Sauce", 0.05, 0.38, 0.31),
    _line("Zesty Roasted Potatoes", 0.05, 0.42, 0.24),
    _line("Garlic Rosemary Cauliflower", 0.05, 0.46, 0.25),
    _line("SALAD & ANTIPASTI", 0.04, 0.58, 0.27, 0.04),
    _line("Tri-Color Quinoa", 0.05, 0.65),
    _line("Saladu Nebbe", 0.05, 0.69),
    _line("Ranch Tomato Salad", 0.05, 0.73),
    _line("Watermelon Feta Salad", 0.05, 0.77),
    _line("Papaya Salad", 0.05, 0.81),
    _line("Buckwheat Soba Noodle Salad", 0.05, 0.85, 0.25),
    _line("HEARTH", 0.36, 0.27, 0.25, 0.04),
    _line("Nashville Hot Chicken Pizza", 0.37, 0.34, 0.25),
    _line("Crazy Caprese Pizza", 0.37, 0.38),
    _line("Roasted Garlic Caprese Grilled Cheese", 0.37, 0.42, 0.31),
    _line("SEASONAL", 0.36, 0.47, 0.25, 0.04),
    _line("Crispy Spring Onion Chicken", 0.37, 0.55, 0.25),
    _line("Edamame, Coriander, & Lime Rice", 0.37, 0.59, 0.28),
    _line("Bell Pepper & Shitake Garlic Stir-Fry", 0.37, 0.63, 0.30),
    _line("Papaya Salad", 0.37, 0.67),
    _line("GRILL", 0.69, 0.27, 0.25, 0.04),
    _line("Marinated Grilled Chicken", 0.70, 0.34, 0.24),
    _line("Crispy Fish Snack Wrap", 0.70, 0.38, 0.22),
    _line("Tempura Avocado Fingers", 0.70, 0.42, 0.24),
    _line("SOUP", 0.69, 0.47, 0.25, 0.04),
    _line("Beef Chili", 0.70, 0.55),
    _line("Squash Bisque", 0.70, 0.59),
    _line("SPECIALITY SANDWICHES", 0.36, 0.70, 0.58, 0.04),
    _line(
        "Buffalo Chicken Wrap - with Carrots, Celery, Blue Cheese Crumbles, Ranch Dressing, &",
        0.37,
        0.78,
        0.57,
    ),
    _line("Romaine", 0.37, 0.81),
    _line(
        "Club Sub - with Ham, Turkey, Roast Beef, Bacon, American Cheese, Lettuce, Tomato & Onion",
        0.37,
        0.85,
        0.58,
    ),
    _line(
        "Chickpea Caesar Wrap - with Roasted Chickpeas, Parmesan, Croutons, Romaine, & Vegetarian",
        0.37,
        0.89,
        0.58,
    ),
    _line("Caesar Dressing", 0.37, 0.92, 0.23),
]


def extract_local_ocr(image_path: Path, meal: Meal) -> OCRResult:
    if meal == Meal.breakfast:
        lines = BREAKFAST_LINES
    else:
        lines = LUNCH_LINES

    return OCRResult(
        image_path=str(image_path),
        provider="local_fixture",
        lines=lines,
    )
