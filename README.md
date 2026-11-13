# RA to Calendar

Browser extension for exporting Resident Advisor events as calendar entries.

The extension runs only on `ra.co` event pages, extracts event metadata from the page, and offers two actions:

- download an `.ics` file, for Apple Calendar, Outlook, or anything else that reads iCalendar
- open a prefilled Google Calendar entry

## Why This Exists

Resident Advisor event pages already contain most of the structured data needed for a calendar entry, but copying that information manually is slow and error-prone.

This extension turns the current event page into a reusable calendar export with minimal permissions and no backend.

## Permissions

The extension is intentionally locked down:

- `host_permissions`: `https://ra.co/*` and its regional subdomains (`https://*.ra.co/*`, e.g. `de.ra.co`, `ja.ra.co`)
- `permissions`: `activeTab`

`activeTab` is only used to read the URL of the tab you invoked the popup on, so the extension can tell an event page from any other page. It does not request broad browser permissions such as `downloads`, `tabs`, or `scripting`.

## Features

- works on `ra.co` and every regional domain, such as `de.ra.co` or `ja.ra.co`
- extracts title, start/end date, venue, address, lineup, description, and canonical event URL
- reads the page on every request, so client-side navigation between events needs no reload
- a 320 px popup that follows the system light or dark scheme
- generates RFC 5545 iCalendar output with octet-aware line folding
- exports venue wall-clock times, so an event abroad is not shifted by the viewer's timezone
- always emits a valid `DTSTART`, defaulting `DTEND` to six hours after the start
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

Firefox 140 or newer is required. Permanent installation needs the extension signed through addons.mozilla.org, since the manifest carries a fixed `browser_specific_settings.gecko.id`.

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

### 2. SPA Navigation

Resident Advisor changes event pages via client-side navigation, but the content script keeps no cached state: every popup request re-reads the current URL, `__NEXT_DATA__`, JSON-LD, and DOM. Whatever event is on screen is the event that gets exported, so no `pushState` hooks or navigation polling are needed.

When the popup asks for data, the content script waits briefly for the page state to settle. If the in-page data is still incomplete, it fetches the current event URL and parses the returned HTML in memory to recover a complete event payload.

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
- required `DTSTART` and `DTEND`
- floating local times when the source carries no timezone offset, UTC when it does
- lines folded at 75 octets, never splitting a UTF-8 character or an escape sequence
- escaped text fields for title, description, and location

Apple Calendar currently uses the same `.ics` download flow, because a browser extension cannot reliably open the native Calendar app directly with a locally generated event payload.

## Code Walkthrough

### [`manifest.json`](manifest.json)

Defines the extension entry points:

- popup UI
- static icon
- content script match pattern
- `activeTab` plus minimal host permissions for `ra.co` and its regional subdomains
- Firefox metadata (`gecko.id`, `data_collection_permissions`)

### [`content/content.js`](content/content.js)

Core responsibilities:

- identify the current RA event ID from the URL
- extract event metadata from page data sources
- answer popup messages with normalized event data

Key functions:

- `extractEventData()`: merges data from all available sources
- `extractFromNextData()`: reads Next.js / Apollo state
- `extractFromJsonLd()`: parses structured event metadata
- `extractFromDom()`: recovers data from visible markup
- `waitForCompleteEventData()`: polls until the page exposes title and start date
- `fetchEventDataFromPageSource()`: parses freshly fetched HTML if the live document is incomplete

### [`lib/ical.js`](lib/ical.js)

Pure iCalendar generation, shared by the popup and the test suite:

- `escapeText()`: RFC 5545 escaping, backslashes first
- `formatUtc()`: `YYYYMMDDTHHMMSSZ` timestamps
- `foldLine()`: folds at 75 octets without splitting multi-byte characters or escapes
- `buildIcal()`: assembles the `VEVENT`, returning `null` when there is no start date

### [`popup/popup.js`](popup/popup.js)

Core responsibilities:

- request event data
- render popup state
- build export payloads

Key functions:

- `init()`: popup entry point
- `requestEventData()`: asks the content script for event metadata
- `downloadIcs()`: triggers a browser download using a `Blob`
- `addToGoogle()`: opens a Google Calendar template

The popup uses `browser.*` when available and falls back to `chrome.*`, so the same code runs in Chromium and Firefox.

### [`popup/popup.css`](popup/popup.css)

The popup's own layer over Oat: theme tokens, the 320 px frame, the ticket-style date line, the skeleton loader, and the two error states. Oat itself is vendored as `popup/oat.min.css`, so no CDN request is made.

### [`icons/`](icons/)

`icon.svg` is the mark; `icon-{16,32,48,128}.png` are rendered from it by `scripts/make-icons.py`. The 16 px size uses its own geometry (squarer corner, heavier dot) because the full-size proportions turn to mush in a toolbar.

## Project Structure

```text
.
├── content/
│   └── content.js
├── icons/
│   ├── icon.svg
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── lib/
│   └── ical.js
├── popup/
│   ├── oat.min.css
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
├── scripts/
│   ├── make-icons.py
│   └── package-extension.sh
├── tests/
│   └── ical.test.mjs
├── .github/
│   └── workflows/
│       └── package.yml
├── CHANGELOG.md
├── LICENSE
├── PRIVACY.md
├── manifest.json
├── package.json
└── README.md
```

## Local Development

There is no build step and no runtime dependency. Node 20 or newer is only needed to run the tests.

```bash
npm test
```

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

This creates a versioned zip in `dist/` containing only the extension files that ship to the store.

The GitHub Actions workflow at `.github/workflows/package.yml` runs the tests, builds the same archive on tag pushes like `v1.1.0`, uploads it as a build artifact, and attaches it to the GitHub release.

## Testing Checklist

- open an RA event page directly and confirm the popup renders the right title/date/venue
- navigate to another RA event through the SPA and confirm the popup still resolves the new event
- download an `.ics` file and import it into a calendar client
- open the Google Calendar flow and verify the event is prefilled correctly
- verify the extension shows the error state on non-event pages

## Known Limits

- the extraction logic depends on Resident Advisor continuing to expose usable metadata in page state, JSON-LD, or DOM markup
- names containing markup in the Apollo lineup string are parsed textually, not as HTML
- Resident Advisor returns timestamps without a timezone offset, and its event page state does not include the venue's `Area.timezone`, so exports use floating time: every calendar shows the venue's wall clock. A true UTC instant cannot be derived without an extra API call
- floating times are ambiguous for attendees in other timezones, which is the price of not knowing the zone
- Apple Calendar uses a downloaded `.ics` file rather than launching the native app directly

## License

MIT. See [`LICENSE`](LICENSE).
