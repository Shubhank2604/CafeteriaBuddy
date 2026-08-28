# Security policy

## Supported version

Security fixes target the current `main` branch.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** flow when it is available. If private reporting is unavailable, open a minimal issue requesting a private contact channel; do not include exploit details, credentials, or personal data in a public issue.

Include the affected component, reproduction conditions, likely impact, and any suggested mitigation. Please allow reasonable time for investigation before public disclosure.

## Secrets and sensitive data

Never commit `.env`, API keys, database files, uploaded menu images, OCR responses, or employee preference data. Use `.env.example` for deployment configuration and `.env.demo.example` for credential-free demonstrations.

## Food-safety boundary

CafeteriaBuddy is decision support, not a medical or allergen-certification system. Ingredient inference can be incomplete. Uncertain items must continue to be surfaced as cautions and confirmed with the cafeteria.
