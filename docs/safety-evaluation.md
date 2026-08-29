# Restriction-rule evaluation

The credential-free benchmark contains 36 hand-labeled dish/restriction pairs: 20 conflicts and 16 non-conflicts. It covers dairy, legumes, nuts, shellfish, fish, gluten, eggs, pork, beef, chicken, word-boundary traps, free-from labels, and ambiguous dish names.

| Metric | Baseline |
| --- | ---: |
| Recall | 1.000 |
| Precision | 0.714 |
| False negatives | 0 |
| False positives | 8 |

The rule set is deliberately conservative: uncertain matches become `avoid`, so recall is prioritized over precision. The remaining false positives are visible in the dataset rather than hidden. Examples include `Peanut-Free Cookie`, `Butter Lettuce Salad`, and `Chicken of the Woods Mushroom`.

This benchmark measures string/tag restriction matching only. It does not establish medical safety, ingredient completeness, OCR accuracy, or whether upstream dish tags are correct. Users must still confirm uncertain ingredients with the cafe.

Run it with the normal web test suite:

```bash
npm test
```
