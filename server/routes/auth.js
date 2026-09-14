const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : require("../data/repository");
const { requireAuth, requireScope } = require("../middleware/auth");
const {
  requireId, requireText, optionalText, requireObject, wrapValidation,
} = require("../lib/validate");
// Single source of truth for the five fixed roles. Previously an
// invalid value was silently dropped in setUserPermissions() - now
// there's a 400 with a clear message for that.
const { ROLES } = require("../data/webAuthDb");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

// Deliberately a dedicated variable instead of NODE_ENV: the webinterface
// also runs in production over plain HTTP, where a secure cookie would
// make login impossible.
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: COOKIE_SECURE,
};

// Brute-force protection. Deliberately in-memory and without an
// additional dependency: the webinterface runs as a single instance for
// a small team. The counters are lost on a server restart - accepted for
// this use case; multiple instances would need a shared store.
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
const LOGIN_LOCKOUT_MS = (Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15) * 60 * 1000;

// Separated by username and IP, because otherwise either many names
// could be tried from one IP, or one name from many IPs.
const loginAttempts = new Map();

function attemptKeys(username, ip) {
  return [`user:${String(username).toLowerCase()}`, `ip:${ip}`];
}

function isLockedOut(username, ip) {
  const now = Date.now();
  return attemptKeys(username, ip).some((key) => {
    const entry = loginAttempts.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      loginAttempts.delete(key);
      return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
  });
}

function registerFailedAttempt(username, ip) {
  const now = Date.now();
  for (const key of attemptKeys(username, ip)) {
    const entry = loginAttempts.get(key);
    if (!entry || entry.expiresAt <= now) {
      loginAttempts.set(key, { count: 1, expiresAt: now + LOGIN_LOCKOUT_MS });
    } else {
      entry.count += 1;
    }
  }
}

function clearAttempts(username, ip) {
  for (const key of attemptKeys(username, ip)) loginAttempts.delete(key);
}

// Expired entries also lapse on access, but without periodic cleanup
// the map would grow unbounded under distributed attacks.
const attemptCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (entry.expiresAt <= now) loginAttempts.delete(key);
  }
}, LOGIN_LOCKOUT_MS);
attemptCleanup.unref();

function loadScopesForUser(userId) {
  return [...repo.getScopesByUserId(userId), ...repo.getScopesByGroupId(userId)];
}

// POST /api/auth/login -> { username, password } -> sets httpOnly "session" cookie
router.post("/login", (req, res, next) => {
  try {
    const body = req.body;
    const isObject = body !== null && typeof body === "object" && !Array.isArray(body);
    const { username, password } = isObject ? body : {};
    // Both must be a non-empty string.
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    // Length limit keeps very large inputs away from the expensive bcrypt comparison.
    if (username.length > 200 || password.length > 200) {
      return res.status(400).json({ error: "Username or password is too long" });
    }

    // Neutral message so the lockout doesn't reveal whether the name exists.
    if (isLockedOut(username, req.ip)) {
      return res.status(429).json({ error: "Too many failed attempts, please try again later" });
    }

    const user = repo.getUserByUsername(username);
    if (!user || !repo.verifyUserPassword(user, password)) {
      registerFailedAttempt(username, req.ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    clearAttempts(username, req.ip);

    const sid = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    repo.createSession(user.id, sid, expiresAt);

    res.cookie("session", sid, {
      ...SESSION_COOKIE_OPTIONS,
      expires: new Date(expiresAt),
    });

    res.json({ user: { id: user.id, username: user.username, scopes: loadScopesForUser(user.id) } });
  } catch (e) { next(e); }
});

// POST /api/auth/logout -> clears the session
router.post("/logout", (req, res, next) => {
  try {
    const sid = req.cookies?.session;
    if (sid) repo.deleteSession(sid);
    res.clearCookie("session", SESSION_COOKIE_OPTIONS);
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/auth/me -> current user, or 401 if not logged in
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// ---- admin: user management ----
// All routes below require an authenticated session with the "admin" scope
// (UserLevel "Admin" or LibraryPermissions "All" — see middleware/auth.js).

router.get("/admin/users", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    res.json(repo.getUsers());
  } catch (e) { next(e); }
});

router.get("/admin/users/:id", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const user = repo.getUserWithScopes(requireId(req.params.id, "id"));
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));

router.post("/admin/users", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  if (!body.name || !body.password) {
    return res.status(400).json({ error: "Name and password are required" });
  }
  const name = requireText(body.name, "Name", { maxLength: 200 });
  const password = requireText(body.password, "Password", { maxLength: 200 });
  const description = optionalText(body.description, "description");
  const role = optionalText(body.role, "role", { maxLength: 50 });
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ROLES.join(", ")}` });
  }
  res.status(201).json(repo.createUser(name, description, password, role));
}));

router.put("/admin/users/:id", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  if (!body.name) return res.status(400).json({ error: "Name is required" });
  const user = repo.updateUser(
    requireId(req.params.id, "id"),
    requireText(body.name, "Name", { maxLength: 200 }),
    optionalText(body.description, "description")
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));

router.delete("/admin/users/:id", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const id = requireId(req.params.id, "id");
  if (String(req.user.id) === id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const deleted = repo.deleteUser(id);
  if (!deleted) return res.status(404).json({ error: "User not found" });
  res.status(204).end();
}));

router.put("/admin/users/:id/password", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  if (!body.password) return res.status(400).json({ error: "Password is required" });
  const ok = repo.changeUserPassword(
    requireId(req.params.id, "id"),
    requireText(body.password, "Password", { maxLength: 200 })
  );
  if (!ok) return res.status(404).json({ error: "User not found" });
  res.status(204).end();
}));

router.put("/admin/users/:id/permissions", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const { scopeId, permissions, role } = requireObject(req.body);
  const nextRole = role || permissions?.role;
  if (!nextRole) {
    return res.status(400).json({ error: "role is required" });
  }
  const id = requireId(req.params.id, "id");
  const user = repo.getUserWithScopes(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const validRole = requireText(nextRole, "role", { maxLength: 50 });
  if (!ROLES.includes(validRole)) {
    return res.status(400).json({ error: `role must be one of ${ROLES.join(", ")}` });
  }
  res.json(repo.setUserPermissions(id, scopeId ?? 1, validRole));
}));

// ---- admin: API tokens ----

router.get("/admin/users/:id/tokens", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const id = requireId(req.params.id, "id");
  const user = repo.getUserWithScopes(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(repo.getTokensByUserId(id));
}));

router.post("/admin/users/:id/tokens", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const id = requireId(req.params.id, "id");
  const user = repo.getUserWithScopes(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const scopeId = req.body?.scopeId ?? user.scopes?.[0]?.scopeId ?? 1;
  res.status(201).json(repo.createToken(id, scopeId));
}));

router.delete("/admin/users/:id/tokens/:tokenId", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const deleted = repo.deleteToken(requireId(req.params.tokenId, "tokenId"));
  if (!deleted) return res.status(404).json({ error: "Token not found" });
  res.status(204).end();
}));

// Group management is not supported — the five fixed roles
// (readonly/studio/dj/vtdj/admin) replace the group concept.

module.exports = router;
