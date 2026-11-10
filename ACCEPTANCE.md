# House Hunt: mandatory acceptance contract

Routing contract updated: 2026-11-09, frontend v55 / Importer 0.18.0. Current repository: `sabinacoaching/Our-house-hunt`; current URL: `https://sabinacoaching.github.io/Our-house-hunt/`. The shared-repository references in the historical incident notes are obsolete. **A document is not an automated test or branch protection**: do not claim it enforces anything until the CI gate and protected deployment workflow are installed and tested.

## Source of truth

- The full address in `public.properties.address` was written and confirmed by the owner. It is authoritative. Do not automatically change house number, street, postcode or status to match geocoder, TfL, nearby address, inferred location or listing text. Manual changes require a specific user instruction.
- Supabase `ficnuovumurmhzdujjvj` holds records; GitHub repository `sabinacoaching/Our-house-hunt` holds code. The professional website is a separate project.
- Owner comments, manually corrected travel and station minutes, photographs, floor plans, house order, status, all JSON metadata are protected. Never bulk-reimport/overwrite them.
- Before any code or data change: immutable dated GitHub checkpoint + independent database snapshot of affected records. Changes to data require explicit approval of a reviewed diff.

## Owner corrections, 2026-11-09

- Superseded on 10 November: the owner did not request three rail/Tube stations at the expense of nearby trams. Preference is rail, then Tube, then tram; the set need not contain three rail stations. The v55/v56 selector's exclusion of trams whenever three non-tram candidates exist was the assistant's mistaken interpretation. v57 changes catalogue controls only, pending clarification of the revised selection rule. Use listing candidates when present and route to named Google stations.
- Remove dominated itineraries before applying the five-minute arrival window. Lyncroft 06:37 to 07:31 (54 min) beats 06:31 to 07:38 (67 min). When a faster earlier service is shown, read later departures to check for a real faster service nearer the deadline. Do not invent the shifted journey.
- The owner clarified Alpine's East Croydon result: 13 minutes was walking; 8 minutes was public transport.
- A shortened first gallery heading must not produce an empty catalogue address or a misleading Street View error. Test a gallery heading plus the complete listing heading, rejected incomplete new imports, and recovery of a previously saved empty address.

## Routes: required algorithm and correctness tests

- Manual station edits must save a per-house/per-slot pending request and automatically calculate just that station. Refresh/reopening resume missing components. Save walking before PT, reject stale/wrong-station results, preserve other slots/journeys/comments/manual metrics, and hide old station times while a replacement is pending. Exercise both inline and Details editors, failure/resume, rapid renaming, JSONB key ordering, concurrent edits, Undo, bare tram-name resolution and an actual inactive-tab MV3 Google route. v58 requires Importer 0.18.0; deploy the compatible station metadata alias handling before publishing.
- A calculation crossing Monday midnight in Europe/London must recover automatically to one consistent Tuesday date, retain walking/manual data, and never retry completed other houses. Verify both GMT and BST, plus a wrong date without a real calendar rollover which must remain rejected. v56 implements one bounded recovery with Importer 0.18.0; it does not enable a paid API.

1. **Origin input**: use the Street View panorama embedded in the original listing. The owner explicitly accepts a panorama on an adjacent road or at a neighbouring house. Do not replace the advertised/user-edited address with that panorama's caption. Store the original listing URL, address input and panorama coordinates; route every journey and Google walking link from that same point. Protect manually corrected coordinates. No street-centre/postcode-centre geocoding is part of the modern import path.
2. **Destination input**: keep full user-agreed destinations: Waterloo, The Dilly and Dance Lab with the precise chosen entrances/arrival context. Station routes must point to the correct physical stop/entrance with stable station IDs, not ambiguous free-text match. The origin and destination used for each result must be recorded for audit.
3. **Walking**: read the real Google Maps walking result in the existing Chrome extension. Save the displayed distance and minutes with identical origin/destination links. TfL supplies station IDs and entrances only. Do not estimate walking times, mix another router's final values into Google results, or require another router to succeed before reading Google. Route to verified named station destinations and select up to three rail/Tube stations by real Google walking routes, with trams only as a fallback. Retain reference station IDs; do not present a TfL coordinate as the named Google destination.
4. **Transit**: read Google Maps alternatives for the next typical Tuesday in Europe/London. Use Waterloo 07:40, The Dilly 18:40 and Dance Lab 19:50. First remove itineraries dominated by a later or equal departure and earlier or equal arrival. Among the remaining routes arriving from five minutes before the deadline through the deadline, select the shortest duration. If none exist in that window, select the closest earlier arrival, then the shortest duration on a tie. Retain actual departure/arrival and reject late or contradictory durations. A walking-only station result means empty station PT, and does not block the three destination journeys. Do not use Google Routes API, Google Cloud or a paid routing service.
5. **Station transit**: specify what departure/time context is used and how travel times from the house are measured; never mix TfL and Google results without explicit source labels. The display must show the same provenance as the underlying record.
6. **Manual corrections**: index override by a stable station ID or persistent per-house station slot, never by display name alone. Alias changes like `Queenstown Road` vs `Queenstown Road (Battersea)` must preserve the corrected walking minutes.
7. **Caching and invalidation**: retain routes by algorithm, source listing, source address/point, station/entrance, local routing date and time context. Completed homes are not recalculated on load. Pending imports may resume only their missing components, both after import and through Refresh/reopening with the extension. Save validated destination/station components independently; keep prior values if a replacement fails. Persist the actual error so diagnosis does not require screenshots or another extension release. Respect TfL Retry-After; refresh transiently incomplete entrance metadata instead of permanently caching a 429 failure. Keep already checked Google walks and journeys during that retry. A station with no confirmed public entrance is ineligible, not an invitation to invent its entrance.
8. **Audit**: for every journey retain selected duration, actual departure, actual arrival, route legs, address/coordinates, source, target arrival, matched original listing address, validation status and reason for any failure. Never mark a property PASS based only on a successful HTTP response or saved minutes.
9. **Acceptance set**: exercise Alpine Close, Lyncroft Gardens and Rossindel Road using their original listing panorama points, plus deterministic fixtures for adjacent-road panoramas, a geographically close station with a longer walking route, multiple entrances, walking-only PT, failure/resume and concurrent/manual edits. Native tests must **load the actual MV3 extension in headed Chromium with inactive Maps tabs and real Chrome APIs**; page-evaluate/VM adapters are not sufficient. Verify UK/US date captions, localized calendars, 12/24-hour clocks and London daylight-saving timestamps without relying on typing into date/time controls. Compare the tested extension fingerprint with the distributed ZIP. The owner deferred recalculation of older completed homes; do not bulk-edit them as part of this repair.

## Photo deduplication: import + every gallery

1. Current import already has image perceptual hashing (difference threshold) in `index.html`; this only protects **future imports** and has no effect on old stored photo arrays.
2. The `openHouse()` Details gallery loops unfiltered `p.images`. `comparison.js` function `distinctPhotos()` currently merely takes `slice(0,4)`; its name does NOT mean it deduplicates.
3. Implement a common, non-destructive view of *unique photographs* for Details gallery, Table thumbnails and full-screen viewer. Compare image content (identical bytes and visually equivalent resized/recompressed versions); never assume unique storage paths mean unique photos. Do not erase original Storage objects or raw metadata; preserve the original order and map clicks/next/previous correctly onto the filtered display list.
4. Test repeated photo with distinct paths and extensions/resolution appears once; distinct angles remain separate; photo count and fullscreen navigation match; archived and existing OTM records work.

## Mandatory end-to-end release gate

- Work on isolated branch and review exact diff; unrelated files must be unchanged.
- Implement **automated tests** using stored deterministic fixtures for routes, known wrong house numbers, manual override aliases, duplicate photo content and Table/Cards/Map rendering.
- Test the authenticated website in a browser, not only parse JavaScript or count Supabase records. Verify 21 loaded records, filtering/archive/restore, ordering, photo gallery, notes, export, and route display with actual fixture data.
- Run representative live integration comparisons against Google routes and the UI links at same origin, destination and schedule. If the Google Maps UI differs, flag exact difference and do not claim data agreement. Verify project billing and provider quotas before mass API requests.
- CI must block release when tests fail. Merge into production only with green test status and explicit acceptance, not an assistant assertion. Protect `main` so accidental direct push cannot bypass test/approval.
- Every release must announce exact commit, deployed version, passed tests and **explicitly list tests that were not actually run**. Never report a deployment as verified without browser test.
- When a regression is detected, stop patch-by-patch publication and diagnose the failing integration test. Revert the changed House Hunt files only when necessary, never user-entered data or unrelated website folders.

## Existing observed defects (2026-10-30)

- 110 Dunston Road travel-audit route legs start at `44 DUNSTON ROAD` in the saved TfL output, despite authoritative address `110 Dunston Road`. Other origin address/house number mismatches exist; such results cannot be trusted without an independent origin check.
- Current `station_commutes.google_verified` stores `Queenstown Road` manual 15 min, while the displayed station is `Queenstown Road (Battersea)`. The UI fails to find the override due to exact-name lookup.
- `house-hunt-journeys` currently chooses route nearest to target arrival, not necessarily the fastest valid route.
- No property has a complete `station_commutes.google_routes` set saved at the time of examination.
- Code already dedups photos in **new imports**, but not existing gallery displays. Stored paths are unique; visual duplicates are still possible.
- Do not bulk-recalculate or modify any records until the new route pipeline is verified with deterministic and live test cases.

## Emergency instruction for a future assistant

> Open `our-house-hunt/ACCEPTANCE.md` and `RECOVERY.md` from the exact GitHub repo `sabinacoaching/sabinacoaching.github.io`. Treat owner-entered addresses as immutable ground truth. Work on algorithm and tests, not spot corrections. Report provenance and errors. Preserve all Supabase records and photos. Do not publish a fix until automated and browser/integration acceptance tests pass. If you cannot perform a required check, identify the blocker and leave production unchanged.
