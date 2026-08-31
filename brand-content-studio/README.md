# Brand Content Studio

Standalone static app for the marketing-site spec.

## Run locally

From this folder:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

`http://127.0.0.1:4173/#/`

## Notes

- This app is intentionally separate from Website DNA Extractor.
- It uses hash-based routing so it works as a static site without framework rewrites.
- Styling follows the Minfo style guide color and typography system.
