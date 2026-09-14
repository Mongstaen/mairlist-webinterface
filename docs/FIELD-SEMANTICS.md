# 🔬 FIELD-SEMANTICS.md

Field meanings derived directly from a real mAirListDB (SQLite `.mldb`). This is the crown jewel: not guessed, but derived from real data.

> Source: JUKA database (non-production test station, mAirList 8.x)

---

## ✅ Confirmed units and formats

### `items.duration` — seconds as REAL

Examples from the real DB:
```
155.425   (Lemonade - Louis Tomlinson)
185.588   (Next to Normal - Lucius)
166.593   (Etincelles - Luiza & Carbonne)
```

**Unit: seconds with decimals.** Our previous assumption was correct.

---

### `item_cuemarkers.value` — seconds as REAL

Examples for item 1 (Lemonade, duration=155.425):
```
CueIn   = 0.093   (skip silence at the start)
Ramp1   = 20.515  (entry point for the intro)
Outro   = 151.995 (start of the outro)
FadeOut = 155.518 (fade starts, slightly exceeds duration)
CueOut  = 156.717 (end, also exceeds duration)
```

**Unit: seconds as REAL. CueOut and FadeOut can exceed duration.**

The existing `toStorage`/`fromStorage` identity function in ItemEditor.jsx is correct, no conversion needed.

---

### `item_cuemarkers.type` — PascalCase strings

Exact values from the DB:
```
CueIn, CueOut, FadeIn, FadeOut, FadeEnd
Ramp1, Ramp2, Ramp3
HookIn, HookOut
Outro, StartNext, Preroll
```

Our existing keys (`cueIn`, `fadeOut`, etc.) must be mapped on read/write:

| Our key | DB type |
|---|---|
| `cueIn` | `CueIn` |
| `cueOut` | `CueOut` |
| `fadeIn` | `FadeIn` |
| `fadeOut` | `FadeOut` |
| `fadeEnd` | `FadeEnd` |
| `ramp1` | `Ramp1` |
| `ramp2` | `Ramp2` |
| `ramp3` | `Ramp3` |
| `hookIn` | `HookIn` |
| `hookOut` | `HookOut` |
| `outro` | `Outro` |
| `startNext` | `StartNext` |
| `preroll` | `Preroll` |

> ⚠️ Known from the documentation, but not in this DB: `LoopIn`, `LoopOut`, `HookFade`, `Anchor`. These types exist in the real client, but were not set in this test database.

---

### `items.type` — free VARCHAR strings, PascalCase

Real values from the DB:
```
Music, Jingle, Drop, Sweeper
```

No enum, no SQL constraint. Any string is possible. Our extended list (News, Weather, Traffic, Moderation, Bed, Stream, Container, Dummy, Silence) is valid.

---

### `playlist.slot` — DATETIME, hour format

```
Midnight:      2026-03-21
Other hours:   2026-03-21 08:00:00.000
```

For queries, always use `LIKE '2026-03-21%'` for a full day, or an exact match `= '2026-03-21 08:00:00.000'` for a single hour.

---

### `playlist.timing` + `playlist.fixtime`

Fixed times work like this:
- `timing = 'Soft'` + `fixtime = '00:00:00.000'` → item has a fixed start time
- `timing = NULL` → normal item, no fixed time

---

### `item_attributes` — all values as VARCHAR

Even numbers are stored as text:
```
BPM = "86"
Jahr = "1994"
Track = "8"
ISRC = "USLF29400133"
```

On read: `parseInt()` or `parseFloat()` depending on the attribute definition.

---

### `items.filename` — relative path within the storage

```
Louis Tomlinson - Lemonade.mp3
Luiza - Etincelles.mp3
```

No subfolder in this DB. Full path = `storages.defaultLocation + '\' + items.filename`.

---

## ❓ Still to be clarified (via diff method against the production DB)

These fields are known in the schema, but the exact content was empty or unclear in the test database:

| Field | Open question |
|---|---|
| `items.color` | Which format? RGB hex, integer, named color? |
| `items.endtype` | Which values? ("Normal", "Immediate", "WaitForEnd"?) |
| `items.options` | What's stored in there? Comma-separated, JSON, XML? |
| `item_cuedata.xmldata` | Format of the envelope data for the mix editor |
| `playlist.xmldata` | Format of local overrides in the playlist entry |
| `item_containercontent` | How are container contents linked? |
| `items.level_loudness` | Unit? LUFS? Is -14 LUFS correct as the target value? |
