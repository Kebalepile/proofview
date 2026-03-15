# ProofView

ProofView is a Chrome extension plus a small Node.js server for tracking email opens, link clicks, and document downloads.

The sender-side experience is built around Gmail on the web:
- add a `Track Email` button inside Gmail compose
- inject a tracking pixel into the outgoing message
- rewrite links to tracked redirect URLs
- poll the ProofView server for open events
- show tracked messages, open counts, and timestamps in the extension popup

## Project Structure

```text
proofview/
|- proofview-extension/
|  |- assets/icons/
|  |- background/service_worker.js
|  |- content/gmail_content.js
|  |- content/gmail_content.css
|  |- popup/popup.html
|  |- popup/popup.js
|  |- popup/popup.css
|  |- shared/config.js
|  `- manifest.json
|- proofview-server/
|  |- assets/
|  |- data/
|  |- scripts/sync-extension-config.js
|  |- src/
|  `- package.json
`- README.md
```

## How It Works

1. The Gmail content script injects a `Track Email` button into compose windows.
2. When the user clicks it, the extension asks the server to mint tracking URLs for that draft.
3. The email body gets a tracking pixel and tracked link URLs.
4. When the user sends, the extension marks the message as sent.
5. When the tracking pixel is requested, the server records an open event.
6. The extension service worker polls the server and updates the popup UI with status, open count, first open, and latest open.

## Current Features

- Gmail compose integration
- tracked, sent, and opened status
- single tick / double tick style status in the popup
- subject line capture from the draft
- total open count
- first open timestamp
- latest open timestamp
- per-message delete
- delete all tracked messages
- branded popup UI and extension icon set
- env-driven server URL sync into the extension


## Current Limitations

- Sender-side UI integration is Gmail web only right now.
- Open tracking still relies on image loading, so Gmail image proxying can make opens approximate rather than perfect.
- If the backend uses only local file storage, hosted free tiers may lose history on restart or redeploy.
- Recipient-level open attribution is not yet implemented for multi-recipient sends. Current open counts are per tracked email, not per recipient.
- The Gmail row badge matching is subject-based, so identical subjects can be ambiguous.


## Future Improvements

- move storage from JSON file to MongoDB
- add authentication and user accounts
- support Outlook web compose integration
- support recipient-level tracking
- improve analytics and filtering in the popup UI
