# ✨ Feature Catalog

Complete feature scope of the mAirListDB client, researched from the official docs (mairlist.docs.mairlist.com), the old wiki (wiki.mairlist.com), the release notes, and the community forum. The new docs are partially incomplete (Scheduling and Mix Editor are empty stubs there); these gaps were filled from the wiki, release notes, and forum.

Legend: ✅ done (against mock) · 🚧 in progress · ⬜ open · 🔽 later phase · ❌ out of scope

## 🗺️ Phase status

| Phase | Content | Status |
|---|---|---|
| A | Frontend against mock: item list, item editor (all 6 tabs), cue editor (markers, zoom, priority sorting), file upload, playlist in the mAirList layout, empty hours, drag-and-drop, local overrides vs. DB save | ✅ fully complete |
| B–E | see the section tables below (library refinements, mix editor, voice tracking) | ⬜ open |
| F | Multi-user: dedicated user management with bcrypt, 5 roles, bootstrap admin — see section table below | 🟡 user management complete, conflict detection open |
| G | Real database: connect `.mldb` (SQLite) instead of mock | ✅ complete |
| — | Third data source: mAirListDB server REST API instead of direct SQLite access (`DATA_SOURCE=api`) — see [section table below](#-api-based-data-source-mairlistdb-server) | 🟡 core functions complete, some features deliberately still open |
| H, I | unchanged, open | ⬜ open |

**Phase G – completed:**
- `server/data/sqlRepository.js` created with `better-sqlite3`, identical signatures to `repository.js`
- Column mapping complete: `items`, `item_cuemarkers`, `item_attributes`, `item_folders`, `playlist`
- Cue-type mapping implemented: camelCase code ↔ PascalCase DB (`cueIn` ↔ `CueIn` etc.)
- Playlist slot format parsed correctly (midnight without a time, other hours with `.000`)
- Switchable via `DATA_SOURCE=sqlite`, DB path via `DB_PATH`
- Write proof passed: create item, restart server, item still present
- Playlist insert also tested and works
- `.mldb` files in `.gitignore`, never committed to the repo

**Read paths:**

| Function | Status |
|---|---|
| `getFolderTree`, `getFolderById`, `getFolderChildren` | ✅ |
| `getStorages` | ✅ |
| `getItemTypes`, `getArtists`, `getAttributeKeys`, `getAttributeDefinitions` | ✅ |
| `getItems`, `getItemById`, `searchItems` | ✅ |
| `getCuePoints`, `getItemHistory` | ✅ |
| `getPlaylistsByDate`, `getPlaylistById` | ✅ |
| `getUserByUsername`, `getUserById`, `getScopesByUserId`, `getScopesByGroupId` | ✅ |
| `getSessionBySid` | ✅ |

**Write paths** (smoke-tested against a copy `mairlist.test.mldb`, see `server/scripts/smoke-writes.js`):

| Function | Status |
|---|---|
| `createItem` | ✅ |
| `updateItem` | ✅ |
| `deleteItem` | ✅ |
| `moveItemToFolder` | ✅ |
| `createFolder` | ✅ |
| `renameFolder` | ✅ |
| `moveFolder` | ✅ |
| `deleteFolder` | ✅ |
| `insertPlaylistItem` | ✅ |
| `removePlaylistItem` | ✅ |
| `reorderPlaylist` | ✅ |
| `savePlaylistItemOverrides` | 🟡 not smoke-tested |
| `createSession`, `deleteSession` | 🟡 not smoke-tested |
| `createStorage`, `updateStorage`, `deleteStorage` | 🟡 not smoke-tested |
| `uploadFile` | 🟡 not smoke-tested |

**Open TODOs in sqlRepository.js:**
- `getItemHistory()` returns an empty array; `playlistlog` itself is now connected via `getLogs()`/`getRecentLogs()` for the logs page and the dashboard
- `writeHour()` does a DELETE+INSERT of the whole hour instead of targeted position shifts
- `cover` and `containerType` remain `null` (`xmldata`/`options` not yet parsed)
- Still open from FIELD-SEMANTICS.md: `items.color` format, `items.endtype` values, `playlist.xmldata` override format, `item_cuedata.xmldata` for envelopes

---

## 🔌 API-based data source (mAirListDB server)

Third repository implementation alongside mock and SQLite:
`server/data/apiRepository.js`, enabled via `DATA_SOURCE=api`. Instead of
opening the `.mldb` file directly with `better-sqlite3`, it talks to the
mAirListDB server via its REST API (port 8840, see
[`docs/MAIRLISTDB-API.md`](MAIRLISTDB-API.md)). This structurally solves
the SQLite locking problem ("database is locked" while mAirList runs in
parallel), since the same file is no longer accessed directly.

Configuration: `API_DB_BASE_URL`, `API_DB_USER`, `API_DB_PASSWORD`,
`API_DB_STATION` in `.env` (see `server/.env.production.example`). The
webinterface's own user management (`server/data/webAuthDb.js`, bcrypt)
is independent of `DATA_SOURCE` and works identically in all three modes.

Verified with 19 smoke tests against the production instance
(`server/scripts/smoke-reads-api.js`, `smoke-writes-api.js`). The core
workflow (folder tree, read/edit/save items, audio streaming, read/edit
playlist) is thereby usable in production and verified live against the
real mAirList installation — including the structural elimination of the
SQLite locking conflict with mAirList running in parallel.

**Concurrency limit against "database is locked":** At around 12
parallel requests, the mAirListDB server itself reported `database is
locked` (it also opens the `.mldb` internally via SQLite). `apiRepository.js`
therefore throttles outgoing requests to `API_DB_MAX_CONCURRENT`
(default 3, see `server/.env.production.example`) instead of firing them
off unlimited in parallel.

**Pitfall — async stub function + synchronous `res.json()`:** Route
handlers in `server/routes/library.js` call some repository functions
synchronously (`res.json(repo.getX())`, without `await`), matching
`sqlRepository.js`'s synchronous functions of the same name. An `async`
function in `apiRepository.js` at that spot causes `res.json()` to
receive an unresolved promise, which serializes to `{}` instead of the
expected array (frontend symptom: `[...items]` fails because `{}` is not
iterable). The `emptyStub()` stubs in `apiRepository.js` are therefore
deliberately synchronous.

**Available:**

| Function | Status |
|---|---|
| `getCapabilities`, `getPermissions` | ✅ |
| `getFolders` (flat list) | ✅ |
| `getFolderTree` (built client-side, nested, from `getFolders()`) | ✅ |
| `getItemsByFolder`, `getItemById`, `getItemsByIds` | ✅ |
| `getItemFolders`, `getItemRestrictions`, `getItemHistory` | ✅ |
| `getPlaylistHour`, `getPlaylistAttributes`, `getPlaylistsByDate`, `getPlaylistById` | ✅ |
| `writeHour` (save a playlist hour, full replacement) | ✅ |
| `getArtists`, `getTitles` (distinct lists) | ✅ |
| `getAudioStreamUrl`, `getAudioStream` (audio proxy, original + low-quality; credentials stay server-side, never reach the frontend) | ✅ |
| `updateItem` (save items incl. cue points, gain, attributes) | ✅ |
| `getFolderById`, `getFolderChildren` (filtered client-side from `getFolders()`) | ✅ |
| `getItems` (only with `folderId`, see below) | ✅ |
| `reorderPlaylist`, `insertPlaylistItem`, `removePlaylistItem` (read-modify-write on the raw `Items[]`, see below) | ✅ |
| `savePlaylistItemOverrides` | 🟡 only cue markers (`Markers`), other override types are discarded for lack of a known target field |
| `getConfig` (`/api/v1/config`) | ✅ |
| `getAttributeKeys` (from `getConfig()`'s `StandardAttributes` XML, see below) | ✅ |
| `getDashboardStats`, `getTodayPlaylist` (see below) | ✅ all four dashboard values are real (no more `null`) |
| `getStorages` (`/api/v1/storages`, see below) | ✅ verified, endpoint exists (tested live: 2 storages) |
| Folder CRUD: `createFolder`, `renameFolder`, `moveFolder`, `deleteFolder` (see below) | ✅ verified against the real server |
| `createItem`, `deleteItem` (see below) | ✅ verified; folder assignment implemented via `folderId` (`assignItemsToFolder`) |
| `moveItemToFolder`, `setItemFolders`, `removeItemFromFolder` (see below) | ✅ body format verified via Wireshark (`movefrom`/`delete` flag, `PUT /items/<id>/folders`) |

**Playlist write operations — read-modify-write on raw entries:**
The API only knows how to read/write the entire hour (no endpoint to
insert/remove/reorder individual slots). `reorderPlaylist`,
`insertPlaylistItem`, and `removePlaylistItem` therefore first read the
raw, unmodified `Items[]` entries of the hour (`getPlaylistHour`), mutate
the array in memory, and write it back in full (`writeHour`). Important:
this operates on the **raw** API entries, not on an internal
`{time, item}` representation — dummy entries (`Class:"Dummy"`, e.g.
"PH hour start") have no `DatabaseID`, but do have fields such as
`Timing`/`State`/`Customized`/`FixTimeFrame`/`FixTime` that an internal
item representation cannot map. Only newly inserted entries are freshly
built from the internal item object; everything else passes through
unchanged. `savePlaylistItemOverrides` merges cue overrides directly into
the `Markers` field of the raw entry (the only known, safely
round-trippable per-slot field); other override types have no known
target field in the API and are discarded instead of guessed.

**Container items (ad blocks) in `getPlaylistById`:** Playlist entries of
the API type `Class: "Container"` (e.g. ad blocks with nested items, see
`docs/MAIRLISTDB-API.md`) are still kept as a single playlist entry, but
now additionally carry their nested `Items` list (one level deep) as
`item.subItems` — `mapApiItemToInternal` in `apiItems.js` maps them
recursively. In the frontend (`Playlist.jsx`), a container row can be
opened via an expand arrow and then shows the sub-items as indented rows
underneath. A container with no sub-items of its own shows a hint text
instead of an error when expanded.

**Hook-container content editable (api mode):** For hook containers and
automatic hook containers (`Class: "HookContainer"` /
`"AutoHookContainer"`), the expanded container row additionally shows an
"Edit" button. In edit mode, sub-items can be removed (X per row),
reordered via drag & drop, and new elements can be added via a search
field (uses `searchItems()`). "Save" calls
`PUT /api/items/:id/container-contents` (body: `{ itemIds: [...] }`,
order = desired order), which on the backend goes to `apiItems.js`'s
`updateContainerContents()`: loads the current container state (so
Class/Type/InnerFadeDuration/Options are preserved), resolves each
itemId to the full item object, and writes back `Playlist.Items` plus a
`Comment` built from the titles (see `docs/MAIRLISTDB-API.md`, "Setting
hook-container content"). After saving, only the affected playlist entry
is replaced locally, no reload of the whole hour.

Only available in api mode (`DATA_SOURCE=api`) — the edit button doesn't
even appear in mock/sqlite mode; the route there responds with a clear
error message instead of a fake success. News containers remain
read-only (different content structure, see "Comparison" in
`docs/MAIRLISTDB-API.md`).

**Region-container content editable (api mode):** For region containers
(`Class: "RegionContainer"`), the expanded container row also shows an
"Edit" button, but with one tab per region instead of a single list. The
number of tabs results from the actually present `Content` keys (plus a
"+Region" button for the next free number) — there is no fixed number of
regions. Each region internally uses the same row list (remove/reorder
via drag & drop/add via search) as the hook-container editor
(`ItemRowList` component, shared between both editors). An empty region
is a valid state, not an error.

"Save" calls `PUT /api/items/:id/region-container-contents` (body:
`{ regions: { "1": [itemId, ...], "2": [...] } }`), which on the backend
goes to `apiItems.js`'s `updateRegionContainerContents()`: resolves the
itemIds for each region to full item objects (shared helper function
`resolveItemsForContainer`, also used by the hook-container path) and
builds the double nesting `Content[region].Items[0].Playlist.Items[...]`
(see `docs/MAIRLISTDB-API.md`, "Creating/updating region containers").
Convenience features like "equal length for all regions" (as in the
mAirList client) were deliberately not replicated — regions are, per
feedback, practically never used.

**Deliberately empty instead of an error** (`getLogs`, `getRecentLogs`):
These functions return an empty array instead of an error in api mode.
Reason: the frontend (`Playlist.jsx`, `DatabaseManager.jsx`) loads the
folder tree together with such lists in a shared `Promise.all` — if even
one of them threw, the entire batch would fail and the sidebar would
show "tree unavailable" even though `/api/tree` itself succeeded. An
empty array lets the UI load; there is (still) no corresponding
single-shot endpoint for `getLogs`/`getRecentLogs` in the mAirListDB
server API (see `docs/MAIRLISTDB-API.md`). `getItems` also returns `[]`,
but only if no `folderId` is passed (see below) — with `folderId` it
returns real data. Each of these functions logs a `console.warn` line
once per server start on first call, so the empty state remains visible
in the server log without spamming on every request.

**`getItemTypes` – hardcoded, mostly verified list**: No
`/api/v1/itemtypes` endpoint exists. `apiItems.js` therefore returns a
fixed list, verified via a live query against the real database: 24 of
27 types from the mAirList client dropdown (full table in "Item types
(`Type` field)" in `docs/MAIRLISTDB-API.md`). Not verified (not present
in the inventory): Cartwall page, Custom 1-3. Containers are not a
separate `Type` value, but recognizable via the `Class` field — see the
⚠️ note there, an easily overlooked trap for any type-based logic. So
that items with a not-yet-captured type still display correctly, the
type dropdown in `ItemEditor.jsx` shows the raw value as an extra option
for an unknown value, instead of staying empty or crashing.

**`getAttributeKeys` — from the config schema, not from item data:**
Unlike `sqlRepository.js` (which aggregates the actually observed
attribute values from the items), `apiRepository.js`'s
`getAttributeKeys()` reads the attribute **schema** from
`/api/v1/config`'s `StandardAttributes` XML field (see
`docs/MAIRLISTDB-API.md`). `values` is therefore only populated for
`Kind="DropDown"`/`"Check"` attributes (whose allowed values are in the
schema); free-text attributes return `values: []`, even if values for
them already exist in the inventory. Parsing uses a targeted regular
expression instead of an XML parser (no XML dependency in the project,
tightly scoped format).

**`getStorages` — verified:** `GET /api/v1/storages?station=1` does
exist, tested live against the production instance (2 storages),
response fully documented in `docs/MAIRLISTDB-API.md`: a
`{value, Count}` wrapper like `/folders` (not a raw array), entries with
`ID`/`Name`/`Description`/`DefaultLocation`/`ItemCount`.
`getStorages()`/`mapApiStorageToInternal()` map this to
`{ id, name, location }`, analogous to `sqlRepository.js`'s shape
(`location` comes from `DefaultLocation`).

**Folder CRUD — verified:** `POST`/`PUT`/`DELETE /api/v1/folders...`
exist, tested live against the production instance (see
`server/scripts/smoke-writes-api.js`, section "folder CRUD"). `PUT`
serves both renaming and moving — the complete body (`Name` + `Parent`)
is always sent; `renameFolder`/`moveFolder` first fetch the other,
unchanged field via `getFolderById()`. `POST`'s response is the newly
created object incl. `ID`; `PUT`/`DELETE` respond with `null`, which is
why `renameFolder`/`moveFolder` re-read via `getFolderById()` afterward
to return the updated object. The top-level parent is the string
`"root"` (as with `getFolders()`), represented internally as
`parentId: null` — `parentIdToApi()` converts back when writing.
Behavior for non-empty folders (deleting with subfolders/items) is not
verified.

**`createItem`/`deleteItem` — verified:** `POST`/`DELETE
/api/v1/items...` exist, tested live against the production instance
(see `server/scripts/smoke-writes-api.js`). `POST` requires `Class` and
`Filename` as mandatory fields (if one is missing, the server returns a
specific error text) and responds with a bare JSON string (the new item
ID), not an object — `createItem()` therefore loads the new item
afterward via `getItemById()`, analogous to `updateItem()`. `DELETE`
responds with `null`.

**Folder assignment on creation — implemented:** The body format of
`POST /api/v1/folders/<id>/items` has been decoded via a Wireshark
capture of the real client and is thus no longer an open item: the
endpoint expects `application/x-www-form-urlencoded` with a bare `add`
flag and the JSON array of item IDs in the `$doc` parameter
(`add&station=1&$doc=["<id>"]`) — not `application/json`, which explains
the previous `Invalid operation` error message (details:
`docs/MAIRLISTDB-API.md`, section "POST endpoints (form-urlencoded)").
`apiRepository.js` implements this as `assignItemsToFolder(folderId, itemIds)`
— the same `apiRequest()` route as all other calls, just with a
form-urlencoded body, so the concurrency limit and retry logic also
apply here. `createItem()` calls this after `POST /items` as soon as a
`folderId` was provided; if only the assignment fails, the already
created item is still returned and the error is logged (otherwise the
caller would never see the item and it would remain orphaned).

The two remaining operation flags have since also been captured and thus
verified: `movefrom=<sourceId>` (moves from a source folder into this
one) and `delete` (removes from this folder without deleting the items).
Additionally, `PUT /api/v1/items/<id>/folders` with
`station=1&$doc=["5","189","7"]` sets an item's **complete** folder
membership at once.

Implemented as `removeItemFromFolder(folderId, itemIds)` (`delete`),
`setItemFolders(itemId, folderIds)` (the PUT endpoint), and
`moveItemToFolder(id, folderId)`. The latter deliberately uses
`setItemFolders()` instead of `movefrom`: the SQL counterpart replaces
the assignment completely (`writeFolder()` deletes all of the item's
`item_folders` rows), and `movefrom` only moves out of *one* source
folder — if the item were in several, it would remain in the rest. The
PUT endpoint handles this in a single, idempotent request, without an
intermediate state.

**`getDashboardStats`/`getTodayPlaylist`:** `getTodayPlaylist()` is fully
functional (builds on the already verified
`getPlaylistsByDate`/`getPlaylistById`). `getDashboardStats()` now
returns real values for all four fields: `totalFolders` (from
`getFolders().length`), `totalUsers` (from `webAuthDb`, which is
independent of `DATA_SOURCE`), `totalStorages` (length of the
`/api/v1/storages` list), and `totalItems` (sum of all `ItemCount`
values of the same list — no scan of all ~155 folders needed).

**`getItems(filters)` — only with `folderId`:** The API has no endpoint
for an unfiltered item list across the entire library
(`GET /api/v1/items` always requires `folder=<id>` or `ids=<id,...>`,
see `docs/MAIRLISTDB-API.md`). `apiRepository.js`'s `getItems` therefore
only returns real data with `folderId` (builds on `getItemsByFolder`,
`type`/`artist`/`storageId`/`attributeKey`+`attributeValue` are filtered
client-side afterward); without `folderId` it returns `[]`.

**Newly uncovered via the second Wireshark capture (2026-09-07)** — all
three are verified and thus implementable, but **not yet** implemented:

- **Item search (`searchItems`):** `GET /api/v1/items?search=<term>&
  fields=All&limit=50&station=1` returns hits in the same extended
  format as `?folder=<id>`. The stub used to be empty because no search
  endpoint was known — that is no longer true. This also invalidates the
  previous assumption that `GET /api/v1/items` always requires `folder=`
  or `ids=`. **Meanwhile implemented** (see below); still open:
  pagination and the other `fields` values (only `All` is verified, so a
  field-based restriction is emulated client-side).
- **Cover (`IconData`):** the cover sits in the item field `IconData` as
  a base64-encoded JPEG — **readable** via `?icons=true` or in the
  `?folder=` format, and **writable** via the normal `PUT /api/v1/items/<id>`.
  In api mode the cover could thus be fully connected;
  `mapApiItemToInternal()`/`updateItem()` don't evaluate `IconData` yet.
  (This is independent of the same-named open TODO in
  `sqlRepository.js`, where `cover` would need to be parsed from
  `items.xmldata` — two different areas of work.)
- **Writing restrictions:** `PUT /api/v1/items/<id>/restrictions`
  (form-urlencoded, `$doc={"NotBefore":…,"NotAfter":…,"Hours":"<168
  bit>"}`) is verified; they are already readable today via
  `getItemRestrictions()`. The `Hours` bit string maps 7 days × 24 hours
  (`1` = allowed); the exact bit order is presumably Mon 0:00 → Sun
  23:00, but **still needs to be checked against the client display**
  before an editor is built on top of it.

Also newly documented, no action needed: the official client also uses
form-urlencoded with `$doc` for `PUT /items/<id>` and the playlist PUT
(our JSON variant still works), and for the playlist PUT it sends
`BaseTime` instead of `VersionInfo` — `VersionInfo` is apparently
optional when writing. Details in
[`docs/MAIRLISTDB-API.md`](MAIRLISTDB-API.md).

**Container write formats now known (third Wireshark capture) — only
documented, not yet implemented:** How all four container types (hook
container, automatic hook container, region container, news container)
can be created and populated via the normal `POST`/`PUT /api/v1/items...`
endpoints is now fully verified (details:
[`docs/MAIRLISTDB-API.md` – Creating and editing
containers](MAIRLISTDB-API.md#creating-and-editing-containers--verified)).
This is the foundation for a possible future container-editing feature
in the frontend (the playlist currently only shows container content
read-only, see "Container items" above) — deliberately not implemented
yet. Two pitfalls: the news container has `Type:"News"` instead of
`Type:"Container"` when writing too (not just reading), and hook
containers (`Playlist.Items`) and news containers (`Items` with a `Role`
field) use two different, easily confused content field names. Still
open: the actual news content (not the opener/bumper/closer wrapping),
and that external URLs as `Filename` don't work.

**Deliberately not yet implemented** (throw a clear "not yet available
in api mode" error instead of crashing or returning wrong data):

| Function / area | Status |
|---|---|
| Storage management: `createStorage`, `updateStorage`, `deleteStorage` | ⬜ |
| `getAttributeDefinitions`, `getCuePoints` | ⬜ |
| `uploadFile`, `resolveAudioPath` | ⬜ |
| `getLogs`, `getRecentLogs` | ⬜ no logs endpoint found, return `[]` instead of an error (see above) |

---

## 📚 Library

### Library tree (left navigation)

The real client has seven root nodes, we currently only have one:

| Node | Function | Status |
|---|---|---|
| Folders | virtual folders with subfolders | ✅ |
| Artists | auto-generated list of all artists, click filters | ✅ |
| Types | filter by item type | ✅ |
| Attributes | all attribute keys, expandable to values, click filters by key+value | ✅ |
| Storages | filter by storage | ✅ |
| Advertising | quick filter for ads, optionally by campaign | 🔽 |
| Everything | complete item list | ✅ |

### Search

| Function | Status |
|---|---|
| Simple search across title/artist/comment | ✅ |
| Toggle: entire library vs. only the current folder/view | ✅ |
| Restrict search to specific fields (artist only, title only, ...) | ✅ |
| Full-text search on/off (off = word-start only, uses SQL indexes, faster) | ✅ |
| Advanced search: multiple terms AND-combined across all fields | ⬜ |

In **api mode**, search is now available via
`GET /api/v1/items?search=…&fields=All&limit=50` — see
[API-based data source](#-api-based-data-source-mairlistdb-server).
The restriction to specific fields (artist only, title only, ...) is
emulated client-side, since the API itself only supports `fields=All`.

### Item list

| Function | Status |
|---|---|
| Columns, sorting, multi-select | ✅ |
| Minute display of length | ✅ |
| Configurable columns: reorder, show/hide, standard attributes as their own columns | ⬜ |
| Refresh (F5 in the original) | ✅ |

### Managing folders and items

| Function | Status |
|---|---|
| Create new element (all types) | ✅ |
| Edit, delete element | ✅ |
| Create, rename, move, delete virtual folders | ✅ |
| Move items between folders | ✅ (drag and drop) |
| Move folders into folders via drag and drop, with circularity check | ✅ |
| Dummy → File: upload audio for a dummy item afterward | ❌ not planned |
| File → Dummy: remove audio file, metadata stays | ❌ not planned |
| Replace audio file: swap file, metadata stays | ❌ not planned |

---

## 🧱 Element types

mAirList technically has a fixed base type list. Finer distinctions
(e.g. dropper vs. station ID vs. promo) happen via folders and
attributes, not via separate types. In the frontend, types are now
loaded dynamically from the DB (`getItemTypes`), no longer hardcoded.

| Type | Description | Status |
|---|---|---|
| Music | Regular music track | ✅ |
| Jingle | Short ID, sound effect (also dropper, station ID, promo, trailer) | ✅ |
| Advertising | Ad spot, commercial break | ✅ |
| News | News piece, news enhancer | ⬜ |
| Weather | Weather report, weather bed | ⬜ |
| Traffic | Traffic report | ⬜ |
| Moderation | Spoken piece, voice track | ⬜ |
| Bed | Bed, underscore music for spoken pieces | ⬜ |
| Stream | Live stream, external audio source (e.g. webradio feed) | ⬜ |
| Container (hook) | random hook from a pool | ✅ |
| Container (region) | regional split | ✅ |
| Container (news) | loads the news on the hour | ✅ |
| Container (generic) | other dynamic container | ✅ |
| Dummy | placeholder, not playable, can hold text/notes | ⬜ |
| Silence | silence, defined pause | ⬜ |

---

## 🎚️ Item Editor

| Tab | Status |
|---|---|
| General (title, artist, type, length, IDs, comment, color, cover) | ✅ (cover not yet connected in api mode — field `IconData`, readable and writable, see the API section) |
| Playback (gain, normalize as mock, segue mode) | ✅ |
| Attributes (predefined fields: short/long text, number, checkbox, single-select, multi-select) | ✅ |
| Scheduling (fixed times, rotation rules) | ⬜ |
| History (when the item played) | ✅ |
| Cue Editor | ✅ see below |

### Cue Editor

| Function | Status |
|---|---|
| All 17 cue points as cards | ✅ |
| Markers in the waveform: colored, labeled, at the correct time position, live-updating | ✅ |
| Zoom with correctly tracking markers | ✅ |
| Sorting by importance (`DEFAULT_CUE_PRIORITY`), prepared for user settings | ✅ |
| Visual separation of important vs. other markers | ✅ |
| Real audio playback and a real waveform from the audio file (wavesurfer.js, audio streaming via HTTP, range-request support, fallback to a synthetic waveform) | ✅ |
| Waveform/marker sync: marker/timeline and wavesurfer use the same real audio duration (`audioDuration` state), overlay (markers, hook/fade/loop bands, ticks) follows wavesurfer's scroll position when zooming, click-to-jump uses wavesurfer's own coordinate system | ✅ |
| Zoom behavior: no more auto-zoom during playback, minimum zoom always shows the entire waveform (fit to width) | ✅ |
| Configurable cue priority (`DEFAULT_CUE_PRIORITY`), prepared for user settings | ✅ |
| Auto cue: automatically estimate cue in / fade out / cue out from audio level | ⬜ |

---

## 📥 Import and storage

| Function | Status |
|---|---|
| File upload through the browser, item is created | ✅ |
| Import options: choose target folder, set type, disable auto cue, keep folder structure | ⬜ |
| Create, edit, remove storages (name + location) | ⬜ |
| Synchronization: scan storage, new files on the left / missing on the right | ❌ not planned |
| Repair renamed files: Join Selected Entries, Auto Repair | ❌ not planned |
| Note from the docs: never rename/move files after import, mAirList stores storage ID + relative path | 📌 rule, applies to us too |
| Audio streaming via HTTP: `GET /api/items/:id/audio` with range-request support (206 Partial Content), `AUDIO_BASE_DIR` environment variable for local development | ✅ |

---

## 🔀 Playlist and schedule

| Function | Status |
|---|---|
| Hour-based playlists: calendar → hour → entries | ✅ |
| mAirList layout: toolbar, table, database search below | ✅ |
| All 24 hours visible, including empty ones; insert into an empty hour | ✅ |
| Insert, delete, drag-and-drop reordering with start-time recalculation | ✅ |
| Double-click opens the item editor, context menu | ✅ |
| **Local vs. global:** changes made from the playlist are volatile overrides for that hour only, an explicit button writes to the DB (as in the original: "volatile") | ✅ |
| Context menu per entry: move up, move down, edit, delete | ✅ |
| Ctrl+click multi-select for mix editor invocation | ✅ |
| Playlist overrides: changes from the mix editor and item editor are saved as volatile overrides per playlist entry (`xmldata` field in the real DB), separate from the global item state | ✅ |
| Expandable container content display (sub-items) | ✅ |
| Edit hook-container content (add/remove/reorder) | ✅ (api mode only) |
| Edit region-container content (per region) | ✅ (api mode only) |
| Edit news-container content | ⬜ |
| Fixed times: item starts at a fixed clock time | ⬜ |
| Checkpoint: "Prevent auto float around this item" (e.g. top of hour) | ⬜ |
| Conflict detection: warning when two users edit the same playlist | ⬜ multi-user phase |
| Playlist import from third-party software (Musicmaster etc.) | ❌ not planned |
| Multiple stations with separate playlists | 🔽 |
| Multiple stations with multiple playlists per station | 🔽 |

---

## 🎛️ Mix Editor

In the original, the mix editor is available both in playout and in the
DB client. Core functions per docs, release notes, and forum:

| Function | Status |
|---|---|
| Timeline view of several consecutive playlist items | ✅ |
| Invoked from the playlist via Ctrl+click multi-select | ✅ |
| Move transitions: dragging a song left/right changes StartNext, clamped to [cueIn, duration], no gaps | ✅ |
| Grab and move cue points directly in the timeline | ✅ |
| Focus mode: play ±10s around the transition point | ✅ |
| Save the result as a playlist override or globally to the DB | ✅ |
| **Volume envelopes:** free-form volume curves per item, not just fade points | ⬜ remains open |
| Edit multi-track containers (freely arranged items) | ❌ not planned |

---

## 🎙️ Voice Tracking

In the original, the VT recorder is a separate window in the DB client.
Workflow per docs and forum:

| Function | Status |
|---|---|
| VT recorder: player A (end of the previous element) and player B (start of the next) audible | ⬜ |
| Recording sequence: preroll → record → start next → end record | ⬜ |
| Recording in the browser via the MediaRecorder API | ⬜ |
| Envelope automation: music ducks under the voice (VT PLAYER VOLUME in the original) | ⬜ |
| Embed the result as an item into the playlist, with correct overlaps | ⬜ |
| Post-processing in the mix editor | ⬜ |
| Keyboard shortcuts for the whole workflow | ⬜ |
| VTDJ role: users who may only voicetrack | ⬜ multi-user phase |

**Server-side there is no dedicated voice-tracking API** (Wireshark
capture of the official client, 2026-09-07). A voice track is technically
a **completely normal item of `Type: "Voice"`**, whose audio file was
previously uploaded via the storage upload
(`POST /api/v1/storages/<id>/files`). Beforehand, the client only queries
`stations/<id>/config/VoiceTrackImportFolder` (target folder, empty on
the observed installation) and `folders/unsorted/config`.

For this phase this means: the API building blocks already all exist in
`apiRepository.js` (upload, `createItem`, `insertPlaylistItem`) — no
endpoint is missing anymore, only the recording and mix logic in the
frontend. Still open is which fields, beyond `Type: "Voice"`, a
voice-track item needs for correct overlaps. Details:
[`docs/MAIRLISTDB-API.md` – Voice Tracking](MAIRLISTDB-API.md#voice-tracking--no-dedicated-endpoint).

---

## 👥 Multi-user and administration

**Dedicated user management, independent of mAirList:** mAirList's own
`auth.db` is no longer used — login there is disabled
(`ManagementLogin=off`), since data was not reliably persisted and the
MD5 hash scheme could not be verified. Instead, a dedicated, independent
JSON file `server/webinterface-auth.json` (`server/data/webAuthDb.js`)
with `bcrypt` hashing instead of MD5. On first start, a bootstrap admin
is created automatically (password in the server log or via
`INITIAL_ADMIN_PASSWORD` env var). The group feature was removed — the
five roles replace that concept.

| Function | Status | Note |
|---|---|---|
| Login with username/password | ✅ | HTTP-only session cookie, `server/routes/auth.js`, against the own `webinterface-auth.json` |
| Bootstrap admin on first start | ✅ | `server/data/webAuthDb.js`, password in the log or via `INITIAL_ADMIN_PASSWORD` |
| Roles (readonly/studio/dj/vtdj/admin) | ✅ | fixed, defined in `server/data/webAuthDb.js`, scope mapping via `ROLE_SCOPES` |
| Role Read-only: read only | ✅ | |
| Role Studio: read + write history/logging | ✅ | |
| Role DJ: like Studio + edit playlists and scheduling, library read-only | ✅ | |
| Role VTDJ: voice tracking | ✅ | role exists, voice-tracking feature itself still open (phase E) |
| Role Admin: everything incl. configuration | ✅ | |
| Create/edit user | ✅ | administration area, visible only to admin users (`isAdmin` check) |
| Group management | ❌ removed | roles replace the group concept |
| View logs | ✅ | logs page |
| Conflict detection on concurrent playlist editing | ⬜ | |

### Administration (admin area)

Dedicated area in the sidebar, visible only to admin users (`isAdmin` check).

| Function | Status |
|---|---|
| **User management** (`frontend/src/pages/admin/Users.jsx`): create, edit, delete | ✅ |
| Change password (bcrypt hashing) | ✅ |
| Set role per user (readonly/studio/dj/vtdj/admin) | ✅ |
| Generate and copy API token | ✅ |
| **Logs page** (`frontend/src/pages/Logs.jsx`): `playlistlog` from the DB | ✅ |
| Date filter | ✅ |
| Pagination | ✅ |

---

## ⚙️ Settings

Panel settings via `frontend/src/pages/Settings.jsx`, persisted in `server/settings.json` (`server/lib/settings.js`).

| Section | Status |
|---|---|
| General (station name, date format, time format, default date) | ✅ |
| Display (items per page) | ✅ |
| Paths (audio base directory, upload base directory) | ✅ |
| Security (allowed origins) | ✅ |

---

## 🏠 Dashboard / homepage

`frontend/src/pages/Dashboard.jsx`, first page after login.

| Function | Status |
|---|---|
| Stat tiles: items, storages, folders, users | ✅ |
| Today's playlist | ✅ |
| Recent plays | ✅ |
| System status: data source, server, current user/role | ✅ |

---

## 🔀 Multi-station & multi-playlist

**Goal:** Manage multiple stations per database, with a switcher in the
UI, as well as multiple playlists per station (going beyond the mAirList
original).

### Concept (modeled after mAirList multi-station scheduling)
- Stations share: audio library, storages, hour/music templates
- Separate per station: playlists, template assignment, advertising settings
- Each station can have multiple playlists (main playlist + any number of
  others), e.g. for sub-stations or parallel output paths

### Planned features
- [ ] Schema check: verify station table/columns in a real .mldb (PRAGMA table_info)
- [ ] Default station configurable in settings
- [ ] Station switcher in the UI (sidebar/header)
- [ ] Manage multiple playlists per station (create, rename, delete)
- [ ] Repository layer: station filter for playlist, logs, dashboard
- [ ] AppDataContext: caching per station instead of global

### Status
🔽 Not part of phase I, a later phase (still to be named)

---

## 🗓️ Later phases 🔽

| Area | Content |
|---|---|
| Mini scheduler | Hour templates, automatic playlist generation, template assignments (default, "1st Monday of the month", odd/even weeks, holidays) |
| Advertising | Campaigns, advertising planning |

## 🖥️ New homepage & listener counts

- Homepage (`Dashboard.jsx`) rebuilt: live cockpit ("Now playing" / "Up
  next"), broadcast preview for the next hours with a warning when no
  schedule exists, plus the existing library statistics. Refreshes every
  60 seconds.
- Optional listener-count display: source (laut.fm or a custom JSON URL)
  configurable in settings (`server/lib/listenerSource.js`,
  `GET /api/listeners`). With source "None" or on an error, the tile is
  simply omitted, no placeholder.
- A "not played in a while" overview was left out, since a performant
  data source without a full library iteration is missing — possible
  future solution: caching or similar.

## ❌ Out of scope

| Area | Reason |
|---|---|
| Playout control | That's the on-air software in the studio, not the DB client |
| Reports (broadcast logs, GEMA) | Deliberately left out |
| Storage redirection (per-computer paths, cache/backup locations) | Windows-client concept, no function in a web context |
| Embedding external audio editors | Desktop concept |
