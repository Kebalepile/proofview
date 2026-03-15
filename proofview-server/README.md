# ProofView Server

Dependency-free Node.js server for ProofView tracking:
- Email open tracking via image requests
- Link click tracking via redirect
- Document download tracking via streamed attachment
- Events feed for Chrome extension polling
- Message counters and status

## Environment

Create or update `proofview-server/.env`:

```env
PROOFVIEW_PORT=3000
PROOFVIEW_PUBLIC_BASE_URL=https://proofview.onrender.com
PROOFVIEW_SECRET=put-a-long-random-secret-here
PROOFVIEW_OPEN_GRACE_MS=15000
PROOFVIEW_STORAGE_FILE=./data/proofview_db.json
PROOFVIEW_LOGO_FILE=./assets/icon.png
PROOFVIEW_SAMPLE_DOC=./assets/sample.pdf
```

Notes:
- On Render, `PORT` is provided automatically and overrides `PROOFVIEW_PORT`.
- `PROOFVIEW_PUBLIC_BASE_URL` must be the public HTTPS URL that Gmail can reach.
- If you change `PROOFVIEW_PUBLIC_BASE_URL`, re-run the extension sync and reload the unpacked extension.

## Run

```bash
npm start
```

`npm start` also syncs `proofview-extension/config.js` and `proofview-extension/manifest.json` from `proofview-server/.env`.

## Extension Sync Only

```bash
npm run sync-extension
```

After syncing, reload the unpacked Chrome extension in `chrome://extensions`.
