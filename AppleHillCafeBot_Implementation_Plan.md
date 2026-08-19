# Apple Hill Café Menu Bot — High-Level Implementation Plan

**Project:** Daily café menu understanding and personalised Teams recommendations
**Document type:** High-level implementation plan
**Status:** Agreed MVP direction
**Primary stack:** Python, FastAPI, PostgresQL, OCR, LLM enrichment, embeddings, Teams webhook

---

## 1. Executive Summary

The Apple Hill Café Menu Bot will process two daily menu images—one for breakfast and one for lunch—extract the listed food items, understand the meaning and likely characteristics of each item, compare the menu against a user's dietary constraints and meal preferences, and send a personalised Microsoft Teams notification.

The system is intentionally designed as a layered pipeline:

```text
Daily breakfast and lunch images
        ↓
Template-aware OCR and item extraction
        ↓
Canonical food catalogue lookup
        ↓
Reuse known food profile, or enrich a new food using an LLM
        ↓
Reuse or create embeddings
        ↓
Apply dietary restrictions and allergy-related warnings
        ↓
Semantically rank suitable foods against user preferences
        ↓
Generate an explainable verdict
        ↓
Send a Teams notification
```

The central architectural decision is to separate three concerns that initially appear to be one problem:

1. **Menu extraction:** What text appears in the breakfast and lunch images?
2. **Food understanding:** What kind of food is each item, and what might it contain?
3. **User matching:** Is the item allowed, safe enough to recommend, and personally appealing to a particular user?

The stable image templates make menu extraction relatively deterministic. The more complex and valuable parts of the product are the reusable food catalogue, cautious food enrichment, and preference matching.

---

## 2. Product Goal

The MVP should demonstrate that the system can take the next day's menu images and produce a useful personalised recommendation such as:

> **Happy lunch day**
> Roasted Vegetable Flatbread strongly matches your preference for veggie pizza.
> Bean Curd Stir-Fry is also a good match for your interest in tofu dishes.
> Squash Bisque may contain dairy, so please confirm with the café.

The recommendation should answer four practical questions for the user:

1. Are there foods that fit my dietary pattern?
2. Are there any known or possible conflicts with foods I avoid or allergens I selected?
3. Which available foods most closely match what I enjoy eating?
4. Why did the system recommend or reject each item?

---

## 3. MVP Scope

### 3.1 Included in the MVP

The MVP will include:

- Uploading or posting one breakfast image and one lunch image.
- OCR extraction with text coordinates or bounding boxes.
- Template-aware parsing for the known breakfast and lunch layouts.
- Recognition of fixed station headings.
- Handling variable item counts and multi-line food names.
- A persistent canonical food catalogue.
- Reuse of known food profiles and embeddings.
- LLM-based enrichment for genuinely new or changed food items.
- A seven-question user preference questionnaire.
- Rule-based hard filtering for dietary restrictions.
- Conservative handling of allergen-related uncertainty.
- Semantic ranking of eligible foods against meal-specific preferences.
- Dislike-based scoring penalties.
- Explainable recommendation reasons.
- Teams channel notification through an Incoming Webhook.
- Duplicate-image and duplicate-notification protection.
- SQLite persistence.

### 3.2 Explicitly deferred beyond the MVP

The following items should not block the hack-day implementation:

- Real Viva Engage community monitoring.
- True one-to-one Teams messages through Microsoft Graph.
- Enterprise-grade user authentication and authorisation.
- A polished production web interface.
- Medical-grade allergen certification.
- Integration with official café recipes or ingredient databases.
- Historical eating analytics.
- Multi-location or multi-café support.
- A dedicated vector database.
- Distributed job queues or complex cloud infrastructure.
- Automatic correction alerts when a menu is reposted.

These items can be added later without changing the core food catalogue and matching architecture.

---

## 4. Key Assumptions

The plan is based on the following confirmed assumptions:

1. Two images are posted each day: one breakfast menu and one lunch menu.
2. The image designs remain structurally consistent from day to day.
3. The names and number of food items change, but station headings and broad layout remain stable.
4. Food names may repeat on future menus.
5. A repeated food should reuse previous understanding and embeddings wherever appropriate.
6. A food name alone may not reveal whether it is vegetarian, vegan, sweet, savoury, or associated with particular allergens.
7. LLM enrichment is therefore useful, but should be limited to new, changed, or uncertain foods.
8. User preferences will be captured using seven agreed questions.
9. Dietary restrictions and allergies are not the same as likes and dislikes and must be processed differently.
10. The MVP can use a local webhook or upload endpoint instead of a real Viva Engage listener.
11. The MVP can post to a Teams channel instead of sending real personal direct messages.

---

## 5. User Preference Questionnaire

The user profile will be built from seven questions.

### Question 1 — Dietary preference

Single selection:

- **Vegan:** No meat, poultry, seafood, eggs, or dairy.
- **Vegetarian:** No meat, poultry, or seafood; eggs and dairy are permitted.
- **Standard:** No default dietary exclusions.

The selected label will be compiled into explicit machine-readable rules. The system should not rely on the label alone.

### Question 2 — Foods not consumed

Multiple selection:

- No pork
- No beef
- No fish
- No shellfish
- No chicken
- No other meat
- No eggs
- No dairy products
- Other

These choices are treated as strict personal exclusions and apply in addition to the dietary preference.

### Question 3 — Food allergies

Multiple selection:

- Peanuts
- Tree nuts
- Milk
- Eggs
- Fish
- Shellfish
- Wheat
- Soy
- Sesame
- Other

These selections are safety-sensitive. The application must never claim that a food is allergen-free when ingredient evidence is incomplete.

### Question 4 — Other ingredients to flag

Multiple selection or free text:

- Gluten
- Mushrooms
- Added sugar
- Lactose
- Other

This section captures sensitivities, intolerances, and other ingredients the user wants highlighted. These are stored separately from the formal allergy list.

### Question 5 — Ideal breakfast items

Prompt:

> List the breakfast foods you would be excited to eat.

The user may enter specific dishes, ingredients, cuisines, or general styles, for example:

- Masala dosa
- Avocado toast
- Breakfast burrito
- Fruit and yoghurt
- Egg and cheese sandwich
- Savoury breakfast bowls

Each item should be parsed and stored as an individual preference rather than embedding the complete answer as one paragraph.

### Question 6 — Ideal lunch items

Prompt:

> List the lunch foods you would be excited to eat.

Examples:

- Tofu stir-fry
- Vegetable pizza
- Mexican rice
- Guacamole
- Paneer dishes
- Spicy noodles
- Lentil curry

Lunch preferences are primarily compared with lunch items.

### Question 7 — Foods generally disliked

Prompt:

> Are there foods you can eat but generally dislike?

Examples:

- Mushrooms
- Olives
- Cold sandwiches
- Very sweet breakfasts

These are **soft negative preferences**. They lower an item's recommendation score but do not automatically create a safety exclusion.

---

## 6. Preference Signal Types

The questionnaire creates three distinct signal groups.

### 6.1 Hard dietary exclusions

Examples:

- Vegan
- Vegetarian
- No pork
- No eggs

A confirmed conflict leads to exclusion.

### 6.2 Safety-sensitive signals

Examples:

- Peanut allergy
- Milk allergy
- Gluten flag

A confirmed conflict leads to exclusion. A possible conflict prevents a confident recommendation and moves the item into a "check with the café" category.

### 6.3 Soft preference signals

Examples:

- Loves tofu dishes
- Likes vegetable pizza
- Prefers savoury breakfast
- Dislikes cold sandwiches

These signals affect ranking rather than eligibility.

The matching engine must never combine all three groups into one undifferentiated semantic score.

---

## 7. End-to-End Architecture

```text
[POST breakfast/lunch image]
        ↓
Ingestion and duplicate detection
        ↓
OCR with text coordinates
        ↓
Template-aware layout parser
        ↓
Item parser and line-merging logic
        ↓
Daily menu occurrences
        ↓
Canonical food resolution
        ├── Existing food → reuse food profile and embedding
        └── New/changed food → LLM enrichment → create/update embedding
        ↓
Persist menu and food data
        ↓
Load user profile
        ↓
Hard dietary and safety filtering
        ↓
Semantic, lexical, and attribute ranking
        ↓
Verdict and explanation generation
        ↓
Teams Adaptive Card notification
```

The modules should remain independent so that OCR, the LLM provider, the embedding model, or the notification destination can be replaced later.

---

## 8. Image Ingestion and OCR

### 8.1 Ingestion endpoint

The MVP will expose an endpoint such as:

```text
POST /webhook/menu-image
```

Input fields:

- `image`
- `meal`: `breakfast` or `lunch`
- `menu_date`

The endpoint should:

1. Validate the image.
2. Calculate an image hash.
3. Reject or ignore exact duplicates.
4. Save the original image.
5. Create an ingestion record.
6. Start the processing pipeline.

### 8.2 OCR output requirements

The OCR layer must retain more than plain text. Each detected line should include:

```json
{
  "text": "Roasted Vegetable Flatbread",
  "x": 0.37,
  "y": 0.46,
  "width": 0.23,
  "height": 0.03,
  "confidence": 0.98
}
```

Coordinates should be normalised between `0` and `1`, making the parser resilient to image resizing.

### 8.3 OCR responsibilities

The OCR module should only:

- Read visible text.
- Return lines in reading order.
- Preserve bounding boxes.
- Preserve provider confidence.
- Store the raw provider response for debugging.

It should not decide which text is a station, food item, description, or allergen.

---

## 9. Template-Aware Menu Parsing

Because the breakfast and lunch images use stable structures, the parser should be deterministic wherever possible.

### 9.1 Breakfast template

Expected stations:

1. Fruit and Yogurt Bar
2. Breakfast Bar
3. Cereal
4. Toast and Spreads

The parser will:

- Ignore the header and footer areas.
- Detect the known station headings using fuzzy matching.
- Assign lines between one station heading and the next to that station.
- Merge wrapped item lines.
- Preserve source text and OCR confidence.

### 9.2 Lunch template

Expected stations:

1. Chef's Table
2. Salad & Antipasti
3. Hearth
4. Seasonal
5. Grill
6. Soup
7. Speciality Sandwiches

The Speciality Sandwiches section should use a specialised parsing rule because entries may contain both a name and a longer description.

Example:

```text
Buffalo Chicken Wrap – with Carrots, Celery, Blue Cheese Crumbles...
```

Structured result:

```json
{
  "name": "Buffalo Chicken Wrap",
  "description": "with Carrots, Celery, Blue Cheese Crumbles...",
  "station": "SPECIALITY SANDWICHES"
}
```

### 9.3 Wrapped-line handling

A major extraction risk is deciding whether two lines are separate items or one wrapped item.

The item parser should consider:

- Similar horizontal alignment.
- Small vertical distance.
- Whether the first line appears grammatically incomplete.
- Whether the second line resembles a continuation.
- Whether either line matches a station heading.
- Section-specific rules.

### 9.4 Parsing validation

Every parsed image should produce a validation summary:

```json
{
  "status": "success",
  "template": "lunch",
  "headings_found": 7,
  "headings_expected": 7,
  "items_found": 24,
  "unassigned_lines": [],
  "warnings": []
}
```

If headings are missing or many lines are unassigned, the image should be flagged for fallback processing or review rather than silently producing a low-quality menu.

---

## 10. Menu Occurrences and Canonical Foods

A daily menu item and a reusable food profile are not the same object.

### 10.1 Menu occurrence

Represents what appeared on a specific day:

```text
Date: Tuesday
Meal: Lunch
Station: Hearth
Raw name: Veggie Flatbread
Description: Roasted vegetables, tomato sauce, mozzarella
```

### 10.2 Canonical food

Represents reusable knowledge:

```text
Canonical name: Vegetable Flatbread
Aliases:
- Veggie Flatbread
- Vegetarian Flatbread
- Roasted Vegetable Flatbread

Attributes:
- Food category: pizza/flatbread
- Taste: savoury
- Vegetarian: likely
- Possible allergens: wheat, milk
```

The canonical food catalogue is central to reducing repeated processing and making classifications consistent over time.

---

## 11. Canonical Food Resolution

For every extracted item, the system should determine whether it is already known.

### 11.1 Resolution sequence

```text
Normalise item text
    ↓
Exact canonical-name or alias lookup
    ↓
Lexical/fuzzy lookup
    ↓
Semantic nearest-neighbour lookup
    ↓
Resolution decision
```

Possible resolution results:

- `EXACT_KNOWN`
- `KNOWN_ALIAS`
- `KNOWN_VARIANT`
- `POSSIBLE_MATCH`
- `NEW_FOOD`

### 11.2 Conservative merging

Automatic merging should be conservative. A false merge can repeatedly reuse an incorrect dietary profile.

Examples that may be safe to merge:

- Veggie Flatbread
- Veggie Flat Bread
- Vegetable Flatbread

Examples that may require caution:

- House Curry
- Seasonal Soup
- Chef's Special
- Harvest Bowl

The same name can describe different recipes on different days. Therefore, resolution should consider:

```text
normalised name
+ description
+ meal
+ station
```

### 11.3 Daily evidence overrides general assumptions

A canonical profile may say that a dish is usually vegetarian, but the current day's description may explicitly mention chicken. Current menu evidence must always override catalogue assumptions.

---

## 12. LLM Food Enrichment

### 12.1 When to call the LLM

The LLM should be called only when:

- A food is genuinely new.
- A known food has a materially changed description.
- A previous food profile has low confidence.
- A possible catalogue match needs validation.
- The food name is too ambiguous for deterministic rules.

Known and unchanged foods should reuse their stored profiles without another LLM call.

### 12.2 LLM input

The enrichment prompt should include all available context:

```json
{
  "name": "Harvest Bowl",
  "description": "Sweet potato, farro, kale, maple dressing",
  "meal": "lunch",
  "station": "Seasonal",
  "explicit_menu_markers": []
}
```

### 12.3 Required structured output

The LLM should return validated JSON containing:

- Canonical name.
- Aliases.
- Food categories.
- Meal suitability.
- Sweet/savoury/spicy profile.
- Likely cuisine or style.
- Explicit ingredients.
- Inferred ingredients.
- Dietary classification.
- Meat, fish, egg, and dairy indicators.
- Confirmed allergens.
- Possible allergens.
- Confidence.
- Warnings.

### 12.4 Evidence levels

The system must distinguish:

- **Confirmed:** Directly supported by the menu name or description.
- **Strongly inferred:** Very likely from the dish name or common preparation.
- **Possible:** Plausible but not confirmed.
- **Unknown:** Insufficient evidence.

Example:

```text
Chicken Parmesan
→ chicken is confirmed

Mac and Cheese
→ dairy and wheat are likely, but recipe-specific confirmation is absent

House Curry
→ dietary and allergen status may be unknown
```

### 12.5 Safety boundary

The LLM can provide useful classification and warnings, but cannot certify that a café item is allergen-free. Notification language must reflect this limitation.

Approved phrasing:

- "Appears compatible with your preferences."
- "May contain dairy; please confirm with the café."
- "Ingredient information is incomplete."

Avoid:

- "This is safe for your allergy."
- "Guaranteed dairy-free."

---

## 13. Embedding Strategy and Cache

### 13.1 What receives an embedding

Embeddings should be created for:

- Canonical food profiles.
- Individual ideal breakfast items.
- Individual ideal lunch items.
- Individual disliked foods or preference statements.

### 13.2 Do not embed only the raw food name

The canonical-food embedding should use a descriptive representation:

```text
Vegetable flatbread. Savoury lunch item. Pizza-style flatbread
with roasted vegetables, tomato sauce, and likely cheese.
Vegetarian. Italian-American style. Hearth station.
```

This improves matches with user preferences such as:

```text
I enjoy veggie pizza and warm savoury lunches.
```

### 13.3 Cache policy

For a known and unchanged food:

- Reuse the food profile.
- Reuse the embedding.
- Do not call the LLM.
- Do not regenerate the embedding.

For a new food:

1. Enrich it once.
2. Build a canonical representation.
3. Generate one embedding.
4. Save the profile, aliases, and vector.

For a changed description:

- Reuse the canonical entity where appropriate.
- Store today's evidence separately.
- Re-enrich only the changed context if necessary.

### 13.4 Versioning

Every embedding should store:

- Embedding model name.
- Embedding model version.
- Embedded-text hash.
- Creation date.

Vectors from different embedding models should not be compared directly.

LLM enrichment should similarly record a prompt/schema version so low-confidence or outdated profiles can be refreshed later.

### 13.5 Storage choice

SQLite is sufficient for the MVP. The expected number of distinct foods and preferences is small enough to load vectors into memory and calculate cosine similarity without a dedicated vector database.

---

## 14. Matching Engine

The matching engine should be staged and explainable.

### Stage 1 — Compile effective user restrictions

Combine:

- Dietary preference.
- Foods not consumed.
- Allergies.
- Other flagged ingredients.

The strictest selected rule wins.

Example:

```text
Vegetarian + No eggs
→ no meat, poultry, seafood, or eggs
```

### Stage 2 — Hard exclusions

Exclude an item when a confirmed attribute conflicts with:

- Dietary preference.
- Foods not consumed.
- Confirmed allergens.

Example:

```text
User: Vegetarian
Item: Chicken Parmesan
Result: Excluded
```

### Stage 3 — Uncertainty handling

If the item may contain an allergen or prohibited ingredient but evidence is incomplete, it should not be strongly recommended.

Place it under:

> Check with the café

Example:

```text
User: Milk allergy
Item: Squash Bisque
Evidence: Dairy is common in bisque but not explicitly listed
Result: Uncertain; do not present as safe
```

### Stage 4 — Meal-specific preference matching

Breakfast items should primarily be compared with ideal breakfast preferences. Lunch items should primarily be compared with ideal lunch preferences.

This avoids semantically valid but contextually weak recommendations.

### Stage 5 — Positive ranking

For eligible items, calculate a score using:

- Exact name or ingredient overlap.
- Fuzzy lexical similarity.
- Semantic embedding similarity.
- Food-category compatibility.
- Cuisine or style compatibility.
- Sweet/savoury/spicy compatibility.
- Meal and station context.

A reasonable initial weighting is:

```text
Semantic preference similarity       45%
Structured attribute compatibility   25%
Lexical or ingredient similarity     20%
Meal/station context                  10%
```

These weights should remain configurable and should be tuned using real examples.

### Stage 6 — Dislike penalty

A food the user can consume but generally dislikes should receive a negative adjustment.

Example:

```text
Ideal lunch: vegetable pizza
Dislike: mushrooms
Menu item: mushroom vegetable flatbread
```

The flatbread may still be eligible, but it should rank below a vegetable flatbread without mushrooms.

### Stage 7 — Verdict generation

The output should separate items into:

- **Exciting matches**
- **Other suitable options**
- **Check with the café**
- **Not suitable**

A "happy day" should be based on the presence of meaningful, high-quality meal options rather than a simple count of side dishes.

---

## 15. Explainability Requirements

Every recommended item should carry a reason record:

```json
{
  "item": "Roasted Vegetable Flatbread",
  "matched_preference": "vegetable pizza",
  "semantic_score": 0.89,
  "lexical_score": 0.72,
  "attribute_score": 0.84,
  "dislike_penalty": 0.00,
  "constraint_status": "allowed",
  "reason": "Strong semantic match for vegetable pizza"
}
```

This information is useful for:

- User trust.
- Debugging.
- Score tuning.
- Demonstrating the value of semantic matching.
- Understanding incorrect recommendations.

---

## 16. Notification Design

The MVP should use a Teams Incoming Webhook and an Adaptive Card.

The card should contain:

1. Overall breakfast and/or lunch verdict.
2. Best matches.
3. Brief reason for each match.
4. Other suitable foods.
5. Items requiring ingredient confirmation.
6. A compact disclaimer for allergen uncertainty.

Example structure:

```text
Happy lunch day

You'll probably enjoy:
- Roasted Vegetable Flatbread — similar to your preference for veggie pizza
- Bean Curd Stir-Fry — matches your interest in tofu dishes

Also available:
- Cilantro Lime Rice
- Garden Salad

Check with the café:
- Squash Bisque — may contain dairy
```

True one-to-one delivery can later replace the channel adapter without changing the matching engine.

---

## 17. Persistence Model

### 17.1 `menu_ingestions`

Tracks image processing and revisions:

```text
id
image_hash
menu_date
meal
revision
status
raw_image_path
ocr_response_path
parser_version
is_active
created_at
completed_at
error_message
```

### 17.2 `menu_occurrences`

Stores daily menu appearances:

```text
id
ingestion_id
menu_date
meal
station
raw_name
raw_description
normalised_name
food_id
resolution_method
resolution_confidence
daily_attributes
ocr_confidence
```

### 17.3 `foods`

Stores reusable canonical food profiles:

```text
id
canonical_name
food_categories
taste_profile
dietary_profile
ingredients
confirmed_allergens
possible_allergens
cuisine
confidence
enrichment_version
created_at
updated_at
```

### 17.4 `food_aliases`

```text
id
food_id
alias
normalised_alias
source
```

### 17.5 `food_embeddings`

```text
id
food_id
embedding
embedding_model
embedding_version
embedded_text_hash
created_at
```

### 17.6 `users`

```text
id
teams_user_id
name
active
created_at
```

### 17.7 `user_profiles`

Stores original questionnaire answers and compiled rules:

```text
id
user_id
dietary_pattern
foods_not_consumed
allergens
other_avoidances
ideal_breakfast_items
ideal_lunch_items
disliked_foods
compiled_restrictions
updated_at
```

### 17.8 `preference_embeddings`

```text
id
user_id
meal
preference_type
preference_text
embedding
embedding_model
embedding_version
```

### 17.9 `notifications_sent`

```text
id
user_id
menu_date
meal
ingestion_id
notification_type
destination
sent_at
```

A unique constraint should prevent duplicate notifications for the same user, date, meal, and notification type.

---

## 18. Recommended Repository Structure

```text
hackDay/
  app.py
  config.py
  db.py
  models.py

  pipeline/
    orchestrator.py
    ingest.py
    ocr.py
    layout_parser.py
    item_parser.py
    catalogue.py
    enrich.py
    embeddings.py
    match.py
    notify.py

  adapters/
    azure_ocr.py
    llm_provider.py
    local_embeddings.py
    teams_webhook.py
    local_menu_source.py

  templates/
    breakfast.yaml
    lunch.yaml

  cards/
    menu_verdict.py

  scripts/
    seed_user.py
    post_image.py
    trigger_notify.py
    rebuild_embeddings.py

  tests/
    fixtures/
      images/
      ocr/
      parsed_menus/
      user_profiles/
    test_layout_parser.py
    test_item_parser.py
    test_catalogue.py
    test_enrichment.py
    test_matching.py
    test_idempotency.py
    test_pipeline.py

  requirements.txt
  README.md
```

---

## 19. Module Responsibilities

### `app.py`

- HTTP validation.
- Upload endpoint.
- User-profile endpoints.
- Manual notification trigger.
- Health checks.

### `orchestrator.py`

- Coordinates the complete workflow.
- Tracks stage status and errors.
- Ensures modules remain decoupled.

### `ingest.py`

- Image hashing.
- Duplicate detection.
- File storage.
- Revision management.

### `ocr.py`

- Defines the OCR interface.
- Returns text, coordinates, and confidence.

### `layout_parser.py`

- Detects the breakfast or lunch structure.
- Finds station headings.
- Assigns lines to sections.

### `item_parser.py`

- Merges wrapped lines.
- Separates names and descriptions.
- Produces structured menu occurrences.

### `catalogue.py`

- Normalises food names.
- Finds aliases and candidate matches.
- Resolves canonical food identities.

### `enrich.py`

- Runs structured LLM enrichment.
- Distinguishes confirmed and inferred facts.
- Records confidence and warnings.

### `embeddings.py`

- Generates and caches embeddings.
- Validates embedding versions.
- Performs vector similarity search.

### `match.py`

- Compiles user restrictions.
- Applies exclusions and warnings.
- Calculates positive and negative preference scores.
- Produces explainable rankings.

### `notify.py`

- Sends a domain-level verdict to a notification adapter.

### `cards/menu_verdict.py`

- Converts a verdict into Adaptive Card JSON.
- Contains no business logic.

---

## 20. Delivery Phases

### Phase 1 — Lock schemas and contracts

Deliverables:

- Pydantic/SQLModel definitions.
- Questionnaire schema.
- Canonical food schema.
- Menu occurrence schema.
- Match result schema.

Success condition:

- Every module agrees on the same input and output shapes.

### Phase 2 — Build image extraction

Deliverables:

- Breakfast template.
- Lunch template.
- OCR adapter.
- Heading detection.
- Wrapped-line handling.
- Parsed JSON for the two sample images.

Success condition:

```text
breakfast.jpeg → accurate breakfast.json
lunch.jpeg     → accurate lunch.json
```

### Phase 3 — Build the food catalogue

Deliverables:

- Normalisation rules.
- Alias lookup.
- Fuzzy candidate search.
- Semantic candidate search.
- Conservative resolution logic.

Success condition:

- Repeated foods are linked to existing canonical entities.
- Ambiguous foods are not incorrectly merged.

### Phase 4 — Add LLM enrichment

Deliverables:

- Structured prompt and schema.
- Validation and one repair attempt.
- Confirmed/inferred separation.
- Confidence and warning fields.

Success condition:

- New foods receive consistent structured profiles.
- Known foods do not trigger unnecessary LLM calls.

### Phase 5 — Add embedding cache

Deliverables:

- Food embeddings.
- Preference embeddings.
- Model/version metadata.
- Similarity service.

Success condition:

- Known foods and unchanged preferences reuse cached vectors.

### Phase 6 — Implement the seven-question profile

Deliverables:

- API, basic form, or seed script.
- Original-answer persistence.
- Compiled restriction rules.
- Individual preference records.

Success condition:

- A complete user profile can be created and reloaded.

### Phase 7 — Build the matching engine

Deliverables:

- Hard exclusions.
- Allergy uncertainty path.
- Meal-specific semantic matching.
- Structured-attribute scoring.
- Dislike penalties.
- Explainable verdicts.

Success condition:

- The system ranks suitable foods sensibly for multiple test profiles.

### Phase 8 — Build Teams notification

Deliverables:

- Adaptive Card renderer.
- Teams webhook adapter.
- Idempotent send records.

Success condition:

- A real Teams message appears after processing a menu.

### Phase 9 — Add operational orchestration

Deliverables:

- Ingestion and notification service functions.
- Manual trigger endpoint.
- Scheduler integration.
- Failure logging.

Success condition:

- The same pipeline supports immediate demos and scheduled use.

### Phase 10 — Harden the demonstration

Deliverables:

- Positive-day scenario.
- Poor-match scenario.
- Dietary-conflict scenario.
- Allergen-uncertainty scenario.
- Repeated-food scenario.
- New-food scenario.
- Duplicate-upload scenario.

Success condition:

- The demo remains reliable even when the input is not a perfect happy path.

---

## 21. Main Bottlenecks and Resolutions

### Bottleneck 1 — Wrapped and ambiguous OCR text

**Risk:** Multi-line names may become separate foods, or headings may be misread.

**Resolution:**

- Use bounding boxes.
- Use known template headings.
- Apply section-specific line-merging rules.
- Validate heading counts and unassigned lines.
- Preserve raw OCR for debugging.

### Bottleneck 2 — Canonical food resolution

**Risk:** Similar names may be wrongly merged, causing incorrect attributes to be reused.

**Resolution:**

- Use exact aliases before semantic matching.
- Include description, meal, and station in the resolution fingerprint.
- Use conservative thresholds.
- Validate uncertain matches with an LLM.
- Retain daily evidence separately.

### Bottleneck 3 — Food classification reliability

**Risk:** Food names may not reveal meat, dairy, eggs, taste profile, or allergens.

**Resolution:**

- Use deterministic rules for explicit ingredients.
- Use an LLM for new and ambiguous foods.
- Separate confirmed, inferred, possible, and unknown facts.
- Store confidence and warnings.
- Never present inferred allergen information as guaranteed.

### Bottleneck 4 — Semantic matching quality

**Risk:** Embeddings may return plausible but personally weak matches.

**Resolution:**

- Combine semantic similarity with lexical and structured attributes.
- Compare breakfast with breakfast preferences and lunch with lunch preferences.
- Apply dislike penalties.
- Preserve explanation data.
- Tune configurable weights using real menus.

### Bottleneck 5 — Repeated processing cost

**Risk:** Repeated foods could trigger unnecessary LLM and embedding calls.

**Resolution:**

- Build a canonical food catalogue.
- Cache complete food profiles, not only vectors.
- Cache preference embeddings.
- Use model and prompt versioning.
- Reprocess only new, changed, low-confidence, or outdated records.

### Bottleneck 6 — Microsoft integration complexity

**Risk:** Viva Engage and direct Teams messages may consume most of the hack-day effort.

**Resolution:**

- Use local image upload for the MVP.
- Use a Teams Incoming Webhook to a private channel.
- Keep source and notification adapters swappable.
- Defer Graph API integration.

---

## 22. Failure Handling

| Failure | Expected behaviour |
|---|---|
| Exact duplicate image | Ignore or return existing ingestion record |
| Corrected image for same meal/date | Create a new revision and mark the previous one inactive |
| Missing menu image | Skip notification and record the missing input |
| Low OCR confidence | Retry once or flag for review |
| Missing station heading | Mark parsing as incomplete and invoke fallback handling |
| Invalid LLM JSON | Validate, perform one repair pass, then fail visibly |
| Low enrichment confidence | Preserve food as uncertain and avoid strong recommendations |
| Embedding-version mismatch | Regenerate before comparison |
| Teams webhook failure | Record failure and allow controlled retry |
| User has no profile | Send or display onboarding guidance rather than a verdict |

---

## 23. Testing Strategy

### 23.1 Golden image tests

Maintain a fixed set of menu images with manually verified expected outputs.

Include:

- Clean breakfast menu.
- Clean lunch menu.
- Long wrapped food names.
- Different item counts.
- OCR punctuation errors.
- Missing or shifted headings.
- Sandwiches with descriptions.

### 23.2 Catalogue tests

Test:

- Exact alias matching.
- Fuzzy spelling variants.
- Semantic synonyms.
- Similar but distinct dishes.
- Same name with changed description.

### 23.3 Enrichment tests

Test:

- Explicit meat item.
- Obvious vegetarian item.
- Ambiguous dish name.
- Likely dairy-containing dish.
- Unknown allergen state.
- Invalid LLM output.

### 23.4 Matching tests

Create several user profiles:

- Vegan user.
- Vegetarian user who avoids eggs.
- Standard user with no pork.
- User with a milk allergy.
- User who loves tofu and veggie pizza.
- User who dislikes mushrooms.

Verify eligibility, uncertainty, ranking, and explanations.

### 23.5 Idempotency tests

Verify:

- Same image is not processed twice.
- Same notification is not sent twice.
- Corrected menus create revisions.
- Stored menus can be rematched without rerunning OCR.

---

## 24. MVP Success Criteria

The MVP is complete when it can reliably demonstrate all of the following:

1. Accept one breakfast and one lunch image.
2. Extract the correct stations and food items.
3. Handle variable item counts and wrapped lines.
4. Recognise previously seen foods.
5. Reuse existing food profiles and embeddings.
6. Enrich a genuinely new food once.
7. Store and apply all seven user answers.
8. Exclude confirmed dietary conflicts.
9. Handle possible allergen conflicts conservatively.
10. Rank breakfast and lunch items semantically.
11. Apply soft dislike penalties.
12. Explain why an item was recommended.
13. Send a clear Teams Adaptive Card.
14. Avoid duplicate processing and duplicate notifications.
15. Record failures in a way that can be diagnosed.

---

## 25. Recommended Immediate Next Step

The next implementation step should be to define and approve the following four schemas:

1. `MenuOccurrence`
2. `CanonicalFoodProfile`
3. `UserPreferenceProfile`
4. `UserMenuVerdict`

After those contracts are fixed, development should begin with the first concrete technical milestone:

```text
breakfast.jpeg → accurate breakfast.json
lunch.jpeg     → accurate lunch.json
```

Once extraction is stable, the food catalogue, enrichment, embeddings, and matching layers can be added incrementally without redesigning the entire pipeline.

---

## 26. Final Delivery Sequence

```text
1. Approve schemas and database model
2. Implement breakfast/lunch extraction
3. Implement canonical food catalogue
4. Add LLM enrichment for new foods
5. Add embedding generation and cache
6. Implement the seven-question user profile
7. Implement hard filtering and uncertainty handling
8. Implement semantic ranking and dislike penalties
9. Generate explainable verdicts
10. Send Teams Adaptive Cards
11. Add idempotency, scheduling, and failure recovery
12. Harden the complete demo
```

This sequence keeps the MVP focused on the real product value: understanding recurring café foods, learning what each user can and wants to eat, and delivering a useful recommendation without repeatedly paying the cost of understanding the same food.
