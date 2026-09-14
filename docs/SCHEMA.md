# 🗄️ SCHEMA.md

Real database schema, taken directly from a mAirListDB (SQLite `.mldb` file, mAirList version 8.x). Not guessed, not reverse-engineered from the docs, but `PRAGMA table_info()` against the real file.

> ⚠️ This database was not a production station. The schema is real, the data is test data.

---

## 📋 Table overview

| Table | Purpose |
|---|---|
| `items` | All library items (Music, Jingle, Drop, Sweeper, ...) |
| `item_cuemarkers` | Cue points per item |
| `item_cuedata` | Extended cue data as XML (e.g. envelopes) |
| `item_attributes` | Freely definable key-value attributes per item |
| `item_folders` | Item → folder mapping (n:m) |
| `item_icons` | Item cover images |
| `item_restrictions` | Playback restrictions |
| `item_campaign_entries` | Advertising: item → campaign |
| `item_campaign_regions` | Advertising: regional splits |
| `item_campaign_stations` | Advertising: station mapping |
| `item_campaigns` | Ad campaigns |
| `item_containercontent` | Content of container items |
| `folders` | Virtual folders (tree structure) |
| `storages` | Storage locations (storage configuration) |
| `playlist` | Hour-based playlists |
| `playlist_info` | Metadata per playlist hour (version, editor, ...) |
| `playlist_attributes` | Attributes per playlist hour |
| `playlistlog` | Broadcast log (what played when) |
| `subplaylists` | Sub-playlist definitions |
| `auth_users` | User accounts |
| `auth_groups` | User groups |
| `auth_group_scopes` | Group permissions |
| `auth_scopes` | Permission definitions |
| `auth_user_scopes` | User permissions (direct) |
| `auth_clients` | API clients |
| `auth_sessions` | Login sessions |
| `auth_tokens` | Auth tokens |
| `config` | Global configuration |
| `station_config` | Station-specific configuration |
| `stations` | Stations (for multi-station operation) |
| `musictemplates` | Music scheduling templates |
| `musictemplate_assignment` | Template assignment to weekdays/hours |
| `templates` | Hour templates |
| `template_assignment` | Template assignment |
| `transitiontemplates` | Transition templates |
| `transitiontemplate_assignment` | Transition template assignment |
| `folder_config` | Folder configuration |

---

## 📊 items

The central table. Each row is one library item.

| Column | Type | Description |
|---|---|---|
| `idx` | INTEGER PK | Internal ID (shown as `internalId`) |
| `externalid` | VARCHAR | External ID (freely assignable) |
| `title` | VARCHAR | Title |
| `artist` | VARCHAR | Artist |
| `type` | VARCHAR | Type: `Music`, `Jingle`, `Drop`, `Sweeper`, ... |
| `duration` | REAL | Length in **seconds** (e.g. `155.425`) ✅ confirmed |
| `totalduration` | REAL | Total length including intro etc. |
| `fadeduration` | REAL | Fade duration |
| `amplification` | REAL | Gain value |
| `pitch` | REAL | Pitch adjustment |
| `tempo` | REAL | Tempo adjustment |
| `comment` | TEXT | Comment/description |
| `endtype` | VARCHAR | Segue mode |
| `color` | VARCHAR | Color (format still to be clarified) |
| `storage` | INT → storages.idx | Storage reference |
| `filename` | VARCHAR | Relative path within the storage (e.g. `Louis Tomlinson - Lemonade.mp3`) |
| `level_peak` | REAL | Peak level |
| `level_truepeak` | REAL | True peak |
| `level_loudness` | REAL | Loudness (for normalization) |
| `options` | VARCHAR | Additional options |
| `xmltype` | VARCHAR | Special type for XML items (e.g. `File`) |
| `xmldata` | TEXT | XML data for special items |
| `created` | TIMESTAMP | Creation timestamp |
| `updated` | TIMESTAMP | Last modified |

---

## 🎚️ item_cuemarkers

One row per cue point per item. **No unique primary key**, the combination `(item, type)` is unique.

| Column | Type | Description |
|---|---|---|
| `item` | INT → items.idx | Item reference |
| `type` | VARCHAR | Cue type (see list below) |
| `value` | REAL | Time in **seconds** ✅ confirmed |

### Confirmed cue types from the real DB

```
CueIn       CueOut      FadeIn      FadeOut     FadeEnd
Ramp1       Ramp2       Ramp3
HookIn      HookOut
Outro       StartNext   Preroll
```

> **Not seen in this DB** (known from the docs): `LoopIn`, `LoopOut`, `HookFade`, `Anchor`

---

## 📁 folders

| Column | Type | Description |
|---|---|---|
| `idx` | INTEGER PK | Folder ID |
| `parent` | INT → folders.idx | Parent folder (NULL = root) |
| `name` | VARCHAR | Folder name |
| `description` | TEXT | Description |

---

## 📦 storages

| Column | Type | Description |
|---|---|---|
| `idx` | INTEGER PK | Storage ID |
| `name` | VARCHAR | Display name |
| `description` | VARCHAR | Description |
| `defaultLocation` | VARCHAR | Windows path (e.g. `D:\Audios`) |
| `importfolder` | VARCHAR | Default import folder |

---

## 🗓️ playlist

Hour-based playlists. One row = one item in one hour.

| Column | Type | Description |
|---|---|---|
| `station` | INT → stations.idx | Station |
| `subplaylist` | INT | Sub-playlist (for multi-track) |
| `slot` | DATETIME | Date + hour: `2026-03-21 08:00:00.000` (midnight: `2026-03-21`) |
| `pos` | INT | Position within the hour (0-based) |
| `item` | INT → items.idx | Item reference (NULL = empty slot) |
| `duration` | REAL | Playback duration of this entry in seconds |
| `xmldata` | TEXT | Local overrides as XML (volatile changes) |
| `timing` | VARCHAR | `Soft` (fixed-time type) or NULL |
| `fixtime` | TIME | Fixed start time when `timing=Soft` (e.g. `00:00:00.000`) |
| `state` | VARCHAR | Playback status |
| `starttime` | DATETIME | Actual start time (set during playback) |
| `startposition` | REAL | Position at start in seconds |
| `stoptime` | DATETIME | Actual end time |
| `uniqueid` | VARCHAR | Unique ID per entry |

### Slot format (important for the backend)

```
Midnight:      2026-03-21             (no time-of-day component)
Other hours:   2026-03-21 08:00:00.000
```

---

## 🔑 item_attributes

| Column | Type | Description |
|---|---|---|
| `item` | INT → items.idx | Item reference |
| `name` | VARCHAR | Attribute name (e.g. `BPM`, `ISRC`, `Genre`, `Year`) |
| `value` | VARCHAR | Value as string (numbers are stored as text) |

**Real attribute names from the DB:** `Album`, `Album-Interpret`, `BPM`, `Genre`, `Herausgeber`, `ISRC`, `Jahr`, `Track` (these are literal German attribute-name strings stored in the real database, not translated — they must match actual data)

---

## 👥 auth_users

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | User ID |
| `name` | VARCHAR | Username |
| `description` | VARCHAR | Display name |
| `pw_salt` | VARCHAR | Password salt |
| `pw_hash` | VARCHAR | Password hash |
