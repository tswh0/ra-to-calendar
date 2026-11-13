# Changelog

All notable changes to this project should be documented in this file.

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
