# CafeteriaBuddy

CafeteriaBuddy turns cafeteria menu images into structured breakfast and lunch menus, then gives each employee a personalized food score, plate ideas, and item-level recommendations.

It combines a Next.js application with a Python extraction pipeline, Azure Document Intelligence for layout-aware OCR, Gemini for enrichment and optional recommendation polishing, and local SQLite storage.

![CafeteriaBuddy personalized food score](Food%20Score.png)

## What it does

### Employees

- Register and maintain dietary preferences, allergies, dislikes, goals, and temporary restrictions.
- Browse daily and weekly menus with timezone-aware date navigation.
- See a personal food-fit score, recommended plates, suitable dishes, cautions, and skips.
- Understand why a dish was recommended or excluded.
- Provide item-level feedback and optionally receive email digests.

### Cafe administrators

- Upload separate breakfast and lunch images for a selected date.
- Extract station and dish information with Azure Document Intelligence.
- Review and edit dish names and tags before employees use the menu.
- Preview recommendations for different employee profiles.
- Manage administrator access and trigger digest workflows.

### Processing pipeline

- Validates image files and tracks menu revisions.
- Parses known breakfast and lunch layouts by station.
- Resolves recurring dishes into a canonical food catalogue with aliases.
- Enriches foods with categories, ingredients, dietary attributes, and allergens.
- Applies deterministic allergy and hard-avoid rules before optional Gemini polishing.
- Produces compact OCR and parsed-menu artifacts for auditing.

## Architecture

```text
Admin upload
    |
    v
Next.js API route
    |
    v
Python menu bridge
    |
    +--> Azure Document Intelligence --> layout/item parser
    |                                      |
    |                                      v
    +--> canonical food catalogue <---- structured menu
                                           |
                                           v
Employee preferences --> safety rules --> personalized result --> Today UI
```

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web application | Next.js 16, React 19 | UI, authentication, admin tools, API routes, feedback, and digests |
| Extraction | Python, FastAPI, SQLModel | Image ingestion, OCR orchestration, parsing, catalogue resolution, and standalone APIs |
| OCR | Azure Document Intelligence | Layout-aware text and coordinate extraction |
| AI | Gemini | Food enrichment, preference interpretation, and optional recommendation copy polishing |
| Storage | SQLite | Separate web and extraction/catalogue databases under `data/` |

The web app invokes Python directly during menu uploads. You do not need to run the FastAPI server for normal use.

## Prerequisites

- Node.js 20.9 or newer
- Python 3.11 or newer recommended
- An Azure Document Intelligence resource
- A Gemini API key

## Quick start

```powershell
git clone https://github.com/Shubhank2604/CafeteriaBuddy.git
cd CafeteriaBuddy

py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

npm install
Copy-Item .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A successful start prints a local URL and `Ready` in the terminal.

If PowerShell blocks `npm.ps1`, run:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

## Environment configuration

Update `.env` before using live extraction or AI features. Never commit this file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | Yes | Signs application sessions; use a long random value |
| `ADMIN_EMAIL` | Yes | Seeds the local cafe administrator account |
| `ADMIN_PASSWORD` | Yes | Password for the seeded administrator; there is no source-code fallback |
| `OCR_PROVIDER` | Yes | Set to `document_intelligence` for live menu extraction |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Yes | Azure resource endpoint |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Yes | Azure resource key |
| `GEMINI_API_KEY` | Recommended | Enables enrichment, preference interpretation, and match polishing |
| `GEMINI_MODEL` | Recommended | Defaults to `gemini-3-flash-preview` |
| `PYTHON_EXECUTABLE` | Yes on Windows venv | Use `.venv/Scripts/python.exe` |
| `SMTP_*` and `EMAIL_FROM` | No | Enables scheduled email digests |

Generate an authentication secret with Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

See [.env.example](.env.example) for the complete configuration template.

## Posting a menu

1. Sign in with the configured administrator email and password.
2. Open **Admin** and select **Post**.
3. Select the date and choose **Breakfast** or **Lunch**.
4. Upload a JPEG or PNG image.
5. Review the extracted dishes under **Extraction** and correct names or tags if needed.
6. Upload the other meal. Existing breakfast items are preserved when lunch is posted, and vice versa.
7. Open **Today** with an employee account to generate the personalized result.

Source images are organized as `images/YYYYMMDD/breakfast.ext` and `images/YYYYMMDD/lunch.ext`. Generated databases, OCR responses, parsed artifacts, and browser upload copies stay in ignored runtime directories.

## Useful commands

```powershell
# Run the web application
npm run dev

# Run all automated checks
.\.venv\Scripts\python.exe -m pytest
npm test
npm run lint
npm run build

# Run the standalone Python API when testing pipeline endpoints
.\.venv\Scripts\python.exe -m uvicorn app:app --reload

# Audit and enrich canonical foods
.\.venv\Scripts\python.exe scripts/audit_catalogue.py
.\.venv\Scripts\python.exe scripts/enrich_foods.py --limit 3 --apply
```

## Project structure

```text
adapters/       Azure Document Intelligence, local OCR, and Gemini adapters
pipeline/       Ingestion, parsing, catalogue, enrichment, matching, and profiles
scripts/        Processing, audit, cleanup, enrichment, and demo utilities
src/app/        Next.js pages and API routes
src/components/ Shared user-interface components
src/lib/        Authentication, database, matching, Gemini, email, and Python bridge
templates/      Breakfast and lunch station-layout definitions
tests/          Python pipeline test suite
images/         Versioned OCR fixtures and date-based source menus
```

## Data and security

- `data/menu-match.db` stores web users, preferences, menus, matches, and feedback.
- `data/apple_hill_cafe_bot.db` stores ingestions, occurrences, canonical foods, aliases, and enrichments.
- Allergy and hard-avoid decisions are enforced by deterministic rules; Gemini cannot promote a hard-excluded dish.
- `.env`, databases, OCR artifacts, uploaded runtime images, `.next`, virtual environments, and `node_modules` are excluded from Git.

This is an MVP. Ingredient and allergen inference can be incomplete, so uncertain items are surfaced as cautions and should be confirmed with the cafe.
