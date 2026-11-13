# Changelog

All notable changes to this project should be documented in this file.

## [1.2.0] - 2026-11-13

- Export event times as floating local time. Resident Advisor returns `startTime` without a timezone offset and the venue's `Area.timezone` is not in the page state, so the old code parsed the venue wall clock in the browser's timezone: the same Berlin event exported as `22:00Z` from Berlin, `23:00Z` from London, and `04:00Z` from New York. Exports now carry the wall clock unchanged, and every calendar shows 23:00 at the venue
- Detect an explicit `Z` / `±HH:MM` suffix and keep exporting a UTC instant when a source provides one, instead of discarding it
- Prefer a zoned timestamp over a naive one when merging extraction sources
- Google Calendar template uses the same floating/UTC choice as the `.ics` export
- Fixes #1

## [1.1.0] - 2026-11-13

- Fold `.ics` lines at 75 octets instead of 75 characters, so non-ASCII titles and lineups no longer split a UTF-8 character or an escape sequence
- Never emit a `VEVENT` without `DTSTART`; export is skipped when no start date could be extracted
- Derive the default end time from the start instant instead of local wall-clock hours, matching the Google Calendar path
- Add `activeTab` so the popup can read the active tab URL reliably instead of relying on host-permission redaction
- Work in Firefox: use `browser.*` when present, add `gecko.id`, `strict_min_version`, and `data_collection_permissions`
- Remove the `history.pushState` / `replaceState` / `popstate` / polling navigation hooks, which run in an isolated world and never observed page navigation
- Extract iCalendar generation into `lib/ical.js` and cover it with `node --test`
- Rename `icons/my-image.png` and ship real 16/48/128 px icon sizes
- Package only the files that ship to the store; publish the archive to the GitHub release on tag pushes

## [1.0.0] - 2026-03-19

- Export Resident Advisor events as `.ics`
- Open prefilled Google Calendar events
- Support SPA navigation on `ra.co`
- Minimize extension permissions to `https://ra.co/*`
