# House Hunt: mandatory acceptance contract

Last audited: 2026-10-30. This document captures the owner's constraints. **A document is not an automated test or branch protection**: do not claim it enforces anything until the CI gate and protected deployment workflow are installed and tested.

## Source of truth

- The full address in `public.properties.address` was written and confirmed by the owner. It is authoritative. Do not automatically change house number, street, postcode or status to match geocoder, TfL, nearby address, inferred location or listing text. Manual changes require a specific user instruction.
- Supabase `ficnuovumurmhzdujjvj` holds records; GitHub repository `sabinacoaching/sabinacoaching.github.io` and folder `our-house-hunt/` hold code. Protect the rest of this shared repository.
- Owner comments, manually corrected travel and station minutes, photographs, floor plans, house order, status, all JSON metadata are protected. Never bulk-reimport/overwrite them.
- Before any code or data change: immutable dated GitHub checkpoint + independent database snapshot of affected records. Changes to data require explicit approval of a reviewed diff.

## Routes: required algorithm and correctness tests

1. **Address input**: use the exact owner's address (including house number). Perform independent address resolution to a precise origin point, storing provider, formatted address, place identifier, house number, location quality and coordinates. If returned address has a different number, street or uncertain entrance, **reject it and mark unresolved**; never silently substitute. For 110 Dunston Road, a response labelled 44 Dunston Road is NOT acceptable. Existing bad results must be invalidated, not treated as cached verified results.
2. **Destination input**: keep full user-agreed destinations: Waterloo, The Dilly and Dance Lab with the precise chosen entrances/arrival context. Station routes must point to the correct physical stop/entrance with stable station IDs, not ambiguous free-text match. The origin and destination used for each result must be recorded for audit.
3. **Walking**: the owner cross-checks Google Maps links. Choose Google Routes WALK as a single primary source; record route distance, duration, provider, origin/destination and date. The displayed Google Maps link must use identical endpoints. If Google Maps UI and API disagree, surface the discrepancy and the provider method; do not label a Valhalla or miles × 20 estimate as Google verified. If the provider fails, show Unavailable rather than silently using a different engine.
4. **Transit**: use the owner's existing target arrival times in Europe/London, with daylight-saving conversion and requested local date. The Google Routes API supports `arrivalTime` for TRANSIT and `computeAlternativeRoutes: true`; gather full route alternatives, transit legs, arrivals/departures, duration and exact endpoints. Select the **shortest duration among itineraries that meet the arrival deadline and the agreed arrival window**. Do not choose the itinerary with the closest arrival at the cost of a longer duration. Do not replace the owner's time with a generic time slot, average five departures, or an arbitrary date without explicit labelling.
5. **Station transit**: specify what departure/time context is used and how travel times from the house are measured; never mix TfL and Google results without explicit source labels. The display must show the same provenance as the underlying record.
6. **Manual corrections**: index override by a stable station ID or persistent per-house station slot, never by display name alone. Alias changes like `Queenstown Road` vs `Queenstown Road (Battersea)` must preserve the corrected walking minutes.
7. **Caching and invalidation**: version routes by algorithm, source, house/station ID, address, origin/destination place ID, target arrival, local date and departure/arrival interpretation. Invalid or superseded routes are not considered verified. Opening/refreshing the catalogue is read-only and must NOT trigger costly routing or external-listing fetches.
8. **Audit**: for every journey retain selected duration, actual departure, actual arrival, route legs, address/coordinates, source, target arrival, matched original listing address, validation status and reason for any failure. Never mark a property PASS based only on a successful HTTP response or saved minutes.
9. **Acceptance set**: at minimum test 110 Dunston Road (44 vs 110 mismatch; corrected 15-min Queenstown walk; station comparison and Waterloo/Dance Lab/The Dilly arrivals), 100 Whitton Dene (218 vs 100), 172 Nelson Road (191 vs 172), 68 St. Pauls Close (62 vs 68), plus every other house where cached route origin differs from authoritative house number. Compare with provider results using the identical endpoints and dates. All 21 houses must have per-route PASS or explicit UNVERIFIED; no false numeric values.

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
