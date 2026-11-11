# Our House Hunt: Recovery and Safe-Change Procedure

## Current project and routing architecture (2026-11-10, v60)

- v60 replaces both native Viewing date editors with the same explicit Day / Month / Hours / Minutes component. No year/seconds segment or locale-dependent native datetime parsing remains. New day/month choices use the next occurrence in Europe/London; changing only time keeps the saved year. Unchanged fields retain the original stored timestamp exactly. Validate partial/impossible dates before saving, display copyable inline errors, and convert valid London wall-clock values to ISO timestamps. Regression: type 12 December, 12:02, Save, Refresh, reopen; include Russian browser locale and Details. Checkpoint: backup-before-viewing-date-editor-20261110 at fcf066de5fb3b2d08b492c27533a00dacf96c2a2.

- v59 compacts Table/Map/Cards/Undo into the top account row and moves exports, Change password and Sign out into Menu. The table fills one viewport; downward wheel scrolling first moves the outer page to the column headings, then scrolls table rows. Scrolling outside the table remains normal. Header labels use 14px text without widening other columns. Viewing date uses a narrow day/month and HH:mm display; clicking opens a minute-resolution date/time editor. Merely displaying or cancelling never changes stored dates. Both date editors convert stored timestamps to the browser's local calendar fields instead of slicing UTC text. Routes, import generation, database and extension are unchanged. Checkpoint: backup-before-compact-table-20261110 at 1e28e11499a833849c53efe341bcf9d329ab581a.

- v58 automatically calculates Google walking and PT for a station name manually changed in the table or Details. `prepareStationChanges` saves the choice and per-slot pending marker atomically; `station_commutes.manual_routes` binds each request to house, slot, typed name and origin context. Refresh and reopening resume these markers, preserving completed walking if PT failed. Only changed slots run; completed other houses and Waterloo/The Dilly/Dance Lab remain cached. The existing Importer 0.18.0 is retained.
- New station identities/modes come from TfL metadata or its public station-name lookup; distances/times still come from the Google Maps UI. Bare tram names resolve to tram identities. Keep user labels, canonical names, stable TfL IDs, named Google queries and panorama origins separately. A request superseded by another name/location must never save stale results. Existing manual metrics win. Name edits retain old manual corrections in history and do not carry an old station's distance to a different station.
- `edit-history.js` accepts a preparation hook and records the actual user changes separately from derived route markers, so automatic route writes do not disable Undo of a name edit. Prepared name edits and Undo use `house_hunt_save_manual_edit` to compare the full fresh row and save the name/marker together, retaining concurrent annotations and unrelated manual flags. Apply `server/house-hunt-save-manual-edit-20261110.sql` before publishing. This SECURITY INVOKER function retains household RLS and is executable only by authenticated users. Applying Undo prepares a fresh request for the restored choice. Do not replace this with a full-catalogue recalculation.

- v57 renames the David comments column to Current decision (same `comment_david` values, table/detail/export), adds Enquire a viewing separately from Requested viewing, replaces the combined Under offer / Sold display with Under offer, removes Shortlisted from filters/new choices, and adds agency A-Z/Z-A sorting with missing agencies last. Saved legacy statuses are preserved in editors and undo; no owner record is migrated or archived automatically. Apply `server/catalogue-status-options-20261110.sql` before publishing the frontend.
- Owner clarification on 10 November: rail preference does not mean all three slots must be rail/Tube; nearby trams must not be excluded solely because three rail/Tube candidates exist. The automatic nearest-station selector still has that disputed rule. v58 adds explicit manual-choice routing, without changing the automatic ranking.

- v56 retains Importer 0.18.0 and the existing completed route generation. If an unfinished house crosses Monday midnight in Europe/London and Maps starts returning the following Tuesday, the controller automatically retries that house once on the new common date. It keeps station discovery, Google walking and all manual values, recalculating only dated components. An unrelated date mismatch still fails validation; no catalogue-wide migration is triggered. Regression tests cover winter and summer London midnight.

- Repository: **`sabinacoaching/Our-house-hunt`**, branch `main`, project files at its root. Published application: **`https://sabinacoaching.github.io/Our-house-hunt/`**. Do not operate on the other repository or website. References below to the old shared repository describe historical checkpoints only.
- v55 / Importer 0.18.0 updates the owner's station and itinerary criteria. Rank eligible rail and Tube stations by actual Google walking time, with rail winning a tie; trams fill a slot only when fewer than three rail/Tube stations are available. Read listing station candidates and advertised distances when the source supplies them; if its Local area section is only a static map, use TfL station identities as the explicit fallback. Advertised miles never become walking miles.
- Route to the named railway/Underground/tram station in Google Maps, retaining its stable TfL identity and the same listing panorama origin. TfL coordinates are reference metadata, not a substitute destination in the displayed walking link.
- Before the five-minute arrival rule, discard an itinerary when another leaves no earlier and arrives no later. If Maps shows a faster earlier trip, also read a departure search near the target arrival window; retain only actual returned itineraries and reject late arrivals. Never shift a departure/arrival arithmetically and call it a measured journey.
- An open Zoopla gallery contains a shortened first h1. The importer captures the complete original heading, records the actual extension version, rejects a missing address before saving a new house, and can recover a prior empty address from the same original listing without replacing other fields.
- Only the previous Google pipeline generation is migrated once to the new selection rules. Existing completed legacy homes remain untouched. Owner manual overrides, comments, status, media and ordering retain priority.

- Frontend **v54 requires Importer 0.17.0** for automatic transport. The 0.16.0 reader failed on the owner's Chrome for every transit request while walking succeeded; Chrome exposed the rejected/navigated injected result as an empty result, hiding the actual page error. Do not claim a particular profile/locale cause was established: the fresh-profile baseline can pass. Checkpoint: `backup-before-extension-transport-fix-20261109` at `348283d4a2b546988f864f9e0653dfda1f1d068d`.
- Importer 0.17.0 opens a scheduled Google Maps directions URL containing the Europe/London timestamp and arrive/depart flag. It verifies the timestamp, actual applied time field, endpoints and route cards. It does not type into locale-dependent date/time controls. Initial alternatives are returned before a separate injection requests later trips, so a navigation cannot discard the initial result. Page errors are returned as serializable data instead of being hidden by Chrome's async-injection behavior. Existing permissions and listing/photo/floorplan extraction are unchanged.
- Keep `google_routes_work` when updating the extension: the owner already has saved Google station walks and entrance metadata. The new version resumes only the failed destination/station-transit components. Do not replace those records with manually copied test results.
- The source point comes from the original listing's Street View panorama. A panorama on an adjacent road is permitted by the owner. Keep the advertised/user-edited address unchanged and record the panorama coordinates and original listing URL separately.
- One controller, `google-routes-runner.js`, owns new-import routes and pending-import retries. The modern importer bypasses the older `enrichWalkingStations`/TfL/OSM routing chain. Rendering a table, card or map never starts route calculations.
- The extension reads the visible **Google Maps** UI in background tabs, with English labels. All walking distances, walking minutes and public-transport minutes come from that UI. `house-hunt-station-commutes` with `metadata_only:true` supplies **TfL station IDs and public entrance coordinates only**. Its modern path performs no OSM walking calculation and no TfL journey calculation, uses station IDs directly instead of searching again by name, caches metadata and retries transient failures.
- Station metadata honours TfL's `Retry-After` cooldown across concurrent requests. Transiently missing nearby stations cause metadata to be refreshed, reusing saved Google walks/journeys; incomplete metadata must never trap an import permanently. The v54 main release gate detected this real 429 failure and blocked deployment before this correction. Checkpoint before this fix: `backup-before-station-retry-20261109` at `a6b00b67c2cede8464cff62317e66feeaceccb2e`.
- Waterloo 07:40, The Dilly 18:40 and Dance Lab 19:50 use the next typical Tuesday in Europe/London. Selection: shortest complete itinerary arriving during the five minutes up to the deadline; otherwise the closest earlier arrival. Late or internally inconsistent journeys are rejected.
- `google-station-selection.js` compares actual Google walking routes. Great-circle distance is used only as a lower bound to skip stations that cannot be nearer, with allowance for Google's displayed distance rounding. It is never saved as walking distance or time. Multiple entrances of a station do not become duplicate stations.
- Every validated route is saved independently through the existing `house_hunt_save_google_routes` RPC. A failed station lookup cannot discard the three destination journeys; a failed destination cannot discard walking/station results. `import_diagnostics.google_routes_work` records the exact source, routing date, completed components and errors. Retries reuse the checked components for the same origin/date; an initial load retries only pending imports, not older completed homes.
- Manual edits win. Each save rereads the record and uses the existing atomic comparison/RLS RPC; a concurrent comment/status edit is retained. Manual journey minutes, station names, distances and `google_verified` entries are protected. No migration or permission change is required for v53.
- Regression tests: `npm test`. Native extension smoke/integration: `.github/workflows/extension-native-check.yml` and `.github/workflows/routing-network-check.yml`. Both use a **loaded Manifest V3 extension in headed Chromium under Xvfb**, keep Maps tabs inactive, and exercise real `chrome.tabs` and `chrome.scripting` APIs. The full test runs the production controller and station metadata logic with in-memory database records; no Chrome APIs are mocked. A page-evaluate/VM adapter alone is insufficient evidence for an extension release. The native smoke prints the exact five-file package fingerprint for comparison with the shipped ZIP. Production RPC permissions/concurrency/manual-value guards are tested separately in a rolled-back transaction.
- Release evidence: runs `42668380866` and `42670892833` passed the native smoke and all three complete-house checks. Importer 0.17.0 is also compatible with the published v53 controller: the controller, station selector and route-update module were unchanged in PR #34. Its distributed ZIP fingerprint is `3bf2d1a44ba3fba25a4b1e5af3018098a8c0aceb26b320ae59abdf271fbf9d99`. The station-retry revision passes 155 regression tests. These integration results are test records, not copied replacements for the owner's catalogue. On 2026-11-09, subsequent main runs `42671474557` and `42672016991` failed before starting jobs with GitHub's own `Internal server error`; this is distinct from a failed route test and must never be reported as a completed Pages deployment.

## Historical shared-project location

- GitHub: `sabinacoaching/sabinacoaching.github.io`, branch `main`.
- Application: **only** folder `our-house-hunt/` within that repository. The rest of the repository hosts another site and MUST NOT be reset, reverted, overwritten, or redeployed wholesale.
- Published site: `https://sabinacoaching.github.io/our-house-hunt/`
- Data: Supabase project `ficnuovumurmhzdujjvj` (House hunt); application data in `public.properties`, `public.notes` and supporting `public.house_hunt_*` tables; private `property-photos` Storage bucket. Data are **not stored in GitHub**.
- Preservation checkpoint, made on 2026-10-30: branch `house-hunt-checkpoint-2026-10-30-v41`, exact commit `2561c2f2270dc89c2e8675fd479b54cab40534e8`. This records the deployed v41 source, **not independently browser-verified as working**.
- In the incident on 2026-10-30, the site showed 21 properties, but Table was blank while Cards and Map were not the problem. Root cause: use of `entry.children.some(...)` on an HTMLCollection in `comparison.js`. Fixed to `entry.querySelector(...)` and a row-by-row error boundary was added. A count in the UI does not prove the table rendered.

## Export and routine catalogue behaviour (new code published 2026-10-30)

- `Export Excel` downloads a local, true `.xlsx` workbook without sending any export data to a third-party service. `Current table` contains visible, sorted/filtered rows; `Full data backup` contains ALL records from the loaded `properties` table, including archived/deleted, JSON metadata, comments and journey estimates. Photo and floor-plan paths are preserved, but the actual private Storage files are **not** embedded.
- `Export PDF` opens a print-ready view of currently visible rows. In the browser print dialog, select `Save as PDF`. This is a browser-generated PDF, not an automatic server export.
- Opening the catalogue, switching views and clicking Refresh **must remain read-only** for original listings, floor-plan OCR and transport route recalculation. Supabase database reads and signed photo URLs are still used to display data. Automatic 30-second polling has been removed: reload property data only at sign-in, via the explicit Refresh button, or after a saved edit.
- Automatic missing-detail enrichment and transport calculation should run only during the import session for a **new** property. Existing properties can be deliberately updated via the `Update listing data` button in the details dialog.
- Version v41 remains the older checkpoint. A separate branch `house-hunt-before-export-2026-10-30` records the production state immediately before exports and read-only opening changes.
- Export implementation: `our-house-hunt/export-tools.js`; attached by `our-house-hunt/index.html`. Table is still managed by `comparison.js`, with transport queue gates in `comparison.js` and `station-commutes.js`. Test Excel generation with Unicode and test the nonempty 13-column table after any changes.

## Catalogue counters, archive and ordering (2026-10-30)

- The headline count must show `homes.length houses · activeCount active` from **all** loaded property records, including archived/deleted in the total. When Stage or Search filters are active, add `N shown`. Never display only the filtered row count as the total.
- An `Archived (N)` button toggles Stage between Archived and All active, alongside the existing Stage filter. Archived rows/cards show `Restore to active`, which changes only status to the blank (active) default and persists using the existing edit history.
- `Move to…` in each active house row lets the user choose an exact 1-based position, including 10 to 1, in a **single** reorder RPC. Drag has additional edge auto-scroll for long lists; ↑ and ↓ move exactly one place. Reordering is enabled only with Stage=All active, Sort=My order and empty Search. Archived/deleted houses must never be included in the active ordering RPC.
- There is no recurring 30-second property refresh. `Refresh` reads `properties` from Supabase, re-renders the local UI, and obtains any changes another user made. It does not refetch listing websites or recalculate routes. Opening the site performs one initial read. Changes after a save cause a read as needed.
- As at the verification on 2026-10-30, the database had **21 total, 19 active, 2 archived** (Angel Mews and White Lodge Close). These statuses can change, so always derive the counter from live data, not from a hard-coded count.
- The pre-change code is saved in branch `house-hunt-before-archive-reorder-2026-10-30` (ref `f950914d622a7879866837c7b4f045f1f93362b4`).

## 2026-10-30 v47: confirmed source-level remedies for stale tabs, filtering and drag

- v47 is identified by a visible `v47` badge next to the signed-in user's name. If a user sees `Original Listing Checks` or old counters and does not see `v47`, their existing tab is executing older JavaScript; a changed GitHub commit cannot modify an already loaded browser tab. Open the published URL with `?v=47` or reload the tab. The stable page alone may remain loaded and stale.
- The comparison table has a multi-select `Viewing status ▾ Filter` menu **in the header of the Viewing status column**. `All active` and `All statuses` shortcuts, one checkbox per status, and Apply/Cancel. It can include archived and deleted records. The existing top Stage and Archived controls also work and reset the custom status selection when used.
- The page count is **`N shown · M total`**, not active-only totals. E.g. 19 shown · 21 total. Archived records remain counted in total.
- Rows in the table display `#1`, `#2`, etc. reflecting current visible order. `Move to…` remains available when no stage/status/search filter is in effect and My order sort is selected.
- Drag-to-reorder auto-scrolls the **table scroll container** continuously while the cursor remains near its top or bottom edge. Drop onto the desired row; users need not move a row only one position at a time.
- No 30-second database polling; opening the app fetches saved Supabase data once, manual Refresh fetches it again, and saves may fetch as necessary. In existing tabs that still run legacy code, auto-checking continues until a page reload. The new version badge is the first diagnostic step.
- Safe pre-change branch: `house-hunt-before-status-filter-v46-2026-10-30` at commit `b40071a1472d55c09f1e2375cc25e3321c81d826`.
- Changes verified by JavaScript syntax checks, a simulated 19/21 active/archive status filter, table rendering, and drag-edge scroll. Full live signed-in browser verification remains outstanding.

## Emergency diagnosis, without destructive changes

1. Read THIS document and the **live files and recent commits**, not a stale chat summary. Use the GitHub connector on the correct repo/folder. Check `our-house-hunt/index.html`, `comparison.js`, `comparison.css`, `station-commutes.js` and relevant imported modules.
2. Identify what actually fails: sign-in / load / Table / Cards / Map / saved edits. If the count is nonzero and Cards works but Table is blank, investigate the table renderer first; do not migrate, reimport or overwrite the Supabase data.
3. Check Supabase read-only: number of property records, status distribution, important property fields and relevant query/edge logs. A successful HTTP 200 does not itself prove nonempty rows are visible to the current user.
4. Compare the failing commit with the preceding working commit. Inspect runtime exceptions and newly changed lines. Do not claim the cause is known until supported by code/logs.
5. Make a minimal targeted fix; avoid changing any unrelated behavior or files.

## Release rules (mandatory for every future change)

1. Before modifying production, save the current branch HEAD as a NEW dated checkpoint branch; never rewrite any existing checkpoint.
2. Change only task-relevant files. Inspect the unified diff before committing; no changes to the professional website elsewhere in this repository.
3. At minimum, check JS syntax and test a **nonempty** Table, Cards and Map with real or representative records, sign-in and existing comments, and that times/notes survive a refresh. A deployment without runtime verification must be reported as unverified, NOT 'fixed'.
4. Bump cache version in `our-house-hunt/index.html` when a module changes, to prevent a cached script masking the release.
5. On regression, roll back **only** changed files in `our-house-hunt/` to the chosen checkpoint, not the entire shared `main` branch. Preserve data and report exact files/commits.
6. Never reset Supabase, delete/reimport properties, change passwords, RLS or schema, or overwrite saved comments/times while diagnosing a UI failure.
7. Protect user-entered fields against automatic enrichment. Do not invent missing floor plans, measurements, or route times.
8. Do not stop at a connector 404 before checking the exact repository and file paths here. Do not ask the user to recreate work or reconfirm details already documented.

## How to restore application code without affecting the other website

In an environment with Git installed, after inspecting `git status` and obtaining explicit permission to revert newer House Hunt changes:

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c house-hunt-restore-YYYYMMDD
git restore --source=origin/house-hunt-checkpoint-2026-10-30-v41 -- our-house-hunt/
git diff -- our-house-hunt/
# Confirm only the intended House Hunt files would change.
# Commit, test, and merge ONLY after approval.
```

This restores the entire House Hunt folder to the checkpoint, thereby losing any **later House Hunt code changes** if merged. For a single regression, restore only the affected file(s). Do **not** execute these commands automatically: confirm the chosen rollback target and the diffs.

## Supabase data checkpoint created 2026-10-30

A separate read-only-to-the-app snapshot exists in the **same Supabase project**, in private schema `house_hunt_backup`:
- `properties_20261030_v41` (21)
- `notes_20261030_v41` (0)
- `members_20261030_v41` (2)
- `station_candidates_20261030_v41` (147)
- `pt_samples_20261030_v41` (120)
- `journey_audit_20261030_v41` (63)

Each count was verified against the original table at snapshot time. SQL schema privileges for `anon` and `authenticated` were checked and were both false. Do not alter the snapshot tables. Any data restore must be scoped and reviewed first to avoid overwriting newer valid user changes. **Private Storage photo bytes and Supabase Auth identities are not backed up by these SQL snapshots.**

## What backup does / does not cover

The GitHub checkpoint preserves application code. It does NOT back up Supabase rows, Supabase Auth users, Storage image bytes, or future edits. Any database snapshot stored in the same Supabase project protects against many accidental row edits but not deletion/loss of the entire project. A separate, secure external export is required for disaster recovery, including private Storage files.

## Emergency prompt (paste into a new ChatGPT chat)

> Восстанови Our House Hunt. Сначала прочитай `sabinacoaching/sabinacoaching.github.io/our-house-hunt/RECOVERY.md` через подключённый GitHub и сравни рабочие файлы с резервной веткой `house-hunt-checkpoint-2026-10-30-v41` (коммит `2561c2f`). Данные в Supabase `ficnuovumurmhzdujjvj`; не меняй их, пока не выявлена необходимость. Разберись в конкретном сбое и исправь ТОЛЬКО файлы `our-house-hunt/`. Не говори, что доступа нет, пока не проверил правильный репозиторий. Сохрани новую резервную ветку перед правкой, протестируй Table/Cards/Map и сообщи, что проверено на практике. Не трогай другие папки сайта.
