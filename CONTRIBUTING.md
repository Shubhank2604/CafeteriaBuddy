# Contributing

Thanks for helping improve CafeteriaBuddy. Changes should preserve the project's central safety boundary: deterministic allergy and hard-avoid rules must remain authoritative over generated output.

## Local development

1. Install Node.js 20.9+ and Python 3.11+.
2. Create and activate a Python virtual environment.
3. Run `python -m pip install -r requirements.txt`.
4. Run `npm ci`.
5. Run `npm run demo` for a credential-free local environment.

`npm run demo` creates `.env` only when one does not already exist. It never overwrites local configuration.

## Before opening a pull request

Run the same checks used in CI:

```bash
python -m pytest -q
npm test
npm run lint
npm run build
```

Pull requests should explain the user problem, the chosen design, important trade-offs, and how the behavior was tested. Include or update tests for changed behavior. Never commit API keys, databases, uploaded files, or generated OCR artifacts.

For AI-assisted contributions, review the generated code and disclose material AI assistance in the pull-request description. Contributors remain responsible for correctness and licensing.
