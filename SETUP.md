# 🚀 Setup

## Installation

```bash
# Clone the repo
git clone https://github.com/dergabriel/mairlist-web.git
cd mairlist-web

# Backend
cd server
npm install

# Frontend
cd ../frontend
npm install
```

## Development

Two terminal windows, each in a different directory.

**Terminal 1: Backend (Port 3001)**
```bash
cd server
npm run dev
# or
npm start
```

**Terminal 2: Frontend (Port 3000)**
```bash
cd frontend
npm run dev
```

The browser opens automatically at `http://localhost:3000`.

The frontend automatically proxies `/api` requests to the backend on port 3001 (see `vite.config.js`).

### Mock vs. Real Repository

**Currently:** `repository.js` (in-memory mock) is the default for development
**Production:** enable `sqlRepository.js` (SQLite via `better-sqlite3`) via `DATA_SOURCE=sqlite`

```bash
# Dev (mock):
npm run dev

# Production (SQLite):
DATA_SOURCE=sqlite npm run dev
```

DB path via `DB_PATH`, default `./mairlist.mldb`. `repository.js` is kept for unit tests and fast feedback loops, but is not loaded when `DATA_SOURCE=sqlite`.

## Continuing work with Claude in the VS Code add-on

Open the project directory in VS Code, activate the Claude extension add-on and use the `@codebase` reference for context. Include these files in the prompt so Claude stays consistent:

- `DESIGN.md` for the visual style
- `README.md` for status and roadmap
- The current data model from `server/data/mockData.js`

## Git push to GitHub

1. Create a new repo on GitHub (e.g. `mairlist-web`)
2. In the local directory:

```bash
git init
git add .
git commit -m "init: mAirList webinterface with backend API and frontend structure"
git branch -M main
git remote add origin https://github.com/dergabriel/mairlist-web.git
git push -u origin main
```

## Structure

```
mairlist-web/
├── server/                    # Node.js API
│   ├── data/
│   │   ├── mockData.js       # Mock data (later SQL)
│   │   └── repository.js     # Data layer (later against SQL)
│   ├── routes/
│   │   └── library.js        # API endpoints
│   ├── index.js
│   └── package.json
├── frontend/                  # React Vite app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DatabaseManager.jsx
│   │   │   └── ItemEditor.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── DESIGN.md                 # Design system (do not change)
├── README.md                 # Roadmap and status
└── .gitignore
```
