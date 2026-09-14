# 🎛️ mAirList Webinterface

> The complete mAirListDB database client, in the browser. Cross-platform, no local install. Library, playlists, cue editor, file upload, mix editor and voice tracking.

![Status](https://img.shields.io/badge/status-in%20progress-orange)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-green)
![Frontend](https://img.shields.io/badge/frontend-React-blue)
![DB](https://img.shields.io/badge/db-SQLite%20%2F%20PostgreSQL-336791)

*Deutsche Version: [`README.de.md`](README.de.md)*

---

## 📖 What this is

The mAirList database client only runs on Windows. For a distributed team that's an obstacle, especially when hosts and editors work on Mac or Linux. This project rebuilds the **mAirListDB client** as a browser app.

**Scope, deliberately fixed:**

- ✅ **In scope:** everything the DB client can do — library, playlists/schedule, item editor, cue editor, mix editor, voice tracking, upload, storages, user management (own independent roles: readonly, studio, dj, vtdj, admin), dashboard, administration (users, logs), panel settings
- 🔽 **Later phase:** mini scheduler (automatic music scheduling with hour templates), advertising/campaigns
- ❌ **Out of scope:** playout control (the on-air software itself), reports/logs/GEMA

The reference project is **TubeLive**, started in 2023. The look is codified as a binding design system in [`DESIGN.md`](DESIGN.md).

## 📂 Further documentation

Most of the documentation below is written in German, since the project and its main audience are German-speaking.

| File | Content |
|---|---|
| [`docs/FEATURES.md`](docs/FEATURES.md) | Full feature catalogue based on the mAirList docs, with status per feature |
| [`DESIGN.md`](DESIGN.md) | Design system (colors, layout, components) |
| [`SETUP.md`](SETUP.md) | Local development, git, project structure |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | Real DB schema extracted from a `.mldb` file |
| [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md) | Confirmed units and field formats |
| [`docs/MAIRLISTDB-API.md`](docs/MAIRLISTDB-API.md) | Documentation of the mAirListDB server REST API (port 8840), basis for `server/data/apiRepository.js` (solves the SQLite locking problem when mAirList runs in parallel) |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Bare-metal Windows Server deployment |

---

## 🏗️ Architecture and workflow

The mAirListDB runs on a real SQL server (PostgreSQL, MariaDB/MySQL or MSSQL). Direct database access is possible. The schema is documented in [`docs/SCHEMA.md`](docs/SCHEMA.md), field meanings and units in [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md).

**Current mode: real SQLite DB.** The whole UI only talks to the abstraction layer `server/data/repository.js` (mock), `server/data/sqlRepository.js` (SQLite, enabled via `DATA_SOURCE=sqlite`) or `server/data/apiRepository.js` (mAirListDB server REST API, enabled via `DATA_SOURCE=api`). Switching happens through an environment variable, frontend and API stay unchanged. DB path via `DB_PATH`, default `./mairlist.mldb`. The `.mldb` file does not belong in the repo (`.gitignore`).

**Third data source: mAirListDB Server API (`DATA_SOURCE=api`).** Instead of opening the `.mldb` file directly, `apiRepository.js` talks to the mAirListDB server over its REST API (port 8840, see [`docs/MAIRLISTDB-API.md`](docs/MAIRLISTDB-API.md)). This structurally solves the SQLite locking problem ("database is locked" when mAirList runs in parallel), since the same file is no longer accessed twice. Configuration via `API_DB_BASE_URL`, `API_DB_USER`, `API_DB_PASSWORD`, `API_DB_STATION` (see `server/.env.production.example`). The API mode is now production-usable for the core workflow and has been verified live against the real mAirList installation: folder tree, reading/editing/saving items, audio streaming (via the DB server, with a transcoding option) and reading/editing playlists (reordering, inserting, removing). Read paths (folders/items/playlists/audio proxy/artists/titles) and the central write path (`updateItem`, `writeHour`) are verified against the production instance with 19 smoke tests (`server/scripts/smoke-reads-api.js`, `smoke-writes-api.js`). What's still missing there is clearly listed as "not yet available" in [`docs/FEATURES.md`](docs/FEATURES.md#-api-basierte-datenquelle-mairlistdb-server) — affected features throw a descriptive error instead of crashing or returning wrong data. The webinterface's own user management (`server/data/webAuthDb.js`) is completely independent of `DATA_SOURCE` and works identically in all three modes.

Four lessons learned from real-world use that shaped the docs (details in [`docs/MAIRLISTDB-API.md`](docs/MAIRLISTDB-API.md) and [`docs/FEATURES.md`](docs/FEATURES.md#-api-basierte-datenquelle-mairlistdb-server)):

1. Playlist entries come from the API **flat** — no `{Class:"Playlist", Time, Item}` wrapper, as an earlier version of the docs wrongly assumed.
2. Playlist write operations run as read-modify-write over the **raw** API entries, so dummy entries (`Class:"Dummy"`, e.g. "PH hour start") and unknown fields are preserved without loss.
3. A concurrency limit is needed (`API_DB_MAX_CONCURRENT`, default 3): at ~12 parallel requests, the DB server itself reported "database is locked".
4. An async function from `apiRepository.js` must not be called from a synchronous `res.json()` in a route handler — otherwise an unresolved promise gets serialized as `{}` instead of the expected list.

## ⚠️ Ground rules

1. **Only write against a copy**, until the data format is proven correct. A mistake writing back can corrupt cue points or playlists, and it may only surface on air.
2. **Test the riskiest assumption first.** Verify the riskiest assumption early, not after weeks of frontend work.
3. **Every phase ends in a working state.**

---

## 🐳 Docker

The app can be built and run as a single container: the Dockerfile pulls the source directly from this GitHub repository during the build (no local checkout needed), builds the frontend, and starts the Node.js backend, which also serves the built frontend as static files.

### Quick start with `docker run`

```bash
docker build -t mairlist-webinterface https://github.com/Mongstaen/mairlist-webinterface.git

docker run -d \
  --name mairlist-webinterface \
  -p 8841:8841 \
  -e DATA_SOURCE=mock \
  -e ALLOWED_ORIGINS=http://localhost:8841 \
  mairlist-webinterface
```

Open `http://localhost:8841` in the browser. `DATA_SOURCE=mock` starts the app with in-memory demo data and no real `.mldb` file — good for a first look. For a real deployment, mount the mAirList database and uploads directory and switch to `DATA_SOURCE=sqlite` or `DATA_SOURCE=api` (see [`DEPLOYMENT.md`](DEPLOYMENT.md) and `server/.env.production.example` for all variables):

```bash
docker run -d \
  --name mairlist-webinterface \
  -p 8841:8841 \
  -e DATA_SOURCE=sqlite \
  -e DB_PATH=/data/mairlist.mldb \
  -e UPLOAD_BASE_DIR=/data/uploads \
  -e ALLOWED_ORIGINS=http://<server-ip>:8841 \
  -v /path/to/mairlist.mldb:/data/mairlist.mldb \
  -v /path/to/uploads:/data/uploads \
  mairlist-webinterface
```

### Using `docker compose`

[`docker-compose.yml`](docker-compose.yml) wraps the same build. It builds the image from the GitHub repo (see `REPO_URL`/`REPO_REF` build args in the compose file to pin a branch or tag), reads environment variables from `server/.env` and persists the database/uploads in a named volume.

```bash
cp server/.env.production.example server/.env
# edit server/.env: DATA_SOURCE, DB_PATH, UPLOAD_BASE_DIR, ALLOWED_ORIGINS, ...

docker compose up -d --build
```

The container listens on the port set via `PORT` (default `8841`), mapped to the host in `docker-compose.yml`.

---

## 🤝 Contributing

- Bugs and feature requests as GitHub issues
- PRs welcome, please open an issue first
- Before frontend work: read [`DESIGN.md`](DESIGN.md)
- Before backend work: read [`docs/SCHEMA.md`](docs/SCHEMA.md) and [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md)
- Commit messages in German or English, format: `feat:`, `fix:`, `docs:`, `refactor:`

---

## 🚦 Phase plan (short form)

Details per phase in [`docs/FEATURES.md`](docs/FEATURES.md).

| Phase | Content | Status |
|---|---|---|
| **A** | Core UI: item list, item editor (6 tabs), cue editor, upload, playlist editor, local vs. DB changes, audio streaming via HTTP | ✅ against mock, audio streaming via HTTP |
| **B** | Complete library: tree nodes (artists, types, attributes, everything), search options, folder management, configurable columns | ✅ done |
| **C** | Storage management: create/edit storages, sync with reconciliation, import options, dummy↔file | ✅ CRUD done — sync/import options still open |
| **D** | **Mix editor**: timeline across multiple items, volume envelopes, programmed transitions | ✅ mix editor done — song drag, all 17 cue markers draggable, overlap visualization, audio streaming, focus mode, save as playlist override or global |
| **E** | **Voice tracking**: VT recorder in the browser, preroll/record/start-next flow, embedding with envelope | ⬜ |
| **F** | Multi-user: login, roles (readonly, studio, dj, vtdj, admin), conflict detection for playlists, logs | 🟡 own user management (bcrypt, 5 roles, bootstrap admin) done, administration (user and log management) done — conflict detection still missing |
| **G** | Real DB: SQLite (better-sqlite3), 12/12 write paths verified | ✅ |
| **H** | Production operation: backup, Caddy, TLS, restricted DB user | ⬜ |
| **I** 🔽 | Mini scheduler (templates, automatic scheduling), advertising/campaigns | ⬜ later phase |

---

## 🧱 Tech stack

Backend Node.js and Express, frontend React with Tailwind in the `DESIGN.md` look, database SQLite (currently via `better-sqlite3`) or optionally access through the mAirListDB server REST API (`server/data/apiRepository.js`, `DATA_SOURCE=api`), PostgreSQL/MariaDB/MSSQL (planned, real mAirList SQL server), waveform wavesurfer.js, audio recording via the MediaRecorder API, reverse proxy Caddy with TLS.

## 🤖 Notes on vibecoding

- **Provide context:** reference `DESIGN.md`, `docs/FEATURES.md` and the data model (`server/data/mockData.js`) in every prompt, otherwise the look drifts or the model invents fields. For DB integration, also reference `docs/SCHEMA.md` and `docs/FIELD-SEMANTICS.md`.
- **Never write without a test case:** read the value back right away and compare it — for cue points, millisecond accuracy matters.
- **The bottleneck isn't the frontend**, it's understanding the schema and writing back correctly.
- **The repository is the only data source**, never write to the DB directly from routes or the frontend.
- **Only write against a copy** (`mairlist.test.mldb`), never against the real DB until the write path is proven.
- **`.mldb` files don't belong in the repo**, always check `.gitignore` before `git add`.
