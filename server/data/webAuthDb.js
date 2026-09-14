// Independent auth database for the webinterface — separate from mAirList's
// own auth.db (see sqlRepository.js's resolveAuthDb()). mAirList's login is
// disabled in production (ManagementLogin=off) and its MD5 hash scheme can't
// be relied on, so the webinterface manages its own users/sessions/tokens
// here, hashed with bcrypt, independent of mAirList's data and locking.
//
// Storage: a single JSON file, not a native-compiled SQLite binding. This
// user/session/token store is tiny (dozens of rows, not millions) and a
// native addon buys nothing here except a portability liability — better-
// sqlite3's compiled .node addon can segfault at dlopen time on some CPUs/
// container hosts (seen in the wild: a build+run cycle that works on one
// machine crashes with SIGSEGV inside napi_module_register_by_symbol on
// another, entirely outside this app's control). Plain JSON has no such
// failure mode.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// Cost-Faktor fuer neu gesetzte Passwoerter. Aeltere Hashes (Cost 10) bleiben
// gueltig: bcrypt liest den Cost aus dem Hash selbst, compareSync verifiziert
// sie also weiterhin. Ein Rehash bestehender Passwoerter ist nicht noetig.
const BCRYPT_COST = 12;

const DB_PATH = process.env.WEB_AUTH_DB_PATH || path.join(__dirname, "../webinterface-auth.json");

function emptyState() {
  return { nextUserId: 1, nextTokenId: 1, users: [], sessions: [], tokens: [] };
}

function load() {
  if (!fs.existsSync(DB_PATH)) return emptyState();
  const raw = fs.readFileSync(DB_PATH, "utf8").trim();
  if (!raw) return emptyState();
  const parsed = JSON.parse(raw);
  return { ...emptyState(), ...parsed };
}

let state = load();

// Atomic-ish write: write to a temp file in the same directory, then rename
// over the target. Avoids a half-written file if the process dies mid-save.
function persist() {
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

console.log(`Web Auth DB: ${DB_PATH}`);

// The five roles this webinterface understands. "admin" maps to the
// mAirList-style UserLevel "Admin" (grants everything via
// middleware/auth.js's permissionGrantsScope); every other role maps to
// "User" there and is further distinguished only by ROLE_SCOPES below.
const ROLES = ["readonly", "studio", "dj", "vtdj", "admin"];

// Named scopes (as checked by requireScope() in routes) each role grants,
// beyond the "admin" UserLevel escape hatch. Kept here (not in
// middleware/auth.js) so the 5-role model lives entirely behind the
// permission-blob shape that middleware already understands.
const ROLE_SCOPES = {
  readonly: ["library.read"],
  studio: ["library.read"],
  dj: ["library.read", "library.write"],
  vtdj: ["library.read", "library.write"],
  admin: ["library.read", "library.write", "admin"],
};

function bootstrapAdmin() {
  if (state.users.length > 0) return;

  const password = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const pwHash = bcrypt.hashSync(password, BCRYPT_COST);
  const now = new Date().toISOString();
  state.users.push({
    id: state.nextUserId++,
    username: "admin",
    description: "Administrator",
    pw_hash: pwHash,
    role: "admin",
    created: now,
    updated: null,
  });
  persist();

  console.log("=".repeat(60));
  console.log("Webinterface: Erster Start, Admin-Account angelegt.");
  console.log("  Benutzername: admin");
  if (process.env.INITIAL_ADMIN_PASSWORD) {
    console.log("  Passwort: (aus INITIAL_ADMIN_PASSWORD)");
  } else {
    console.log(`  Passwort: ${password}`);
    console.log("  Bitte sofort ändern!");
  }
  console.log("=".repeat(60));
}

bootstrapAdmin();

// permissions blob compatible with middleware/auth.js's permissionGrantsScope:
// UserLevel "Admin" grants everything; otherwise scope grants come from
// ROLE_SCOPES via LibraryPermissions/GeneralPermissions-style flags encoded
// as an explicit scopes array the middleware also understands through
// LibraryPermissions. We keep it simple: role "admin" -> UserLevel Admin,
// everything else -> UserLevel "User" plus explicit scope grants recognized
// by permissionGrantsScope's LibraryPermissions checks.
function roleToPermissions(role) {
  if (role === "admin") {
    return { Type: "TDBPermissions", UserLevel: "Admin", GeneralPermissions: "All", LibraryPermissions: "All", role };
  }
  const scopes = ROLE_SCOPES[role] || [];
  const libraryPermissions = scopes.includes("library.write")
    ? "ReadWrite"
    : scopes.includes("library.read")
    ? "Read"
    : "None";
  return { Type: "TDBPermissions", UserLevel: "User", GeneralPermissions: "None", LibraryPermissions: libraryPermissions, role };
}

function rowToUserSummary(row) {
  return { id: row.id, name: row.username, description: row.description || "", role: row.role };
}

function scopesForUser(row) {
  return [{ scopeId: 1, scopeName: "", permissions: roleToPermissions(row.role) }];
}

function findUserById(id) {
  const numId = Number(id);
  return state.users.find((u) => u.id === numId) || null;
}

// ---- auth (login / session) ----

function getUserByUsername(username) {
  const row = state.users.find((u) => u.username === username);
  if (!row) return null;
  return { id: row.id, username: row.username, pwHash: row.pw_hash, role: row.role };
}

function getUserById(id) {
  const row = findUserById(id);
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role };
}

function verifyUserPassword(user, password) {
  if (!password || !user?.pwHash) return false;
  return bcrypt.compareSync(password, user.pwHash);
}

function getScopesByUserId(userId) {
  const row = findUserById(userId);
  if (!row) return [];
  return scopesForUser(row).map((s) => s.permissions);
}

// Group-based permissions are not supported by this auth model (roles
// replace groups) — always empty, kept only so callers (routes/auth.js,
// middleware/auth.js) that merge direct + group scopes keep working.
function getScopesByGroupId() {
  return [];
}

function createSession(userId, sid, expiresAt) {
  state.sessions.push({ sid, user_id: Number(userId), expires: expiresAt });
  persist();
}

function getSessionBySid(sid) {
  const row = state.sessions.find((s) => s.sid === sid);
  if (!row) return null;
  return { userId: row.user_id, expiresAt: row.expires };
}

function deleteSession(sid) {
  state.sessions = state.sessions.filter((s) => s.sid !== sid);
  persist();
}

// ---- admin: user management ----

function getUsers() {
  return [...state.users].sort((a, b) => a.username.localeCompare(b.username)).map(rowToUserSummary);
}

function getUserWithScopes(id) {
  const row = findUserById(id);
  if (!row) return null;
  return { ...rowToUserSummary(row), scopes: scopesForUser(row) };
}

function createUser(name, description, password, role) {
  const pwHash = bcrypt.hashSync(password, BCRYPT_COST);
  const now = new Date().toISOString();
  const row = {
    id: state.nextUserId++,
    username: (name || "").trim(),
    description: description || "",
    pw_hash: pwHash,
    role: ROLES.includes(role) ? role : "readonly",
    created: now,
    updated: null,
  };
  state.users.push(row);
  persist();
  return getUserWithScopes(row.id);
}

function updateUser(id, name, description) {
  const row = findUserById(id);
  if (!row) return null;
  row.username = (name || "").trim();
  row.description = description || "";
  row.updated = new Date().toISOString();
  persist();
  return getUserWithScopes(id);
}

function deleteUser(id) {
  const row = findUserById(id);
  if (!row) return false;
  const numId = Number(id);
  state.users = state.users.filter((u) => u.id !== numId);
  state.sessions = state.sessions.filter((s) => s.user_id !== numId);
  state.tokens = state.tokens.filter((t) => t.user_id !== numId);
  persist();
  return true;
}

function changeUserPassword(id, password) {
  const row = findUserById(id);
  if (!row) return false;
  row.pw_hash = bcrypt.hashSync(password, BCRYPT_COST);
  row.updated = new Date().toISOString();
  persist();
  return true;
}

function getUserPermissions(id) {
  const row = findUserById(id);
  if (!row) return [];
  return scopesForUser(row);
}

// Sets the user's role. `permissions` may be either a role string ("dj") or
// a permissions-shaped object carrying { role }, to stay call-compatible
// with the old (scopeId, permissions) signature used by routes/auth.js.
function setUserPermissions(id, scopeId, permissions) {
  const row = findUserById(id);
  const role = typeof permissions === "string" ? permissions : permissions?.role;
  if (row && ROLES.includes(role)) {
    row.role = role;
    row.updated = new Date().toISOString();
    persist();
  }
  return getUserPermissions(id);
}

// ---- admin: API tokens ----

function rowToToken(row) {
  return { id: row.id, userId: row.user_id, token: row.token, description: row.description || "", created: row.created, expires: row.expires };
}

function getTokensByUserId(userId) {
  const numId = Number(userId);
  return state.tokens
    .filter((t) => t.user_id === numId)
    .sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0))
    .map(rowToToken);
}

function createToken(userId, scopeId, description) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const row = {
    id: state.nextTokenId++,
    user_id: Number(userId),
    token,
    description: description || "",
    created: now,
    expires: null,
  };
  state.tokens.push(row);
  persist();
  return rowToToken(row);
}

function deleteToken(tokenId) {
  const numId = Number(tokenId);
  const before = state.tokens.length;
  state.tokens = state.tokens.filter((t) => t.id !== numId);
  const changed = state.tokens.length !== before;
  if (changed) persist();
  return changed;
}

module.exports = {
  ROLES,
  getUserByUsername,
  getUserById,
  verifyUserPassword,
  getScopesByUserId,
  getScopesByGroupId,
  createSession,
  getSessionBySid,
  deleteSession,
  getUsers,
  getUserWithScopes,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  getUserPermissions,
  setUserPermissions,
  getTokensByUserId,
  createToken,
  deleteToken,
};
