# 🌐 MAIRLISTDB-API.md

# mAirListDB Server – REST API (reverse-engineered)

This documentation is based on observed HTTP traffic of the official
mAirList client (version 6.3.24.4498) against the `mAirListDB Server`
(port 8840, `ServerMode=HTTP`, per `dbserver.ini`). It is **unofficial**
and incomplete — only the endpoints actually observed in the traffic are
documented. Response formats are logged from real responses. The POST and
PUT bodies have since been verified via two Wireshark captures of the
real client and marked as such.

**Implemented in:** [`server/data/apiRepository.js`](../server/data/apiRepository.js)
(`DATA_SOURCE=api`) — the repository functions implement exactly the
endpoints documented here. Feature scope and current status (what's
available, what's deliberately caught as "not yet available"): see
[`docs/FEATURES.md` – API-based data source](FEATURES.md#-api-based-data-source-mairlistdb-server).

## Basics

- **Base URL:** `http://<server>:8840`
- **Auth:** HTTP Basic Authentication, credentials identical to the
  mAirList user accounts (`auth_users` in the respective instance's `auth.db`)
- **Auth (alternative):** the official client instead uses
  `Authorization: Bearer <token>` with the token from its "Internet
  Client" configuration. Our integration stays with Basic Auth, which is
  proven to work for all endpoints.
- ⚠️ **Security note — unencrypted HTTP:** in the documented setup, the
  DB server runs over plaintext HTTP (port 8840). Credentials therefore
  travel over the network in plaintext on *every* request — Basic Auth
  (Base64 is not encryption) just as much as a bearer token. For
  operation outside the local network, TLS is mandatory: per
  `dbserver.ini`, the DB server supports `SSLPort=9840` with
  `SSLCertificateFile`/`SSLKeyFile`.
- **Format:** JSON, PascalCase field names (reflects mAirList's
  Delphi/Pascal origins)
- **Query parameter `station`:** appears to be required for most
  endpoints, or is always sent by the client (`station=1`)
- **Path encoding:** filenames in URLs are URL-encoded (e.g. spaces as
  `%20`, square brackets as `%5B`/`%5D`)
- **Concurrency limit needed:** the mAirListDB server itself opens the
  `.mldb` internally via SQLite. At around 12 parallel requests from our
  client, the server reported `database is locked` — the same class of
  error that `DATA_SOURCE=api` is actually meant to avoid, just triggered
  server-side instead of client-side. `apiRepository.js` therefore
  throttles outgoing requests to `API_DB_MAX_CONCURRENT` (default 3, see
  `server/.env.production.example`) instead of firing them off unlimited
  in parallel.

## Server metadata

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/capabilities` | list of enabled server features, e.g. `EditItems`, `CreateItems`, `EditPlaylist`, `EditFolders`, `EditStorages`, `EditStations`, `EditSubplaylists`, `FolderConfig`, `AssignFolders`, `MultiFolders`, `MiniScheduler`, `AdScheduler`, `PlaylistAttributes` |
| GET | `/api/v1/permissions` | permissions of the logged-in user (see below) |
| GET | `/api/v1/config?station=1` | server/station configuration (see below, VERIFIED) |
| GET | `/api/v1/config/<key>?station=1` | single configuration value |
| GET | `/api/v1/stations/<id>/config/<key>?station=1` | station-specific configuration value |

### Response: `/api/v1/permissions`

```json
{
  "UserLevel": "Admin",
  "LibraryPermissions": "All",
  "Enabled": "on",
  "SubPlaylists": "",
  "Stations": "",
  "GeneralPermissions": "All",
  "Type": "TDBPermissions",
  "Class": "TDBPermissions"
}
```

### Response: `/api/v1/config?station=1` – VERIFIED

```json
{
  "MaxPenalty": "2",
  "ArtistGroups": "[]",
  "ImportItemType": "Unknown",
  "ImportTranscodeSettingsFileExtension": "",
  "ImportTranscodeCondition": "Always",
  "ImportTranscodeSettingsAudioFormat": "MP3",
  "ImportTranscodeSettingsMimeType": "",
  "TrackSeparationPenalty": "2",
  "ImportTranscodeSettingsBitrate": "320",
  "TrackSeparation": "3",
  "PlaylistAttributes": "<StandardAttributes/>",
  "ImportStorageSubfolder": "",
  "TitleSeparationPenalty": "2",
  "ArchivedFilenamesAttribute": "",
  "ImportStorage": "1",
  "schemaversion": "24",
  "ImportTranscodeSettingsEncoderOptions": "",
  "ImportTranscodeSettingsMode": "Stereo",
  "TitleSeparation": "3",
  "WeekReference": "2017-01-02",
  "ImportImportTasks": "All",
  "StandardAttributes": "<StandardAttributes>...</StandardAttributes>",
  "Dummy": "off",
  "dbid": "{C7861752-3801-44FD-939C-4B56DDDA661B}",
  "ArtistSeparation": "2",
  "ImportOverwritePolicy": "Rename",
  "MasterPlaylistTargetDuration": "3600",
  "AutoCreateErrorItem": "off",
  "ArtistSeparationPenalty": "1",
  "AutoCreateErrorItemFolder": ""
}
```

**Notes:**
- Flat key-value object, ALL values as strings (even ones that look
  numeric, like `"MaxPenalty": "2"` or `"schemaversion": "24"`)
- `dbid`: unique GUID of the database, identical to the
  `DatabaseID`/registry string from `dbserver.ini`
  (`{C7861752-3801-44FD-939C-4B56DDDA661B}`)
- **`StandardAttributes` – very important for the rebuild:** contains XML
  (as a string inside the JSON) and defines the **schema** for the
  `Attributes` of every item. Decoded:
  ```xml
  <StandardAttributes>
    <StandardAttribute Name="Jahr"/>
    <StandardAttribute Name="Album"/>
    <StandardAttribute Name="Track"/>
    <StandardAttribute Name="Genre" Kind="DropDown"/>
    <StandardAttribute Name="Komponist"/>
    <StandardAttribute Name="Label" Kind="DropDown"/>
    <StandardAttribute Name="Labelcode" Kind="DropDown"/>
    <StandardAttribute Name="ISRC"/>
    <StandardAttribute Name="Sprache" Kind="DropDown"/>
    <StandardAttribute Name="Stimmung" Kind="DropDown">
      <Values>
        <Value>Low</Value>
        <Value>Medium</Value>
        <Value>High</Value>
      </Values>
    </StandardAttribute>
    <StandardAttribute Name="Branding" Kind="DropDown">
      <Values>
        <Value>Ja</Value>
        <Value>Nein</Value>
      </Values>
    </StandardAttribute>
    <StandardAttribute Name="Opener" Kind="Check">
      <Values>
        <Value>Ja</Value>
      </Values>
    </StandardAttribute>
  </StandardAttributes>
  ```
  (Note: attribute names such as `Jahr`, `Komponist`, `Sprache`, `Ja`/`Nein` above are the literal German strings stored in the real config data — kept as-is since they are data, not UI text.)
  This explains the value `"Stimmung": "High"` observed on item 2605 –
  `Stimmung` is a dropdown attribute with exactly the three values
  Low/Medium/High. For an attribute-editor UI in the webinterface, this
  XML must be parsed to know which attribute fields exist and which
  type/dropdown values are valid per field (free text vs. `Kind="DropDown"`
  vs. `Kind="Check"`)
- `PlaylistAttributes` is also XML, but empty here
  (`<StandardAttributes/>`) – presumably the same concept for
  playlist-specific attributes, currently unused in this inventory
- Other fields concern scheduler rules (`ArtistSeparation`,
  `TitleSeparation`, `TrackSeparation` plus their respective `*Penalty`
  values), import behavior (`Import*` fields), and general server
  configuration

## Folders (folder tree)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/folders?station=1` | **VERIFIED:** returns the ENTIRE folder tree at once, not just the root level (tested: 155 folders in a single response) |
| GET | `/api/v1/folders?parent=<id>&station=1` | subfolders of a specific folder (filtered) |
| GET | `/api/v1/folders/<id>/config?station=1` | folder-specific configuration |
| POST | `/api/v1/folders?station=1` | **VERIFIED:** create a folder |
| PUT | `/api/v1/folders/<id>?station=1` | **VERIFIED:** rename and/or move a folder |
| DELETE | `/api/v1/folders/<id>?station=1` | **VERIFIED:** delete a folder |

### Response: `/api/v1/folders?station=1` – VERIFIED

The response is wrapped in an object, not a direct array:

```json
{
  "value": [
    {
      "SubfolderCount": 0,
      "Parent": "5",
      "ID": "50",
      "Name": "0-Divers"
    },
    {
      "SubfolderCount": 3,
      "Parent": "root",
      "ID": "1",
      "Name": "Musik"
    }
  ],
  "Count": 155
}
```

**Notes:**
- `value` contains the entire tree as a flat list (all levels mixed
  together), hierarchy results from `Parent` → `ID` chaining
- Top-level folders have `Parent: "root"` (a string, not null)
- `Count` is the total number of folders in the response — for 155
  folders, everything arrived in a single response, **no indication of
  pagination** was observed (no `nextPage`/`offset` fields or similar)
- All fields as strings, even `ID`/`Parent`/`SubfolderCount` although
  they look numeric — consistent with `DatabaseID` on items
- For the folder tree in the frontend, ONE request at startup (full
  tree) is presumably sufficient; lazy-loading via `parent=<id>` is
  optionally possible but, given the manageable size (155 folders in
  this inventory), not strictly necessary

### POST `/api/v1/folders?station=1` – VERIFIED

Creates a new folder.

**Request body:**
```json
{ "Name": "Mein Ordner", "Parent": "5" }
```

**Response on success (status 200):** the newly created object incl. `ID`:
```json
{ "Parent": "5", "ID": "312", "Name": "Mein Ordner" }
```

- Top-level folder: `Parent: "root"` (string, as with GET `/folders`)
- `ID` is assigned by the server and only comes back via this response

### PUT `/api/v1/folders/<id>?station=1` – VERIFIED

Serves both renaming (only `Name` changes) and moving (only `Parent`
changes) — a single endpoint for both, the complete body with both
fields is always sent.

**Request body:**
```json
{ "Name": "Neuer Name", "Parent": "5" }
```

- **Content-Type:** `application/json`
- **Response on success:** `null` (empty body, status 200) — as with
  `PUT /api/v1/items/<id>`, no echo of the updated object
- Top-level target: `Parent: "root"`

### DELETE `/api/v1/folders/<id>?station=1` – VERIFIED

- **Response on success:** `null` (empty body, status 200)
- Behavior for non-empty folders (subfolders/items present) not
  verified — when in doubt, check before deleting

## Items (Library)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/items?folder=<id>&station=1` | items in a folder |
| GET | `/api/v1/items?search=<term>&fields=All&limit=50&station=1` | **VERIFIED:** full-text search across the library (see below) |
| GET | `/api/v1/items/<id>?station=1` | a single item, complete |
| GET | `/api/v1/items?ids=<id>[,<id>...]&icons=true&station=1` | multiple items by ID; `icons=true` includes `IconData` (the cover) |
| GET | `/api/v1/items?artists&time=...&station=1` | distinct list of artists (search/filter function) |
| GET | `/api/v1/items?titles&time=...&station=1` | distinct list of titles |
| GET | `/api/v1/items?folder=<id>&time=...&station=1` | items with airtime context (e.g. for scheduling display) |
| GET | `/api/v1/items?folder=<id>&id=<id>&station=1` | targeted query of an item within a folder context (observed directly after a PUT, presumably for confirmation/refresh) |
| GET | `/api/v1/items/<id>/folders?station=1` | folder assignments of an item |
| GET | `/api/v1/items/<id>/restrictions?station=1` | restrictions (campaigns/blocks) of an item |
| GET | `/api/v1/items/<id>/history?station=1` | play history of an item |
| PUT | `/api/v1/items/<id>` | **VERIFIED:** update an item (see below) |
| PUT | `/api/v1/items/<id>/restrictions` | **VERIFIED:** write restrictions (see below) |
| POST | `/api/v1/items?station=1` | **VERIFIED:** create a new item |
| DELETE | `/api/v1/items/<id>?station=1` | **VERIFIED:** delete an item |

### Item types (`Type` field) – VERIFIED (24 of 27)

There is no `/api/v1/itemtypes` endpoint (see "Open items" below). The
following client-display ↔ DB-value mapping was determined via live
queries against the real database (test items created per type in the
mAirList client, `Type` value read out via `GET /api/v1/items/<id>`):

| German (client display) | DB value (`Type`) |
|---|---|
| Musik | `Music` |
| Moderation | `Voice` |
| Nachrichten | `News` |
| Wetter | `Weather` |
| Verkehr | `Traffic` |
| Werbung | `Advertising` |
| Beitrag | `Package` |
| Jingle | `Jingle` |
| Sweeper | `Sweeper` |
| Drop | `Drop` |
| Trailer | `Trailer` |
| Promo | `Promo` |
| Sponsor-Jingle | `Sponsorship` |
| Station-ID | `StationID` |
| Bett | `Bed` |
| Instrumental | `Instrumental` |
| Sendung | `Show` |
| Stream | `Stream` |
| Playlist | `Playlist` |
| Befehl | `Command` |
| Unterbrechung | `Break` |
| Stille | `Silence` |
| Fehler | `Error` |
| Andere | `Other` |
| Platzhalter | `Dummy` |

(The left column shows the labels as they appear in the German mAirList
client UI — kept untranslated since these are literal client-UI strings
being cross-referenced, not our own UI text.)

**Not verified** (not present in the current inventory): container (see
its own section below, has its own concept), cartwall page, custom 1-3.

#### Container: its own concept, not recognizable via `Type`

Containers are elements that contain further elements (e.g. ad blocks).
In addition to the `Type` field they carry a `Class` field that reveals
the actual container kind. Verified via live query against six real test
items:

| Title | `Type` | `Class` |
|---|---|---|
| News container | `News` | `NewsContainer` |
| Hook container | `Container` | `HookContainer` |
| Automatic hook container | `Container` | `AutoHookContainer` |
| Auto-hook-container marker | `Dummy` | `AutoHookContainerMarker` |
| Region container (regionalization) | `Container` | `RegionContainer` |
| Simple container | `Container` | `Container` |

> ⚠️ **Trap for any type-based display/logic check:** the news container
> has `Type: "News"`, **NOT** `Type: "Container"`. At the type level it
> looks like a normal news item, but is technically a container with
> content (likewise, the auto-hook-container marker has `Type: "Dummy"`,
> not `"Container"`). Any logic that wants to check "is this a
> container" **must additionally check the `Class` field** against one
> of the `*Container`/`*ContainerMarker` values above — relying solely
> on `Type: "Container"` misses at least these two cases.

Container items have (when empty) an empty `Items` array. Embedded in a
playlist, this array contains the actual sub-elements (see "Response:
populated hour" further below). `InnerFadeDuration` and `Options`
(value `["NoLogging"]` observed) are container-specific extra fields,
not further evaluated so far.

### Response: `/api/v1/items/<id>?station=1`

```json
{
  "Artist": "Perla Nera",
  "Duration": 219.2,
  "Attributes": {
    "Stimmung": "High"
  },
  "Amplification": -10.8350827644041,
  "Levels": {
    "Loudness": -12.1649172355959,
    "TruePeak": 0.482986986637115,
    "Peak": 0
  },
  "Markers": {
    "FadeOut": 217.589,
    "CueOut": 219.2,
    "StartNext": 217.395
  },
  "DatabaseID": "2605",
  "Title": "Lost in Dreams",
  "Type": "Music",
  "Filename": "/storages/1/files/03 - Perla Nera - Lost in Dreams [Radio Edit].mp3",
  "Class": "File"
}
```

### Response: `/api/v1/items?folder=<id>&station=1` – VERIFIED (extended)

Unlike `/api/v1/folders`, this endpoint returns a **raw array**, not a
`{value, Count}` wrapper:

```json
[
  {
    "NextUse": "",
    "Artist": "Hier",
    "Duration": 5.825,
    "Folders": [
      { "ID": "19", "Name": "IDs" },
      { "ID": "33", "Name": "Sweeper" }
    ],
    "Attributes": {
      "Konto": "Adobe Audition 13.0 (Windows)",
      "Datum": "2020-10-17T23:14:25+02:00"
    },
    "Amplification": -10.8787836821338,
    "LastUse": "2026-09-04T05:00:00",
    "Levels": {
      "Loudness": -12.1212163178662,
      "TruePeak": -2.54295110702515,
      "Peak": -2.99994254112244
    },
    "LastPlayed": "2026-09-04T05:07:35",
    "Markers": {
      "FadeOut": 2.514,
      "CueOut": 4.504,
      "StartNext": 1.2
    },
    "DatabaseID": "804",
    "Title": "DXR_Sweeper_HierIst",
    "Type": "Sweeper",
    "Filename": "/storages/1/files/DXR_Sweeper_HierIst.wav",
    "Class": "File",
    "EffectiveDuration": 1.2
  }
]
```

**New compared to the single-item response (`/items/<id>`):**
- `Folders`: array of all folder assignments of this item (ID + name),
  an item can be listed in multiple folders at once (here in both "IDs"
  and "Sweeper" at the same time)
- `NextUse` / `LastUse`: planned or last use per scheduler (ISO
  timestamp or empty string if not scheduled)
- `LastPlayed`: timestamp of the last actual playback (ISO timestamp)
- `EffectiveDuration`: differs from `Duration` – presumably the actual
  listening time accounting for `StartNext` (`EffectiveDuration` is
  close to the `StartNext` value on all observed items, e.g.
  `StartNext: 1.2` → `EffectiveDuration: 1.2`). This suggests
  `EffectiveDuration` is the time until the transition point, not the
  full file duration

The single-item response (`GET /api/v1/items/<id>`) does NOT contain
these additional fields (see example above) – it returns a leaner
record without `Folders`/`NextUse`/`LastUse`/`LastPlayed`/
`EffectiveDuration`.

**General notes (for both response variants):**
- `Markers` only contains actually set cue points, not every conceivable
  type. **So far, across ~20 spot-checked items (music + sweepers), only
  the following four marker types have been observed:** `CueIn`,
  `CueOut`, `FadeOut`, `StartNext`. Neither `FadeIn`, `FadeEnd`,
  `Hook`/`HookIn`/`HookOut` nor `Ramp1`/`2`/`3` have been seen so far –
  possibly this inventory simply doesn't use these marker types, or they
  are named differently. If needed, query the API for an item with known
  hook/ramp points (e.g. visible in the cue editor) to clarify this.
- `Amplification` = normalization gain in dB (corresponds to `gainDb` in
  the current data model)
- `Levels.Loudness` = LUFS value
- `Class` distinguishes among others `"File"` and `"Container"` (see
  playlists below for a container example)
- `Attributes` is not restricted to a fixed schema – both domain
  attributes (`"Stimmung": "High"`) and technical metadata (`"Konto"`,
  `"Datum"` – presumably set automatically by the recording/editing
  software, here "Adobe Audition 13.0") have been observed

### GET `/api/v1/items?search=<term>&fields=All&limit=50&station=1` – VERIFIED

Full-text search across the library, observed via a Wireshark capture of
the real client (6.3.24.4498). This means there IS an endpoint for a
cross-folder item query after all — until now the assumption was that
`GET /api/v1/items` always requires `folder=` or `ids=`.

| Parameter | Observed value | Meaning |
|---|---|---|
| `search` | search term, spaces encoded as `+` | the actual search text |
| `fields` | `All` | fields to include; other valid values unknown (presumably field names like `Artist`/`Title`) |
| `limit` | `50` | maximum number of hits; the client always requests 50 |
| `station` | `1` | as everywhere |

- **Response:** array of item objects in the **same extended format as
  `/api/v1/items?folder=<id>`** — including `Folders`, `NextUse`,
  `LastUse`, `LastPlayed`, `EffectiveDuration`.
- **Still open:** whether `offset`/`page` exist for pagination, what
  other values `fields` accepts, and whether the search matches
  word-start or substring.

This means `searchItems()` in `apiRepository.js` can be implemented —
previously a deliberately empty stub, since no search endpoint was known.

### PUT `/api/v1/items/<id>` – VERIFIED

The body is **exactly symmetrical to the GET format**: the complete item
object (as returned by GET) is sent back via PUT with the changed
values. Verified via PowerShell (`Invoke-RestMethod`): item read,
`Markers.FadeOut` changed, unchanged JSON sent via PUT, then confirmed
via GET that the new value was actually persisted.

- **Content-Type:** `application/json` (proven to work). The **official
  client, however, also uses `application/x-www-form-urlencoded` with
  `$doc` here** (Wireshark capture, see "POST endpoints
  (form-urlencoded)"). So the server accepts both; `apiRepository.js`'s
  `updateItem()` stays with JSON.
- **Response on success:** `null` (empty body, status 200)
- It's enough to take the complete object received from GET, change
  individual fields, and send it back unchanged – no partial updates
  needed, no separate "diff" format

**Body variant of the official client (Wireshark, form-urlencoded):**

```
station=1&$doc={...complete item JSON...}
```

Both ways are proven to work: `application/json` (our variant, in use
for weeks) and `application/x-www-form-urlencoded` with `$doc` (the
client variant). No action needed in `apiRepository.js`.

#### Writable fields in the PUT body – VERIFIED

The captured client body contains significantly more fields than the
minimal GET example above. All of these are accepted via the normal item
PUT, **no dedicated endpoints** are needed for them:

| Field | Example / format | Meaning |
|---|---|---|
| `Attributes` | `{"Stimmung":"high"}` | item attributes — no separate attribute endpoint needed |
| `IconData` | base64-encoded JPEG | **The cover.** Also readable via `?icons=true` (see below) |
| `CueData` | `{"Items":[{"Artist":"…","ItemType":"Music","Title":"…","Class":"Track"}]}` | nested track info: what's contained in the element (e.g. for recordings/containers) |
| `Type` | `"Voice"` observed | item type; `Voice` = voice track (see "Voice Tracking" below) |
| `Database` | `"mAirListDB:{GUID}"` | database identifier |

`IconData` resolves the open item "cover is not available in api mode":
covers are both **readable** (`?icons=true` or in the `?folder=` format)
and **writable** (this field in the PUT body).

### PUT `/api/v1/items/<id>/restrictions` – VERIFIED

Writes an item's airtime restrictions (the counterpart to the already
documented `GET /api/v1/items/<id>/restrictions`).

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (decoded):**
  ```
  station=1&$doc={"NotBefore":null,"NotAfter":null,"Hours":"1111...0111"}
  ```

| Field | Format | Meaning |
|---|---|---|
| `NotBefore` | ISO date or `null` | earliest airdate; `null` = no lower bound |
| `NotAfter` | ISO date or `null` | latest airdate; `null` = no upper bound |
| `Hours` | bit string with **exactly 168 characters** | hourly grid, 7 days × 24 hours |

**The `Hours` bit grid:** `"1"` = airing allowed in this hour, `"0"` =
blocked. 168 = 7 × 24, clearly fits a weekly grid.

⚠️ **Order not conclusively established:** presumably Monday 00:00
through Sunday 23:00 (i.e. day by day, hour by hour within a day). Cross
check against the client display when implementing — write a single set
bit at a known position and check in the official client which cell is
marked. An off-by-one in the weekday or a column-wise instead of
row-wise arrangement could not be distinguished from the capture alone.

### POST `/api/v1/items?station=1` – VERIFIED

Tested live against the server (mandatory fields determined step by step
by deliberately omitting them):

```json
{
  "Title": "...",
  "Type": "Music",
  "Class": "File",
  "Filename": "/storages/1/files/dateiname.mp3"
}
```

- **Mandatory fields:** `Class` (without it → error `"Invalid playlist
  item class"`) and `Filename` (without it → error `"Invalid location
  type"`). `Title` and `Type` were accepted without issue.
- Other fields from the PUT format (`Markers`, `Attributes`,
  `Amplification` etc.) can presumably also be supplied optionally,
  analogous to PUT — not individually tested.
- **Response on success:** a **bare JSON string** with the new item ID,
  e.g. `"2634"` — **not** an object like GET/PUT.
- To return the complete item, a subsequent `GET
  /api/v1/items/<new-id>` is needed (`apiRepository.js`'s `createItem()`
  already does this, analogous to `updateItem()`).

**Folder assignment – VERIFIED:** The additionally observed call `POST
/api/v1/folders/<folderId>/items` in the client traffic (right after
`POST /items`) assigns the new item to a folder. The body format has
since been decoded via a Wireshark capture: form-urlencoded with an
`add` flag and a `$doc` array, see "POST endpoints (form-urlencoded)"
below. `apiRepository.js` implements this as
`assignItemsToFolder(folderId, itemIds)`; `createItem()` calls it after
`POST /items` if a `folderId` was supplied. If only the assignment
fails, the (already created) item is still returned and the error is
logged.

### DELETE `/api/v1/items/<id>?station=1` – VERIFIED

- **Response on success:** `null`, status 200.

## Creating and editing containers – VERIFIED

Decoded via a Wireshark capture of the real mAirList client: all four
container types (see "Container: its own concept" above) can be created
and populated via the normal item endpoints (`POST`/`PUT
/api/v1/items...`) — there are no dedicated container endpoints. The
trick lies in the `Class` field and the chosen content field name.

### Creating a hook container

```
POST /api/v1/items
$doc={"InnerFadeDuration":1,"Title":"Hook-Container","Type":"Container","Class":"HookContainer","Options":["NoLogging"]}
```

Response as with any `POST /items`: a bare ID as a string, e.g. `"2664"`.

### Creating an automatic hook container

```
POST /api/v1/items
$doc={"InnerFadeDuration":1,"Title":"Automatischer Hook-Container","Type":"Container","Class":"AutoHookContainer","Options":["NoLogging"]}
```

### Auto-hook-container marker (placeholder)

```
POST /api/v1/items
$doc={"Title":"Automatischer Hook Container - Markierung","Type":"Dummy","Class":"AutoHookContainerMarker"}
```

Inserted as a placeholder into the playlist, at the position where the
automatic container will later be filled with real content. Has no
content of its own (no `Items`/`Playlist` field needed).

### Setting hook-container content (PUT)

```
PUT /api/v1/items/<id>
$doc={
  "Comment": "TITEL1\nTITEL2\nTITEL3\n",
  "Playlist": { "Items": [ {complete item object}, ... ] }
}
```

- **`Comment`** is a text summary of the titles contained (separated by
  line breaks), maintained automatically by the client.
- ⚠️ The actual content lives under **`Playlist.Items`**, not directly
  under `Items` (see the comparison below).

**Implemented:** `apiItems.js`'s `updateContainerContents(containerId,
itemIds)` implements exactly this format (route: `PUT
/api/items/:id/container-contents` in `server/routes/library.js`,
frontend editing in `Playlist.jsx`) — only for hook containers and
automatic hook containers, see `docs/FEATURES.md`.

### Creating/updating a region container

```
POST /api/v1/items  or  PUT /api/v1/items/<id>
$doc={
  "Duration": 14.627,
  "Title": "Regionen-Container",
  "Type": "Container",
  "Class": "RegionContainer",
  "Content": {
    "1": { "Items": [ { "Playlist": {"Items":[...]}, "Class":"Container", "Type":"Container", "Duration":..., "ID":"{GUID}", "Title":"Container", "State":"Normal" } ] },
    "2": { "Items": [ ... ] }
  }
}
```

⚠️ `Content` is an **object** with numeric string keys (`"1"`, `"2"`, …)
per region, **not an array**. Two levels of nesting:
`Content["1"].Items[0].Playlist.Items[...]` contains the actual titles
for region 1. Region names themselves come from the server
configuration, not from this field.

**Implemented:** `apiItems.js`'s `updateRegionContainerContents(containerId,
regionItemIds)` implements exactly this format (route: `PUT
/api/items/:id/region-container-contents` in `server/routes/library.js`,
frontend editing in `Playlist.jsx`, one tab per region) — see
`docs/FEATURES.md`. `Title`/`Type` must be resent on every PUT (the
current container state is fetched via GET beforehand, similar to the
hook container).

### Creating a news container (empty)

```
POST /api/v1/items
$doc={"Items":[],"Title":"Nachrichten","Type":"News","Class":"NewsContainer"}
```

> ⚠️ **The same trap as when reading (see "Container: its own concept"
> above), here on creating/writing:** `Type` is `"News"`, **NOT**
> `"Container"` — the news container disguises itself as a normal news
> item when writing just as it does when reading. Only
> `Class: "NewsContainer"` reveals its container nature. Anyone wanting
> to create a container via `POST` must not be guided by
> `Type: "Container"`, but must set `Class` explicitly.

### Setting news-container wrapping (PUT)

```
PUT /api/v1/items/<id>
$doc={
  "Duration": 22.959,
  "Items": [
    { "Role": "Opener",   "Item": {complete item object} },
    { "Role": "MusicBed", "Item": {Type:"Bed", Timing:"Excluded", ...} },
    { "Role": "Bumper",   "Item": {Type:"Jingle", ...} },
    { "Role": "Closer",   "Item": {complete item object} }
  ]
}
```

⚠️ Here the field is called **`Items`** (unlike the hook container!), and
each entry has a **`Role` field** instead of being a plain list. This is
the wrapping (opener/music bed/bumper/closer), **NOT** the actual news
content. The news content itself (the content tab in the UI, the actual
stories) was not populated in this capture — still open, see "Open
items" below.

#### Comparison: two different content field names — easily confused

| Container type | Field name for content | Structure per entry |
|---|---|---|
| Hook container | `Playlist.Items` | complete item object, plain list |
| News container | `Items` | `{ "Role": "...", "Item": {...} }` — role + item, not a plain list |

Both container types have a top-level field with "Items" in the name,
but structurally mean completely different things. `Playlist.Items` on
the hook container is a flat list of items; `Items` on the news
container is a list of role/item pairs for the wrapping. Code that
populates a container must not confuse or generically handle these two
formats.

### Deleting a container

```
DELETE /api/v1/items/<id>?station=1
```

No difference from normal items (see DELETE above).

### Side note: external URL as filename doesn't work

An attempt to create an item with an external HTTP URL (e.g. `laut.fm`)
as `Filename` failed (`"Invalid filename"`). `Class:"File"` expects a
local storage path, not an arbitrary URL — an open item if streaming
sources become relevant in the future.

## Storages / audio files

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/storages?station=1` | **VERIFIED:** returns the configured storages (tested live: 2 storages) |
| GET | `/api/v1/storages/<id>/files/<filename>?quality=default` | audio file, original quality |
| GET | `/api/v1/storages/<id>/files/<filename>?quality=low` | audio file, transcoded (server-side transcoding, e.g. for fast PFL/preview playback) |

`<filename>` is URL-encoded, corresponds to the `Filename` field from
the item response (without the leading `/storages/<id>/files/`).

### Response: `/api/v1/storages?station=1` – VERIFIED

Tested live against the production instance:

```json
{
  "value": [
    {
      "DefaultLocation": "C:\\Users\\Administrator\\Music",
      "Description": "",
      "ID": "1",
      "Name": "Datenbank",
      "ItemCount": 2230
    },
    {
      "DefaultLocation": "C:\\Users\\Digital X Radio\\Documents\\AUTOMAT",
      "Description": "",
      "ID": "2",
      "Name": "VT Schienen",
      "ItemCount": 1
    }
  ],
  "Count": 2
}
```

**Notes:**
- Wrapper format `{value, Count}` like `/api/v1/folders`, **not** a raw
  array
- Fields: `ID`, `Name`, `Description`, `DefaultLocation`, `ItemCount`
- `ItemCount` is the number of items in this storage — summing across
  all storages gives the total number of items (here: 2230 + 1 = 2231),
  usable as `totalItems` for `getDashboardStats()` without querying
  every folder individually
- `apiRepository.js`'s `mapApiStorageToInternal()` maps this to
  `{ id, name, location }` (analogous to `sqlRepository.js`'s
  `getStorages()` shape): `location` comes from `DefaultLocation`.
  `Description` and `ItemCount` don't flow into the mapped storage
  objects, but `ItemCount` is separately summed for
  `getDashboardStats()` (see below)

## Playlists

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0?station=1` | playlist of one hour |
| GET | `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0/attributes?station=1` | playlist attributes (separate from the items) |
| PUT | `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0` | write an hour's playlist (body format: assumption, see below) |

The `0` in the path is presumably a playlist index (mAirList knows
multiple playlists/players, only index `0` has been observed so far).

### Response: empty hour

```json
{
  "Items": [],
  "VersionInfo": {
    "EditUser": "Digital X Radio",
    "EditTime": "2026-09-03T17:56:33",
    "Version": "2"
  }
}
```

**`VersionInfo.Version` suggests optimistic locking** – on PUT, the
last-read version presumably needs to be sent along so the server can
detect concurrent changes. Still to be verified.

### Response: populated hour – VERIFIED (corrected)

**Important, corrected relative to an earlier version of this doc:**
each entry in `Items[]` is **NOT** a `{Class:"Playlist", Time:{...},
Item:{...}}` wrapper. It **IS** the item itself, flat — `Title`,
`Artist`, `Duration`, `Class` etc. sit directly on the entry, there is no
nested `Item` field. Verified against a real, populated hour
(`GET /api/v1/playlists/2026/09/05/14/0`):

```json
{
  "Items": [
    {
      "FixTime": "14:00:00",
      "ID": "{B29BC114-...}",
      "Title": "PH Stundenanfang",
      "Timing": "Soft",
      "State": "Normal",
      "Class": "Dummy",
      "Customized": true,
      "FixTimeFrame": 100
    },
    {
      "Artist": "OMNIMAR",
      "Duration": 261.082,
      "IconData": "...",
      "DatabaseID": "...",
      "Title": "...",
      "Class": "File",
      "Filename": "/storages/1/files/... or a local Windows path"
    }
  ],
  "VersionInfo": {
    "EditUser": "...",
    "EditTime": "...",
    "Version": "..."
  }
}
```

**Notes:**
- `Class` distinguishes at least `"Dummy"`, `"File"`, and `"Container"`
- `"Dummy"` entries are placeholders (e.g. hour-start markers like
  `"PH Stundenanfang"` — "hour start"). They have **no** `DatabaseID`
  and **no** `Duration` — only `Title` and, often, an explicit `FixTime`
  (`"HH:MM:SS"`, without milliseconds)
- Normal `"File"` entries, by contrast, usually carry **no** own time
  field — their actual start time results cumulatively from the hour's
  start time plus the sum of `Duration` of all preceding entries
  (as in `sqlRepository.js`'s `resequenceEntries`)
- Container items (e.g. ad blocks) have their own `Items` list for their
  sub-elements — VERIFIED, see "Item types (`Type` field)" above.
  ⚠️ `Class` is not limited to `"Container"` here (among others,
  `NewsContainer`, `HookContainer`, `AutoHookContainer`,
  `AutoHookContainerMarker`, `RegionContainer` observed) — `Type:
  "Container"` alone is not enough to detect a container
- `Filename` can point either to `/storages/...` (real media files) or
  to local Windows paths (e.g. for dummy/placeholder elements)

### PUT `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0` – VERIFIED

Body format identical to GET: `{ Items: [...], VersionInfo: {...} }`.
Verified via PowerShell: playlist read, sent back unchanged via PUT.

- **Content-Type:** `application/json`
- **Response on success:** JSON object with the new version number,
  e.g. `{ "Version": 4 }` – the server increments `VersionInfo.Version`
  on every successful write and returns the new number directly. This
  confirms the optimistic-locking concept: the response serves as
  confirmation that the write went through without a conflict.
- **Still open:** whether the previously read `VersionInfo.Version` MUST
  be sent along on PUT so the server can detect a conflict (in case
  someone else wrote in the meantime), or whether that's purely
  informational. A real conflict test would require simulating two
  overlapping writes (e.g. writing with a stale version and seeing
  whether an error results).

**Body variant of the official client (Wireshark) – `BaseTime`, no
`VersionInfo`:**

```
station=1&$doc={"BaseTime":"2026-07-30T16:00:00","Items":[...]}
```

- **`BaseTime`** is the ISO timestamp of the hour's start — redundant
  with the date/hour in the path. The client sends it anyway; whether
  the server evaluates or ignores it hasn't been checked.
- **`VersionInfo` is completely absent from the client body.** Our
  implementation sends `{Items, VersionInfo}` as JSON and is proven to
  work (the server increments the version and returns it). So
  `VersionInfo` is **apparently optional** when writing — the server
  derives the new version itself instead of checking the one sent.
- This is an **indicator**, but not proof, that there is no optimistic
  locking: it remains possible that the server checks a *supplied*
  version and simply waves through a missing one. The open item
  "behavior on a real version conflict" therefore remains.
- **No action needed:** our JSON variant with `VersionInfo` runs in
  production; `BaseTime` is not sent and evidently not needed either.

**Inserting/removing/reordering individual slots:** the API offers no
dedicated endpoint for this, only reading/writing the whole hour.
`apiRepository.js` therefore implements `reorderPlaylist`/
`insertPlaylistItem`/`removePlaylistItem` as read-modify-write: fetch
the current hour via GET, leave the raw `Items[]` entries unchanged
except for the one mutation, write the whole thing back via PUT.
Crucially, this operates on the **raw** API entries (not on an internal
item representation), because `Class:"Dummy"` entries carry fields
(`Timing`, `State`, `Customized`, `FixTimeFrame`, `FixTime`) that an
internal representation cannot map losslessly — a reconstruction attempt
would corrupt or drop these fields.

## POST endpoints (form-urlencoded) – VERIFIED

Via a Wireshark capture of the real mAirList client (6.3.24.4498), the
POST request bodies have been fully decoded. This explains the
previously unsolvable `Invalid operation` error on
`POST /api/v1/folders/<id>/items`.

**Central finding:** all POST endpoints of the mAirListDB server use
HTTP/1.0 and `Content-Type: application/x-www-form-urlencoded` — not
`application/json`. The actual JSON sits URL-encoded in the `$doc`
parameter:

```
[<operation>&]station=<id>&$doc=<urlencoded JSON>
```

The leading operation flag is usually a **bare parameter without a
value** (e.g. `add`, `delete`); `movefrom=<sourceId>` is the exception
with a value. If the flag is missing where the server expects it, it
responds with `Invalid operation`.

**This applies not only to POST:** the PUT endpoints also use
form-urlencoded with `$doc` on the official client — captured for
`PUT /api/v1/items/<id>` (update an item) and
`PUT /api/v1/items/<id>/folders` (see below). For
`PUT /api/v1/items/<id>`, the server **additionally** accepts
`application/json`; the JSON variant in `apiRepository.js`'s
`updateItem()` is proven to work and therefore remains unchanged.

### POST `/api/v1/items` – create an item

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (decoded):**
  ```
  station=1&$doc={"Title":"Platzhalter","Type":"Dummy","Class":"Dummy"}
  ```
- **No** operation flag.
- **Response:** the new item ID as a bare JSON string, e.g. `"2638"`
- **Mandatory fields in `$doc`:** `Class` (otherwise `Invalid playlist
  item class`), additionally `Filename` for `Class:"File"` (otherwise
  `Invalid location type`) — see "Items (Library)" above.

**Note:** this endpoint apparently *also* accepts `application/json`
(tested successfully via PowerShell, also returned an ID). The official
client, however, uses form-urlencoded.

### POST `/api/v1/folders/<folderId>/items` – assign an item to a folder

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (decoded):**
  ```
  add&station=1&$doc=["2638"]
  ```
- **An operation flag is mandatory** (if missing → `Invalid operation`).
- `$doc` is a JSON **array** of item IDs as strings — so multiple items
  can be processed at once.
- **Response:** `null` (status 200)

This endpoint accepts **no** `application/json`: seven JSON variants
were tested unsuccessfully, all with `Invalid operation`, because the
operation flag was missing.

#### The three operation flags – ALL VERIFIED

Via a Wireshark capture of the official client (6.3.24):

| Flag | Body (decoded) | Meaning |
|---|---|---|
| `add` | `add&station=1&$doc=["2639"]` | **add** item(s) to this folder |
| `movefrom=<sourceId>` | `movefrom=8&station=1&$doc=["2639"]` | **move** item(s) from the source folder **into this folder** |
| `delete` | `delete&station=1&$doc=["2639"]` | **remove** item(s) from this folder (does not delete the items) |

`add` and `delete` are **bare flags without a value**; `movefrom` is a
flag **with a value** (the source folder ID).

Implemented in `apiRepository.js` as `assignItemsToFolder(folderId,
itemIds)` (`add`) and `removeItemFromFolder(folderId, itemIds)`
(`delete`). `movefrom` is deliberately **not** used — see
`moveItemToFolder()` below.

### PUT `/api/v1/items/<itemId>/folders` – VERIFIED

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (decoded):**
  ```
  station=1&$doc=["5","189","7"]
  ```
- **No** operation flag — the endpoint only knows "replace".
- Sets an item's **complete** folder membership in a single request,
  fully replacing the previous assignment. Idempotent; an empty array
  removes the item from all folders.

Implemented as `setItemFolders(itemId, folderIds)`.

**`moveItemToFolder(id, folderId)` uses this endpoint**, not `movefrom`:
the SQL counterpart in `sqlRepository.js` deletes *all* of the item's
`item_folders` rows via `writeFolder()` and creates exactly one new one
— the assignment is thus completely replaced. `movefrom`, by contrast,
only moves out of *one* source folder; if the item were in several, it
would remain in the rest. Rebuilding this via `getItemFolders()` plus one
request per source folder would also not be atomic. `PUT
/items/<id>/folders` does the same thing in a single, idempotent
request.

### POST `/api/v1/storages/<storageId>/files` – upload a file

- **Content-Type:** `multipart/form-data; boundary=--------<timestamp>`
- One part:
  ```
  Content-Disposition: form-data; name="file"; filename="Nebula (Robot Koch Remix).mp3"
  Content-Type: audio/x-mpg
  Content-Transfer-Encoding: binary
  ```
- The field name is `file`, the filename is in the `filename` attribute.

### Flow when creating an item in the official client

1. `POST /api/v1/storages/<id>/files` – upload the file (multipart)
2. `POST /api/v1/items` – create the record, returns the new ID
3. `POST /api/v1/folders/<id>/items` with `add&station=1&$doc=["<newId>"]`
   – assign the item to the folder

## Voice Tracking – no dedicated endpoint

The complete voice-tracking flow of the official client was observed in
the Wireshark capture. Central finding: **there is no dedicated
voice-tracking API.** A voice track is technically a completely normal
item of `Type: "Voice"`, whose audio file was uploaded via the storage
upload.

Observed flow:

1. `GET /api/v1/stations/<id>/config/VoiceTrackImportFolder`
   – target folder for imported voice tracks. **Empty** on this
   installation, i.e. not configured.
2. `GET /api/v1/folders/unsorted/config`
   – `unsorted` is a **special folder ID** for unsorted elements
   (apparently the fallback when no import folder is set). Response
   here: `{}`.
3. `POST /api/v1/storages/<id>/files` – upload the audio file (multipart,
   see above).
4. Create an item with `Type: "Voice"` (`POST /api/v1/items`), the rest
   as with any other item.

**For the planned phase E (voice tracking), this means:** the API-side
building blocks already all exist in `apiRepository.js` — upload,
`createItem()`, `insertPlaylistItem()`. No further endpoint
reverse-engineering step is needed, only the recording and mix logic in
the frontend.

**Still open:** which fields a voice-track item needs beyond
`Type: "Voice"` (overlaps/ramp markers to the previous and next
element), and whether `VoiceTrackImportFolder`, when set, contains a
folder ID or a path — the installation in the capture had the value
empty.

## Station configuration and special IDs

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/stations/<id>/config` | complete station configuration |
| GET | `/api/v1/stations/<id>/config/<key>` | a single configuration key |
| GET | `/api/v1/folders/unsorted/config` | config of the special folder `unsorted` |

- Observed configuration key: **`VoiceTrackImportFolder`** (empty on
  this installation). Other keys were not captured —
  `GET /api/v1/stations/<id>/config` without a key should return the
  full list, but the response format has not yet been logged.
- **`unsorted` is a special folder ID**, not a numeric folder: it
  represents unsorted elements. Whether it also works with
  `GET /api/v1/items?folder=unsorted` is untested.
  `/api/v1/folders/unsorted/config` responded here with `{}`.

## Error handling – partially VERIFIED

Tested with a non-existent item ID
(`GET /api/v1/items/999999?station=1`):

- **HTTP status:** `404 Not Found`
- **Body:** `The requested resource was not found.` (plain text, not JSON)

Auth error (observed from the mitmproxy test, without credentials):
- **HTTP status:** `401`
- **Content-Type:** `text/html`

**Still open:** error format for an invalid PUT body (e.g. malformed
JSON, wrong data type, version conflict on playlists) – not yet tested.

## Miscellaneous (URL observed only, response format unknown)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/subplaylists?station=1` | sub-playlists |
| GET | `/api/v1/templates/hour/items?station=1` | hour templates |
| GET | `/api/v1/templates/music/items?station=1` | music templates |
| GET | `/api/v1/templates/transitions/items?station=1` | transition templates |
| GET | `/api/v1/templates/<type>/assignment/<n>?station=1` | template assignment |

### Attribute schema instead of a dedicated endpoint

There is **no** dedicated `/api/v1/attributekeys`-or-similar endpoint.
The attribute schema (which attribute names exist, free text vs.
dropdown vs. checkbox, valid dropdown values) instead sits in the
already documented `/api/v1/config` field `StandardAttributes` (XML
string, see above). `apiRepository.js`'s `getAttributeKeys()` calls
`getConfig()` and extracts the `Name`/`Values` information from it via a
regular expression (no XML parser present in the project, the format is
narrow enough to do without one) — return format `[{ key, values: [] }]`,
analogous to `sqlRepository.js`'s `getAttributeKeys()`, except that
`values` here comes from the schema (only populated for
`Kind="DropDown"`/`"Check"` attributes) instead of from actually
observed item values.

## Open items / still to be verified

- [x] **Container write formats** (hook container, automatic hook
      container, region container, news-container wrapping) –
      VERIFIED via Wireshark, see "Creating and editing containers" above
- [ ] **News-container content** (the actual stories in the content tab
      of the UI, not the opener/MusicBed/bumper/closer wrapping) – not
      populated in the capture, format unknown
- [ ] **External URL as `Filename`** (e.g. a streaming source like
      `laut.fm`) – fails (`"Invalid filename"`), `Class:"File"` expects
      a local storage path. If streaming sources become relevant in the
      future, it must be clarified whether a different `Type`/`Class`
      value is intended for this
- [x] **PUT body for `/api/v1/items/<id>`** – verified, see above
- [x] **Search endpoint for items** – VERIFIED via Wireshark:
      `GET /api/v1/items?search=<term>&fields=All&limit=50&station=1`,
      response in the same extended format as `?folder=`.
      `searchItems()` in `apiRepository.js` is thereby **implementable**
      (previously an empty stub), but not yet implemented
- [x] **Cover in api mode** – CLARIFIED: the field is called `IconData`
      (base64 JPEG). Readable via `?icons=true` or in the `?folder=`
      format, **writable** via the normal `PUT /api/v1/items/<id>`. Not
      yet connected in the frontend
- [x] **Writing restrictions** – VERIFIED:
      `PUT /api/v1/items/<id>/restrictions`, form-urlencoded with
      `$doc={"NotBefore":…,"NotAfter":…,"Hours":"<168 bit>"}`.
      Only the **bit order** in the `Hours` string remains open
      (presumably Mon 00:00 → Sun 23:00, to be checked against the
      client display)
- [x] **Voice tracking** – CLARIFIED: no dedicated endpoint, a voice
      track is an item with `Type:"Voice"` plus storage upload, see
      the "Voice Tracking" section
- [x] **PUT body for `/api/v1/playlists/...`** – verified, see above.
      The official client sends `BaseTime` and **no** `VersionInfo`
      (see there) — `VersionInfo` is apparently optional when writing
- [x] Error format for a non-existent resource – verified
      (404, plain-text body)
- [ ] Complete list of possible `Markers` keys – across ~20 spot-checked
      items (music + all sweeper items), only `CueIn`, `CueOut`,
      `FadeOut`, `StartNext` were observed. `FadeIn`, `FadeEnd`,
      `Hook`/`HookIn`/`HookOut`, `Ramp1`/`2`/`3` not seen so far – still
      to be clarified whether these marker types simply aren't used in
      this inventory, or whether they're named differently in the JSON
      than assumed
- [ ] Behavior on a real version conflict (two overlapping writes) –
      only the success case tested so far
- [ ] Error format for an invalid PUT body (broken JSON, wrong data
      type)
- [x] `/api/v1/config` response structure – verified, see above
      (incl. `StandardAttributes` XML schema for item attributes)
- [x] `/api/v1/folders?station=1` without `parent` – verified: returns
      the entire tree, see above
- [x] Pagination for folders – no indication of pagination with 155
      folders in one response. Still unclear for items in large folders
      (a folder with very many items not yet tested)
- [x] Item creation/deletion (`CreateItems` capability) – VERIFIED:
      `POST`/`DELETE /api/v1/items...`, see "Items" above
- [x] **Folder assignment of new items** (`POST /api/v1/folders/<id>/items`)
      – VERIFIED via Wireshark capture: form-urlencoded,
      `add&station=1&$doc=["<id>",...]`, see "POST endpoints
      (form-urlencoded)" above. Implemented as `assignItemsToFolder()`,
      called by `createItem()` when `folderId` is set
- [x] **Operation flag for removing an item from a folder** –
      VERIFIED via Wireshark: `delete&station=1&$doc=[...]` on
      `POST /api/v1/folders/<id>/items`, plus `movefrom=<sourceId>` for
      moving. Also verified: `PUT /api/v1/items/<id>/folders` sets the
      complete folder membership at once. Implemented as
      `removeItemFromFolder()`, `setItemFolders()`, and
      `moveItemToFolder()` — the stub has been removed
- [x] **Body format of all POST endpoints** – VERIFIED: not JSON, but
      `application/x-www-form-urlencoded` with a `$doc` parameter
      (file upload: `multipart/form-data`), see its own section
- [x] Folder creation/renaming/moving/deleting (`EditFolders`
      capability) – VERIFIED: `POST`/`PUT`/`DELETE /api/v1/folders...`,
      see "Folders (folder tree)" above
- [ ] Storage management (`EditStorages` capability, endpoint not yet
      observed)
- [ ] **Response format of `GET /api/v1/stations/<id>/config`** (without
      a key) and the complete key list — only `VoiceTrackImportFolder`
      observed so far
- [ ] **Special folder ID `unsorted`** – only
      `/api/v1/folders/unsorted/config` observed (response `{}`);
      whether `GET /api/v1/items?folder=unsorted` returns the unsorted
      items is untested
- [ ] Pagination for items in individual large folders (limit/offset or
      similar?) – not observed for folders themselves, not yet
      specifically tested for items
- [ ] **`time` parameter for `?artists`/`?titles`:** format not
      verified (ISO timestamp? date? from/to window?). Even with
      `artists`/`titles` as a real bare flag (without `=`) and without a
      `time` parameter, the server still returns complete item objects
      instead of a distinct list — cause unclear, presumably still the
      missing/wrong `time` value. Not blocking: artist/title search is a
      nice-to-have feature, `getArtists`/`getTitles` in
      `apiRepository.js` work (just return more data than necessary)
- [x] **`/api/v1/storages`** – VERIFIED: the endpoint does exist after
      all, tested live (2 storages), response format fully documented,
      see "Storages / audio files" above
- [x] **No `/api/v1/itemtypes` endpoint found** – neither a dedicated
      endpoint nor a field in `/api/v1/config`. `sqlRepository.js`'s
      `getItemTypes()` needs a `DISTINCT type, COUNT(*) GROUP BY type`
      across the entire items table; the API has no equivalent for this
      without querying all ~155 folders individually. `apiItems.js`'s
      `getItemTypes()` therefore returns a hardcoded list. VERIFIED:
      24 of 27 types from the client dropdown are confirmed via live
      query against the real DB, see the "Item types (Type field)"
      section below. Not verified: cartwall page, custom 1-3 (not
      present in the inventory). `hasItems`/`note` are still not real DB
      values for this list, but placeholders (`hasItems: true`,
      `note: ""`).
- [ ] **No logs/broadcast-log endpoint found** – only
      `/api/v1/items/<id>/history` (per item) exists, which doesn't
      scale for an overall overview. `getLogs()`/`getRecentLogs()`
      therefore return an empty result instead of an error.
- [x] **`getDashboardStats`/`getTodayPlaylist` via the API** –
      `getTodayPlaylist()` is fully implemented (builds on
      `getPlaylistsByDate`/`getPlaylistById`). `getDashboardStats()`
      returns `totalFolders` (from `getFolders().length`), `totalUsers`
      (from the `DATA_SOURCE`-independent `webAuthDb`), `totalStorages`
      (length of the `/api/v1/storages` list), and `totalItems` (sum of
      all `ItemCount` values from the same list, see "Storages / audio
      files" above) – no scan of every folder needed.
- [ ] Rate limiting or connection limits
- [x] **Alternative authentication via token:** the client transmits the
      token from its "Internet Client" configuration as an
      `Authorization: Bearer <token>` header (Wireshark capture). How
      the token is generated/managed server-side remains open. Our
      integration continues to use HTTP Basic Auth with
      username/password, which is proven to work for all endpoints
- [ ] **Operation over TLS (`SSLPort=9840`)** – supported per
      `dbserver.ini`, but not tested. As long as plaintext HTTP is used,
      credentials travel over the network unencrypted on every request
      (see the security note under "Basics")

## Source

Observed via the server log output (`mAirListDB Server` window) while
connecting a real mAirList 6.3.24 client, as well as manual GET and PUT
requests via browser and PowerShell (`Invoke-RestMethod`) against the
running production instance. All documented PUT bodies were actively
tested against the real database and verified via a subsequent GET
(test values reset afterward). The POST bodies come from a Wireshark
capture of the real client (see "POST endpoints (form-urlencoded)").

A **second Wireshark capture (2026-09-07)** added the search endpoint
(`?search=`), the body format of `PUT /items/<id>/restrictions`
including the `Hours` bit grid, the additional writable item fields
(`IconData`/`Attributes`/`CueData`/`Type`), the `BaseTime` finding on
the playlist PUT, the voice-tracking flow, as well as the station
config endpoints and the special folder ID `unsorted`.

As of: 2026-09-07.
