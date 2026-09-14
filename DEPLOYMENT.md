# Deployment — Windows Server

## Prerequisites
- Windows Server with mAirList 6.0 (already present)
- Port 8840 is reserved for mAirList DB REST, do not touch it
- Node.js LTS (18+ or 20+)
- Python 3.x and Visual Studio Build Tools (C++ workload) — needed so that
  `better-sqlite3` can compile from source on Windows (see step 1a). Without
  these, `npm install` in the backend fails.

## Steps

### 1. Install Node.js
Download: https://nodejs.org (LTS version)
Check: `node --version` in PowerShell

### 1a. Install build tools for better-sqlite3
`better-sqlite3` is compiled as a native Node extension during
`npm install`. On Windows this requires:
- Python 3.x (https://www.python.org, enable "Add to PATH" during setup)
- Visual Studio Build Tools with the "Desktop development with C++" workload
  (https://visualstudio.microsoft.com/visual-cpp-build-tools/)

Check: `python --version` in PowerShell. If the build tools are missing,
step 4 (`npm install --production`) fails with a `node-gyp`/`MSBuild` error.

### 2. Get the repo
```powershell
cd C:\
git clone https://github.com/dergabriel/mairlist-webinterface.git
cd mairlist-webinterface
```

### 3. Configure environment
```powershell
cd server
copy .env.production.example .env
notepad .env
```
Adjust DB_PATH to the real mairlist.mldb (content DB, `.mldb`), e.g.:

```
DB_PATH=C:\mAirList\mairlist.mldb
```

Optionally set `INITIAL_ADMIN_PASSWORD` to specify the bootstrap admin
account's password yourself (see the "User management" section below). If
the variable is left empty, the server generates a random password on
first start and writes it to the server log once.

Note: The content DB (`.mldb`, mAirList's library/playlists) and user
management (`server/webinterface-auth.json`, see below) are two separate
databases. mAirList's own `auth.db` is no longer used by the webinterface.

### 4. Backend dependencies
```powershell
npm install --production
```

### 5. Build frontend
```powershell
cd ..\frontend
npm install
npm run build
```

### 6. Open firewall port
```powershell
New-NetFirewallRule -DisplayName "mAirList Webinterface" -Direction Inbound -LocalPort 8841 -Protocol TCP -Action Allow
```

### 7. Start server (test)
```powershell
cd ..\server
node index.js
```
Test in browser: http://&lt;SERVER-IP&gt;:8841

### 8. Set up as a service (recommended)
```powershell
npm install -g pm2
npm install -g pm2-windows-service
pm2-service-install
pm2 start index.js --name mairlist-webinterface
pm2 save
```

## User management (bootstrap admin)
User management is independent of mAirList and lives in its own JSON file
`server/webinterface-auth.json`, which is created automatically on first
start. If no user exists yet, an admin account is bootstrapped:
- Password from `INITIAL_ADMIN_PASSWORD` (if set in `.env`), otherwise the
  server generates a random password
- If no `INITIAL_ADMIN_PASSWORD` was set, the generated password appears
  **once in the server log** on first start — save that log output
  afterwards or change the password immediately
- Five roles are available: `readonly`, `studio`, `dj`, `vtdj`, `admin`

## Note: concurrent SQLite access
mAirList and the webinterface access the same .mldb file.
Reads are uncritical. For writes (editing an item, saving a playlist),
test carefully in live operation.

## Production deployment — experience
An initial deployment on a Windows Server was carried out successfully,
verifying the steps above in practice. The biggest stumbling block was the
missing Python/Visual Studio Build Tools for the `better-sqlite3`
compilation (see step 1a) — without these, `npm install` in the backend
fails.

## Update process
```powershell
cd C:\mairlist-webinterface
git pull
cd server && npm install --production
cd ..\frontend && npm install && npm run build
pm2 restart mairlist-webinterface
```
