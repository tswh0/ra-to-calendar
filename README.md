# RA to Calendar

Browser extension for exporting Resident Advisor events as calendar entries.

The extension runs only on `ra.co` event pages, extracts event metadata from the page, and offers three actions:

- download an `.ics` file
- open a prefilled Google Calendar entry
- download an `.ics` file for Apple Calendar

## Why This Exists

Resident Advisor event pages already contain most of the structured data needed for a calendar entry, but copying that information manually is slow and error-prone.

This extension turns the current event page into a reusable calendar export with minimal permissions and no backend.

## Permissions

The extension is intentionally locked down:

- `host_permissions`: `https://ra.co/*`

It does not request broad browser permissions such as `downloads`, `tabs`, or `scripting`.

## Features

- extracts title, start/end date, venue, address, lineup, description, and canonical event URL
- supports Resident Advisor SPA navigation without requiring a manual full-page reload in normal cases
- generates RFC-style folded iCalendar output for long lines
- uses a stable event UID so repeated exports represent the same event
- opens Google Calendar with a prefilled event template

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this repository folder

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click `Load Temporary Add-on`
3. Select `manifest.json`

## Usage

1. Open a Resident Advisor event page such as `https://ra.co/events/2304772`
2. Click the extension icon
3. Choose one of the export options

## How It Works

### 1. Content Script Extraction

The content script in [`content/content.js`](content/content.js) is injected on `https://ra.co/events/*`.

Its job is to extract event data from multiple sources in order of usefulness:

1. `__NEXT_DATA__` / Apollo state
2. JSON-LD structured data
3. DOM fallbacks

This layered extraction matters because Resident Advisor is a SPA and different parts of the page can update at different times.

### 2. SPA Navigation Handling

Resident Advisor changes event pages via client-side navigation. The content script therefore:

- tracks the current event ID from the URL
- hooks `history.pushState` and `history.replaceState`
- listens to `popstate`
- polls as a fallback for navigation drift

When the popup asks for data, the content script first waits briefly for the page state to settle. If the in-page data is still incomplete, it fetches the current event URL and parses the returned HTML in memory to recover a complete event payload.

### 3. Popup Actions

The popup UI lives in:

- [`popup/popup.html`](popup/popup.html)
- [`popup/popup.css`](popup/popup.css)
- [`popup/popup.js`](popup/popup.js)

The popup:

- checks whether the active tab is an RA event page
- requests structured event data from the content script
- displays title, date, and venue
- offers export actions

### 4. Calendar Export

The popup creates calendar output in two forms:

- `.ics` file generation
- Google Calendar template URL

The `.ics` export includes:

- stable `UID`
- UTC timestamps
- folded long lines
- escaped text fields for description and location

Apple Calendar currently uses the same `.ics` download flow, because a browser extension cannot reliably open the native Calendar app directly with a locally generated event payload.

## Code Walkthrough

### [`manifest.json`](manifest.json)

Defines the extension entry points:

- popup UI
- static icon
- content script match pattern
- minimal host permissions

### [`content/content.js`](content/content.js)

Core responsibilities:

- identify the current RA event ID from the URL
- extract event metadata from page data sources
- handle SPA navigation
- answer popup messages with normalized event data

Key functions:

- `extractEventData()`: merges data from all available sources
- `extractFromNextData()`: reads Next.js / Apollo state
- `extractFromJsonLd()`: parses structured event metadata
- `extractFromDom()`: recovers data from visible markup
- `waitForCompleteEventData()`: waits for late-arriving SPA updates
- `fetchEventDataFromPageSource()`: parses freshly fetched HTML if the live document is incomplete

### [`popup/popup.js`](popup/popup.js)

Core responsibilities:

- request event data
- render popup state
- build export payloads

Key functions:

- `init()`: popup entry point
- `requestEventData()`: asks the content script for event metadata
- `generateIcal()`: builds the `.ics` document
- `downloadIcs()`: triggers a browser download using a `Blob`
- `addToGoogle()`: opens a Google Calendar template

### [`popup/popup.css`](popup/popup.css)

Defines a compact dark popup UI with:

- event summary card
- loading and error states
- primary and secondary export buttons

## Project Structure

```text
.
├── content/
│   └── content.js
├── icons/
│   └── my-image.png
├── popup/
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
├── .gitignore
├── LICENSE
├── manifest.json
└── README.md
```

## Local Development

There is no build step.

To iterate locally:

1. load the extension unpacked
2. make changes in this repo
3. reload the extension in the browser
4. reload the current RA event page if you changed the content script

## Packaging

To build a release archive locally:

```bash
./scripts/package-extension.sh
```

This creates a versioned zip in `dist/` that can be used as a release artifact.

There is also a GitHub Actions workflow at `.github/workflows/package.yml` that builds the same archive on tag pushes like `v1.0.0`.

## Testing Checklist

- open an RA event page directly and confirm the popup renders the right title/date/venue
- navigate to another RA event through the SPA and confirm the popup still resolves the new event
- download an `.ics` file and import it into a calendar client
- open the Google Calendar flow and verify the event is prefilled correctly
- verify the extension shows the error state on non-event pages

## Known Limits

- the extraction logic depends on Resident Advisor continuing to expose usable metadata in page state, JSON-LD, or DOM markup
- Apple Calendar uses a downloaded `.ics` file rather than launching the native app directly
- the extension is optimized for Chromium-style extension environments and tested as an unpacked extension workflow

## License

MIT. See [`LICENSE`](LICENSE).
