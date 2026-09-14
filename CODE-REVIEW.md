# Code Review

Pure analysis pass, as of 2026-09-09. No code changes were made. Reviewed: backend (`server/`), frontend structure (`frontend/src/`), documentation (`README.md`, `DEPLOYMENT.md`, `SETUP.md`, `docs/*.md`), and `package.json` (backend + frontend).

---

## Area 1: Security

### 1.1 Real server IP in a checked-in example configuration — ✅ fixed (2026-09-09)
**Location:** `server/.env.production.example:1,43`
The file contained, as a comment and as the `ALLOWED_ORIGINS` value, the real production IP of the Windows server. This was not a credentials leak (no password/token), but an unnecessary disclosure of private infrastructure details in a public GitHub repo.
**Assessment:** low to medium (recon value for attackers: known IP + open port for portscans/bruteforce).
**Fixed:** Both occurrences replaced with the placeholder `<SERVER-IP>`. A repo-wide grep confirms the IP no longer appears in any committed file. Note: the IP remains visible in git history — a history rewrite would be needed if desired.

### 1.2 No real secrets found in the code
Grep for typical password/token/API-key patterns in `.js`/`.md`/`.example` files found no hits. `.env` itself is correctly excluded via `.gitignore`, as are `webinterface-auth.db*`, `*.mldb*`, and `server/settings.json`. `.env.production.example` only contains placeholders for credentials (`API_DB_USER=`, `API_DB_PASSWORD=`, `INITIAL_ADMIN_PASSWORD=`).
**Assessment:** no finding / positive.

### 1.3 Session cookie: `secure: false` hardcoded — ✅ fixed (2026-09-09)
**Location:** `server/routes/auth.js:32-37`
```js
res.cookie("session", sid, {
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  expires: new Date(expiresAt),
});
```
`httpOnly` and `sameSite` are set, but `secure` is hardcoded to `false` instead of being tied to, e.g., `process.env.NODE_ENV === "production"` or a dedicated env variable. On an HTTPS deploy (Caddy + TLS is planned for phase H per `README.md`), the session cookie would still be transmitted over unencrypted HTTP if the reverse proxy doesn't strictly enforce HTTPS.
**Assessment:** medium (becomes relevant once TLS/Caddy goes live in phase H; currently deployed without TLS per `DEPLOYMENT.md`, so no acute contradiction, but a future pitfall).
**Fixed:** `secure` now depends on the new env variable `COOKIE_SECURE` (default `false`), documented in `.env.production.example`. Deliberately not tied to `NODE_ENV`, since the webinterface also runs in production over plain HTTP — an automatic coupling would have broken login there. `res.clearCookie()` uses the same flags, otherwise logout would fail with `secure: true`.

### 1.4 No brute-force protection on login — ✅ fixed (2026-09-09)
**Location:** `server/routes/auth.js:16-41` (`POST /login`)
There was no rate limiting, no delay after failed attempts, and no account lockout. An attacker could run unlimited login attempts against `admin`. bcrypt (10 rounds, see below) slows down each attempt, but without rate limiting, distributed/parallel brute-forcing was possible.
**Assessment:** medium (not a critical data leak, but a classic login-endpoint flaw, especially since the admin username `admin` is fixed, see `server/data/webAuthDb.js:72`).
**Fixed:** In-memory rate limiting directly in `auth.js`, with no new dependency. Counted separately by username **and** IP; after `LOGIN_MAX_ATTEMPTS` (default 5) failed attempts, the route responds with HTTP 429 for `LOGIN_LOCKOUT_MINUTES` (default 15). A successful login resets both counters; expired entries are cleaned up on access and additionally periodically. Both values are documented in `.env.production.example`. The 429 message is phrased neutrally — verified that existing and non-existing usernames return identical responses.
**Deliberate limitation:** The counters live in memory and are lost on restart; multiple instances would need a shared store. Accepted for a single instance, commented in the code.

### 1.5 bcrypt rounds (cost factor 10) — ✅ fixed (2026-09-09)
**Location:** `server/data/webAuthDb.js:68, 175, 205`
`bcrypt.hashSync(password, 10)` is used in three places (bootstrap admin, `createUser`, `changeUserPassword`). Cost factor 10 is bcrypt's default and is now on the low side for 2026-era hardware; 12 is today's common recommendation for new systems.
**Assessment:** low (10 is not insecure, but no longer state of the art).
**Fixed:** Defined as a single constant `BCRYPT_COST = 12`, all three usages reference it. Only affects newly set passwords — existing cost-10 hashes remain valid since bcrypt reads the cost from the hash itself (verified). No migration needed. Hash time increases to ~420 ms, which is unproblematic for logins and additionally slows brute-forcing.

### 1.6 ~~Input validation in the routes is patchy, but not critical~~ ✅ fixed
**Locations:** `server/routes/library.js` (various), `server/routes/auth.js`
- Positive: All SQL access in `sqlRepository.js` consistently goes through parameterized `better-sqlite3` prepared statements (`db.prepare(...).all(...)`/`.run(...)`), no string concatenation of user input into SQL found — no SQL injection risk identified.
- However, there is barely any type/format validation on body/query parameters beyond "is present" (`if (!name || !name.trim())` etc.). Examples:
  - `library.js:170-175` (`GET /api/items`): `folderId`, `storageId` are passed through unchecked; in `sqlRepository.js:353-356`, `Number(filters.storageId)` results in `NaN` for a non-numeric query value — not a crash, but a silently empty result instead of a 400 error.
  - `library.js:117-152` (storages routes, `requireScope("admin")`): `location`/`path` is not checked for path validity before landing in `defaultLocation` in `sqlRepository.js:219-226`/`228-239` — this value later determines the filesystem base directory in `resolveStorageDir()`/`resolveAudioPath()`. Since this route already requires `admin` scope, the risk is mitigated by role binding, but an admin could accidentally (or a compromised admin account deliberately) create a storage with `..` path segments.
  - `auth.js:117-128` (`PUT /admin/users/:id/permissions`): `role` is not validated against `webAuthDb.ROLES` before being passed to `setUserPermissions` — there, `ROLES.includes(role)` does filter correctly (`webAuthDb.js:222`), so an invalid value is only silently ignored instead of returning a 400.
**Assessment:** low to medium (not a direct security hole, more a robustness/UX gap; potentially relevant for path-traversal hardening in the admin-protected storage case).
**Suggestion:** Small validation layer (e.g. `zod`/`joi` or manual guards) for body/query parameters before the repository call, especially for numeric IDs and role strings.

**Fixed:** New file `server/lib/validate.js` with small, readable guards — deliberately **without** an additional dependency. It provides `requireId`/`optionalId`, `requireDate`/`optionalDate`, `requirePlaylistId`, `optionalCount`, `requirePosition`, `requireText`/`optionalText`, and `requireObject`/`optionalObject`. The `wrapValidation()` helper wraps handlers so a `ValidationError` is answered as a clean 400 with an English message, instead of landing as a 500 in the global error handler.

Applied to all handlers in `library.js` and `auth.js`:
- **IDs** are only checked for "present, string/number, plausibly short", *not* for a specific format — the repositories use different ID types (mock/sqlite numeric, mAirListDB API string); a stricter check would have rejected legitimate calls depending on `DATA_SOURCE`. `/api/items/abc/history` therefore still returns 404 ("not found"), not 400 — but it no longer crashes.
- **Date** (`?date=`) and **playlist IDs** (`YYYY-MM-DD-HH`) are checked via regex.
- **`limit`** is capped at 500 max; `limit`/`offset` must be non-negative integers.
- **Free text** (title, folder name, search term, filter) is limited to 500 characters; storage paths to 4000.
- **Bodies** are verified as objects before access (arrays and scalars ⇒ 400).
- **Login** now only accepts non-empty strings for `username`/`password` (max. 200 characters) — this keeps, among other things, object payloads and very large inputs away from the expensive bcrypt comparison. Wrong password remains correctly 401.
- **`role`** is now validated against `webAuthDb.ROLES` in both routes and rejected with 400 instead of being silently dropped (the case described above).

Deliberately kept generous so nothing existing breaks: optional parameters stay optional (missing ≠ invalid), `newParentId: null` and `folderId: null` remain allowed (moving to top level or out of a folder), and `afterPosition: 0` remains valid ("move to the very front").

Verified: `smoke-writes.js` still 12/12 green; all read and write routes checked against a running server with valid requests (unchanged 2xx); broken requests (`?date=broken`, `?limit=-5`, `?limit=999999`, overly long free text, `order: "notanarray"`, array-instead-of-object body, playlist ID `notgood`, position `abc`) now consistently return 400 with an understandable message instead of a crash or silent misbehavior. API mode (`smoke-reads-api.js`) was not run — a reachable mAirListDB server instance is missing here.

### 1.7 File upload: type/size checked, but the extension filter is client-controlled
**Location:** `server/routes/library.js:21, 40-51`
`ALLOWED_AUDIO_EXTENSIONS` (`wav/mp3/aac/flac/ogg`) and a 500 MB limit are correctly configured via multer. However, the filter only checks the file extension from `file.originalname` (set by the client), not the actual file content/MIME type (e.g. magic bytes). An attacker with `library.write` scope could upload an arbitrary file with an `.mp3` extension.
**Assessment:** low (upload already requires authentication + `library.write` scope; the file lands in a defined storage directory, no direct RCE risk apparent, but potentially useful for storage-space abuse or misdeclared content).
**Suggestion:** Optionally add a magic-byte check (e.g. the `file-type` package) if the threat model includes untrusted `library.write` users.

### 1.8 `apiRepository.js`: timeouts present, but no health-check fallback
**Location:** `server/data/apiRepository.js:33, 157-179, 729-741`
All requests to the mAirListDB server go through `REQUEST_TIMEOUT_MS = 10000` with `AbortController` — both in `doApiRequest()` and `getAudioStream()`. This is cleanly implemented.
**Assessment:** no finding / positive.

### 1.9 SSRF risk with custom listener-count URL — ✅ fixed (2026-09-09)
**Location:** `server/lib/listenerSource.js:20-30, 51-58`
The `custom` mode of the listener-count display lets admins (`requireScope("admin")` in `library.js:443` for `PUT /api/settings`) configure an arbitrary `listenerUrl`, which the server fetches server-side via `fetch()` (`fetchJson()`), including a path into the response configurable via `listenerJsonPath`. There was no check against `localhost`/`127.0.0.1`/private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) or cloud metadata addresses (`169.254.169.254`). Since the route already requires `admin` scope, the risk is limited to malicious/compromised admin accounts, but it is a classic SSRF pattern (server fetches a user-configured URL, response content is returned).
**Assessment:** medium (exploitation requires admin rights, but that's exactly what the endpoint is for — no additional protection was in place).
**Fixed:** `assertUrlAllowed()` in `server/lib/listenerSource.js` checks before every custom fetch: only `http`/`https`, no `localhost`/`.local`, and — after DNS resolution — no loopback, private, or link-local addresses (including cloud metadata `169.254.169.254`), both IPv4 and IPv6. The check deliberately operates on the resolved IP so a hostname pointing to `127.0.0.1` cannot bypass it. Only active in `custom` mode; laut.fm is unchanged. Rejected URLs return `{ available: false, error }` instead of crashing. Verified against eight attack variants (localhost, 127.0.0.1, 169.254.169.254, 192.168.x, 10.x, `file://`, `[::1]`, malformed URL) — all blocked, legitimate external URLs remain reachable.
**Residual risk:** The check is not fully DNS-rebinding-proof — there is a second, unchecked resolution between the check and the actual `fetch()` (TOCTOU). Acceptable for an admin-scope feature; a hard mitigation would need a dedicated agent that checks the target IP per connection.

### 1.10 CORS configuration
**Location:** `server/index.js:13-28`
CORS is restricted to `ALLOWED_ORIGINS` (env-controlled), with `credentials: true`. A missing origin (curl/Postman/same-origin) is allowed across the board — acceptable for a dev setup, somewhat generous in production, but since `credentials: true` only applies with an explicit origin header, the risk is low.
**Assessment:** low.

### 1.11 Missing security headers
**Location:** `server/index.js` (entire file)
No `helmet` or manual security headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc.). For a pure JSON API with a separately hosted frontend build (`express.static`), the risk is limited, but standard practice is completely missing.
**Assessment:** low.
**Suggestion:** Add `helmet` with default settings, adjust CSP as needed for audio streaming/inline styles.

### 1.12 Dependencies (`npm audit`) — ✅ partially fixed (2026-09-09)
**Backend (`server/package.json`):**
- `multer` — ✅ **fixed**: bumped from 2.2.0 to 2.3.0, eliminates all four DoS CVEs (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4, GHSA-qvfw-j98x-7q72). No breaking change: the API used (`memoryStorage`, `single()`, `limits`, `fileFilter`) is unchanged, `library.js` needed no adjustment. `body-parser` was pulled to 1.20.8 along with it.
- `qs` (moderate, transitive via express) — ⚠️ **open**: Express 4 hard-pins `qs` to `~6.15.1`, and the patched 6.16.0 lies outside that range. A fix requires either Express 5 (major, breaking) or a forced `overrides` entry. Deliberately left out of scope for the security fix. `body-parser` already uses 6.16.0 internally; only Express's own query parser is still affected.
- Versioning: `bcryptjs`, `better-sqlite3`, `cookie-parser`, `cors`, `express`, `multer` are all pinned with `^` (caret range) — except `dotenv`, which is deliberately pinned exactly to `16.4.5` (see `README.md:115-116`, referencing the dotenv-17 prompt-injection incident). This is inconsistent: if the dotenv history is cited as the reason for exact pinning, it would be worth considering whether the other direct dependencies (especially `multer`, which currently has active CVEs) should also be pinned more tightly or at least monitored via lockfile + CI audit. Currently the project relies on caret ranges for all other packages, which automatically allows future minor updates.

**Frontend (`frontend/package.json`):**
- `vite` (`^4.4.9`) — **high/moderate**: several known vulnerabilities (path traversal, dev-server request leak), fix only available via a major upgrade to vite 8.
- `esbuild` (transitive via vite) — moderate.
- Pure dev dependencies (`vite`, `esbuild`, `@vitejs/plugin-react`, etc.) only affect the local development environment, not the production build itself — risk thereby limited, but should still be updated.

**Assessment:** medium — the only `high` vulnerability (multer) has been eliminated; the remaining ones are moderate and both depend on major upgrades.
**Open items for a dedicated pass:**
1. **Express 4 → 5** — resolves the `qs` gap. Breaking changes in routing/middleware, needs a test pass across all routes.
2. **Vite 4 → 8** — resolves the esbuild gap. Only affects the dev server, not the production build, hence low urgency.
3. **Pinning strategy** — after the update, verified that the three changed packages (multer, body-parser, qs) carry no `preinstall`/`install`/`postinstall`/`prepare` scripts; a lesson from the dotenv-17 incident. Dependabot/Renovate + a CI audit gate would be a more durable safeguard than manually pinning every package.

---

## Area 2: Documentation

### 2.1 `getItemHistory()` return format differs between SQL and API repository — ✅ fixed (2026-09-09)
**Location:** `server/data/sqlRepository.js:381-402` vs. `server/data/apiRepository.js:664-685` vs. `frontend/src/pages/ItemEditor.jsx:1218`
- `sqlRepository.js#getItemHistory` returns `{ slot, date, hour }`.
- `apiRepository.js#getItemHistory` (commented as "mirrors" the API) returns `{ playedAt, show, moderator }` and its comment (`apiRepository.js:668-675`) explicitly flags this inconsistency: *"sqlRepository.js's getItemHistory() returns { slot, date, hour } instead, which that same table doesn't read — a pre-existing mismatch in the sqlite path, left alone here"*.
- The frontend (`ItemEditor.jsx:1218`) reads `entry.playedAt` — this field only exists in API mode. In `DATA_SOURCE=sqlite` mode (per `.env.production.example:16`, the **default production mode**), the history table in the item editor therefore presumably shows "-" for every entry instead of a date, because `playedAt` is `undefined` there.
- The git log shows a commit `10043d1 fix: getItemHistory liefert playedAt fuer die Verlauf-Tabelle` — suggesting this was already fixed on the API path, but the SQL path was, per an explicit comment, deliberately left untouched.
**Assessment:** medium to critical — depending on whether `sqlite` is the actually used production mode (per `.env.production.example`, yes). If so, the history table in the item editor is presumably functionally broken in production (shows no date).
**Fixed:** `sqlRepository.js#getItemHistory` now additionally returns `playedAt`, `show`, and `moderator` in the API repository's format. `slot`/`date`/`hour` are preserved (verified beforehand: nobody reads them outside this function). The suspicion was confirmed — verified against the test DB: before the fix, `playedAt` was `undefined` for all entries; now all 43 entries return valid date values, sorting and hour distribution work.
**Known limitation:** The `playlist` table only knows date + hour, so the timestamp is hour-precise (minutes always `:00`) — unlike `api` mode with an exact time. Deliberately constructed without a timezone suffix so the hour isn't shifted when parsed in the browser. Commented in the code.

### 2.2 README claims DB access via a "real SQL server", but SQLite actually runs
**Location:** `README.md:39` vs. `README.md:41`
Line 39: *"mAirListDB runs on a real SQL server (PostgreSQL, MariaDB/MySQL, or MSSQL). Direct database access is possible."* Line 41 right after: *"Current mode: real SQLite DB."* This isn't wrong on its own (both sentences are correct in the context of the broader mAirList ecosystem), but the sequence is confusing for newcomers — the first sentence suggests SQL-server access, the second seems to immediately contradict it. Not a factual error, but a phrasing/ordering issue.
**Assessment:** low.
**Suggestion:** Reorder the paragraph: explain the current SQLite mode first, then mark the optional direct SQL-server access as a future option/alternative.

### 2.3 `docs/FEATURES.md` and `README.md` phase status appear more optimistic than the code in some places
Not fully verifiable without a complete comparison of every phase against the code, but as a note: `README.md:81` (phase F) lists "conflict detection still missing" for multi-user playlists — consistent with the code (`reorderPlaylist`/`insertPlaylistItem` in both repositories have no version/conflict check other than the unverified `VersionInfo` passthrough in `apiRepository.js:887-898`). No contradiction found, but worth noting: the `VersionInfo` mechanism in `writeHour()` (API path), per its comment (`apiRepository.js:873-875`), is not checked for conflicts — matches the doc's "still missing" statement, but isn't explicitly marked as an open item in the code itself (only implied via the comment).
**Assessment:** low (docs and code largely agree, but the open item is only visible in the code as an incidental comment, not as a TODO/FIXME).

### 2.4 Missing module documentation
**Location:** `server/data/repository.js` (mock repository)
The file was not read in full (outside the scope of the core review), but `apiRepository.js` and `sqlRepository.js` are both thoroughly and consistently commented (header comments per function, rationale for design decisions). This is positive and above average for this project — no negative finding here, more of a compliment.
**Assessment:** no finding / positive.

### 2.5 Onboarding: README + DEPLOYMENT.md + SETUP.md are fundamentally sufficient
`DEPLOYMENT.md` covers Windows deployment including build-tools pitfalls (`better-sqlite3` compilation) in detail, and per its own account ("Production deployment — experience", `DEPLOYMENT.md:108-113`) has already been carried out and verified once for real. One step is missing, however:
**Location:** `DEPLOYMENT.md:34-55` (step 3, configure environment)
It is not mentioned that `DATA_SOURCE=api` mode also requires setting `API_DB_USER`/`API_DB_PASSWORD` (these are commented out in `.env.production.example:23-24`) — anyone trying to start directly in `api` mode gets no hint in `DEPLOYMENT.md`, only the comment in the `.env` file itself.
**Assessment:** low (the default mode is `sqlite`, `api` mode is not yet complete per the README — hence lower priority).
**Suggestion:** A short paragraph in `DEPLOYMENT.md` for the optional `api` mode, referencing `docs/MAIRLISTDB-API.md`.

### 2.6 Dead/commented-out code — ✅ fixed (2026-09-10)
**Locations:**
- `server/data/repository.js:322,330,347,362,532,540,548,558,622,694,755,773,789` — consistently `TODO: replace with a real SQL ... once the schema is confirmed` comments. The schema has long since been confirmed (`docs/SCHEMA.md` exists, `sqlRepository.js` is in production) — this file is therefore presumably the original mock repository and is now only used as the `DATA_SOURCE` fallback (`mock`). The TODOs are outdated beyond the point where they still make sense (the real SQL implementation has long existed in parallel in `sqlRepository.js`).
- `server/data/apiRepository.js:1336` — another TODO ("this type list is incomplete...") that is understandable and still current in the function's context (not a dead-code finding, mentioned only for completeness).
- `server/data/sqlRepository.js:788-790` — TODO about `writeHour()`, deliberately documented as a compromise solution (full delete+reinsert instead of a targeted position shift); well justified, no action needed absent an acute problem.
**Assessment:** low (no security relevance, but cleanup potential: `repository.js`'s TODOs should either be removed/reworded, if `mock` mode remains permanently a pure test/demo mode with no SQL ambition, or the file should be clearly marked as "for mock purposes only, no longer an implementation target").
**Fixed:** All 13 outdated `TODO: replace with a real SQL ...` comments removed from `repository.js`; the file header now clarifies that `repository.js` is permanently the `DATA_SOURCE=mock` test/demo mode and no longer an implementation target. The two still-current TODOs (`apiRepository.js`, now in `apiItems.js`, incomplete type list; `sqlRepository.js:793`, deliberate compromise in `writeHour()`) remain unchanged — both are already documented in `docs/FEATURES.md`, not hidden only in the code.

### 2.7 Smoke-test scripts (`server/scripts/*.js`) are well documented, but not mentioned in `DEPLOYMENT.md`/`README.md` as a CI artifact
**Location:** `server/scripts/smoke-reads-api.js` (329 lines, written very carefully, with clear assertions and comments)
These scripts are mentioned in `README.md:43` ("19 smoke tests"), but there is no `npm script` in `server/package.json` that calls them (no `"test"` script defined). Anyone wanting to run the smoke tests has to manually pull the `node server/scripts/smoke-reads-api.js` invocation from the comment at the top of the file.
**Assessment:** low.
**Suggestion:** Add `"smoke:reads": "node scripts/smoke-reads-api.js"` etc. as npm scripts in `server/package.json`.

---

## Area 3: Efficiency & code quality

### 3.1 Further N+1-like patterns beyond `getPlaylistsByDate`
**Location 1:** `server/data/apiRepository.js:793-806` (`getPlaylistsByDate`)
As already known in the brief: 24 parallel requests per day view. The code itself comments this as a deliberate tradeoff (`apiRepository.js:787-792`), cushioned by the concurrency limiter.

**Location 2:** `server/data/apiRepository.js:1194-1197` (`getFolderById`) and `442-448` (`getItemFolders`)
Both functions load the **entire folder tree** (`getFolders()`, per the comment a "155-folder tree") on every call, just to look up a single ID. If `getFolderById` is called repeatedly in sequence (e.g. `renameFolder`/`moveFolder` each call it once, see `apiRepository.js:1218-1234`), multiple full tree fetches occur per user action instead of a cached access.

**Location 3:** `server/data/sqlRepository.js:141-149` (`getFolderChildren`)
```js
items: itemIds.map((itemId) => getItemById(itemId)).filter(Boolean),
```
A separate `getItemById()` is called for each item in a folder, which internally runs 3 additional queries (`item_cuemarkers`, `item_attributes`, `item_folders` — see `rowToItem()`, `sqlRepository.js:293-336`). For a folder with, say, 50 items, that's ~200 individual queries instead of one joined bulk read. For local SQLite access the per-query latency is small, but for larger folders (libraries with thousands of items) this doesn't scale well.

**Location 4:** `server/data/apiRepository.js:911-914` (`getRawPlaylistItems`) is called individually by `reorderPlaylist`, `insertPlaylistItem`, `removePlaylistItem`, `savePlaylistItemOverrides` each (read-modify-write pattern), plus `writeHour()` reads the hour again for `VersionInfo` (`apiRepository.js:888-889`) — so at least 2 GET requests before the actual PUT per playlist write operation. Uncritical for individual actions, but could be batched for bulk operations (e.g. inserting several items in sequence).

**Assessment:** low to medium (performance optimization, not a functional bug; relevance increases with library size/user count).
**Suggestion:** For `getFolderById`/`getItemFolders`, consider a short-lived in-memory cache of the folder tree per request cycle. For `getFolderChildren` (SQL path), a joined bulk query instead of N individual calls to `getItemById`.

### 3.2 Redundancy between `sqlRepository.js` and `apiRepository.js` — ✅ fixed (2026-09-10)
**Locations:** `CUE_TO_DB`/`DB_TO_CUE` (`sqlRepository.js:83-89` identical to `apiRepository.js:203-209`), `typeToCode()` (`sqlRepository.js:92` identical to `apiRepository.js:211`), `parsePlaylistId()` (`sqlRepository.js:110-114` nearly identical to `apiRepository.js:808-814`), `secondsToClock`/`resequenceEntries` logic (`sqlRepository.js:774-785` vs. `apiRepository.js:761-772`, both comments explicitly reference each other as "mirrors").
This duplication is documented as deliberate in several places in the code itself (e.g. `apiRepository.js:198-201`: "Mirrors sqlRepository.js's..."), presumably to keep the two repositories independently changeable while `DATA_SOURCE` switches between them. This is an understandable tradeoff, but if the cue-marker names (`CUE_TO_DB`) change, both files would need to be kept in sync — easy to forget.
**Assessment:** low (architectural decision, no acute source of bugs, but a maintenance risk).
**Suggestion:** Extract `CUE_TO_DB`/`DB_TO_CUE`, `typeToCode`, `parsePlaylistId`, and the seconds-to-clock conversion into a shared `server/data/shared.js` (or similar) imported by both repositories — reduces drift risk without content-coupling the repositories.
**Fixed:** `CUE_TO_DB`/`DB_TO_CUE`, `typeToCode`, `parsePlaylistId`/`playlistId`, and `secondsToClock` extracted to `server/data/shared.js`, imported by `sqlRepository.js` and `apiRepository.js` (now `apiItems.js`/`apiPlaylists.js`). `typeToDb()` (sqlRepository only) and the surrounding resequence iteration/mutation logic (different in both files: FixTime override on the API path, in-place mutation on the SQL path) deliberately NOT unified. `repository.js` (mock) deliberately not connected, stays independent. Export interface of both repositories compared before/after diff (identical).

### 3.3 `apiRepository.js` is very large (1476 lines) — ✅ fixed (2026-09-10)
**Location:** `server/data/apiRepository.js` (entire file)
The file covers items, folders, playlists, audio streaming, attribute parsing (XML regex), artist/title search, and permissions/capabilities in one file. Very well commented, but topically broad.
**Assessment:** low (pure maintainability recommendation, not a bug).
**Suggestion (not to be implemented, recommendation only):** A split by domain is conceivable, e.g. `apiRepository/items.js`, `apiRepository/folders.js`, `apiRepository/playlists.js`, `apiRepository/attributes.js`, with an `index.js` that combines everything (similar to the existing `module.exports` pattern). The shared `apiRequest()` helper (lines 140-196) and the concurrency/retry logic (lines 35-104) would be a natural shared core.
**Fixed:** Split by domain into `apiClient.js` (apiRequest, concurrency queue, retry logic, error types, auth), `apiItems.js` (items, mapping, search, attributes, artists/titles), `apiFolders.js` (folder CRUD/tree), `apiPlaylists.js` (read/write playlists), `apiAudio.js` (storage/audio streaming). `apiRepository.js` is now a thin facade (228 instead of 1458 lines), re-exports all submodules unchanged, and only keeps genuine cross-domain compositions (`getFolderChildren`, `getDashboardStats`, `getTodayPlaylist`, storages, permissions/capabilities, log stubs). Module dependencies form an acyclic graph (no circular require). Facade's export interface compared before/after diff (57 function names, identical), no caller in `routes/`/`scripts/` needed adjustment.

### 3.4 Frontend: inconsistent hooks usage
**Location:** `frontend/src/pages/ItemEditor.jsx` (largest file with recognizable `.map`/`.filter` patterns in the component body, but already uses `useMemo`/`useCallback` elsewhere per grep hits)
A detailed line-by-line check of all computations was not fully possible within the given scope (file was not read in its entirety). The fact that `historyStats.js` has already been specifically fixed for performance (see git history/brief), however, suggests that similar spots in `ItemEditor.jsx` (cue-marker lists, attribute lists) have not yet been consistently checked for `useMemo`.
**Assessment:** low (not conclusively verified, flagged as a note for a targeted follow-up rather than a confirmed finding).
**Suggestion:** Targeted follow-up review of `ItemEditor.jsx`, `Playlist.jsx`, and `MixEditor.jsx` for expensive re-renders (e.g. sort/filter lists on every keystroke in the search field) with the React DevTools Profiler.

### 3.5 Backend error handling: consistent, one outlier
**Locations:** `server/routes/library.js`, `server/routes/auth.js` (all handlers)
Almost all route handlers consistently follow the `try { ... } catch (e) { next(e); }` pattern, handled centrally in `server/index.js:55-59` (including sensible status codes via `err.status`). One outlier:
**Location:** `server/routes/library.js:327-341` (`POST /api/upload`)
```js
router.post("/upload", requireScope("library.write"), (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    ...
    try {
      const item = repo.uploadFile(...);
      ...
    } catch (e) { next(e); }
  });
});
```
Here the multer error is answered directly with a hard `400` instead of going through `next(e)` — this is functionally plausible (multer errors are practically always client errors: file size/type), but inconsistent with the otherwise consistent `next(e)` pattern and bypasses the central error handler/logging (no `console.error` log for failed uploads).
**Assessment:** low.
**Suggestion:** Use `next(err)` here too, and set `err.status = 400` before throwing if needed, so the central handler picks it up and logs it.

---

## Summary: the 5 most important points to start with

**As of 2026-09-09:** All five original priorities have been worked through in two targeted passes (one commit per item):

1. ~~**`getItemHistory()` format inconsistency between SQL and API path** (2.1)~~ — ✅ fixed. The suspicion was confirmed: in `sqlite` mode the history view was indeed empty. `playedAt` is now set there too.

2. ~~**`multer` security vulnerabilities (high)** (1.12)~~ — ✅ fixed: multer 2.2.0 → 2.3.0. Only the moderate `qs` gap remains, which depends on an Express 5 upgrade.

3. ~~**No brute-force protection on login** (1.4)~~ — ✅ fixed: in-memory rate limiting by username and IP, configurable via env.

4. ~~**SSRF with custom listener-count URL** (1.9) and **`secure: false` in the session cookie** (1.3)~~ — ✅ both fixed: URL validation with DNS resolution and `COOKIE_SECURE` env variable, respectively. For the TLS deploy (phase H), only `COOKIE_SECURE=true` still needs to be set.

5. ~~**Real server IP in `server/.env.production.example`** (1.1)~~ — ✅ fixed, replaced with `<SERVER-IP>`. Note: still visible in git history.

Also done: bcrypt cost 10 → 12 (1.5).

### Sensible next steps

Since the original top-5 list has been worked through, these items move up:

1. **Upload validation only via file extension** (1.7) — the type filter checks `originalname`, not the content. Currently the most significant open security item.
2. **Missing security headers** (1.11) — low effort. (~~Input validation in the routes, 1.6~~ — ✅ fixed, see above.)
3. **Express 4 → 5** (1.12) — closes the last reported backend gap (`qs`), but needs a test pass across all routes.
4. ~~Cleanup work: outdated TODOs in `repository.js` (2.6), code duplication between the two real repositories (3.2), `apiRepository.js` size (3.3)~~ — ✅ all three fixed (2026-09-10), see there. Still open: missing npm scripts for the smoke tests (2.7).
