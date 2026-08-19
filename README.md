# Apple Hill Cafe Menu Bot

One local MVP for cafeteria menu extraction and personalized meal guidance. The Next.js app provides authentication, preferences, admin review, menu browsing, matching, feedback, and digest features. Its admin upload flow invokes the Python Azure Document Intelligence pipeline for template-aware OCR, canonical food resolution, and catalogue enrichment.

## Architecture

- **Next.js:** employee and cafe-admin UI, API routes, authentication, matching safety rules, feedback, and email digests.
- **Python pipeline:** image validation, Azure Document Intelligence OCR, breakfast/lunch layout parsing, canonical catalogue, Gemini food enrichment, embeddings, and detailed verdict APIs.
- **Gemini:** direct Gemini REST integration for preference interpretation, optional match copy polishing, sample-image extraction, and Python catalogue enrichment.
- **SQLite:** `data/menu-match.db` for web data and `data/apple_hill_cafe_bot.db` for extraction/catalogue data. They remain separate because their existing user schemas are incompatible.

## Setup

```powershell
python -m pip install -r requirements.txt
npm install
Copy-Item .env.example .env
npm run dev
```

Add the Azure Document Intelligence endpoint/key and Gemini key to `.env`, then open [http://localhost:3000](http://localhost:3000).

The Next.js app calls Python directly during admin uploads; running FastAPI separately is not required. The standalone API remains available for pipeline testing:

```powershell
python -m uvicorn app:app --reload
```

## Menu workflow

1. Sign in as a cafe admin.
2. Choose the menu date and either Breakfast or Lunch.
3. Upload a JPEG or PNG menu image.
4. Azure Document Intelligence extracts layout lines; the Python parser validates stations and items.
5. The result is merged into that date without deleting the other meal.
6. Review and edit extracted items in the admin suite.
7. Employees see personalized recommendations with hard-allergy safety rules applied before optional Gemini polishing.

Source images use `images/YYYYMMDD/breakfast.ext` and `images/YYYYMMDD/lunch.ext`. Generated OCR, parsed artifacts, databases, and browser upload copies live under ignored runtime directories.

## Main features

- Employee registration, onboarding, preferences, temporary restrictions, and account settings
- Daily and weekly menu views with timezone-aware navigation
- Rules-first personalized matching with allergy and hard-avoid safeguards
- Optional Gemini preference interpretation and match polishing with local fallback
- Admin upload, extraction review, inline item/tag edits, preview, and user-role management
- Canonical food catalogue, aliases, fuzzy resolution, Gemini enrichment, and audit/cleanup scripts
- Feedback, in-app digest history, optional SMTP email digests, and scoped match invalidation
- FastAPI endpoints and CLI scripts for independent pipeline operation

## Verification

```powershell
python -m pytest
npm test
npm run lint
npm run build
```

Never commit `.env`, generated databases, OCR artifacts, uploaded runtime images, `.next`, or `node_modules`.
