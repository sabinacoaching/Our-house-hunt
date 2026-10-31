# Our House Hunt: Recovery and Safe-Change Procedure

## Exact project (do not search for a separate `our-house-hunt` repository)

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
