// Small input checks for the route handlers. Deliberately without an
// additional dependency (no joi/zod) and deliberately generous: the checks
// are meant to catch broken requests with a clean 400, not lock out
// legitimate calls from the frontend.
//
// Convention: each function returns the (possibly normalized) value on
// success and otherwise throws a ValidationError. The handlers catch that
// centrally via the error handler or wrapValidation().

// Free text is capped at this length so nobody pushes a megabyte through
// the repository layer.
const MAX_TEXT_LENGTH = 500;

// IDs are, depending on the backend, numeric (mock/sqlite) or a string
// (mAirListDB API). That's why only "present and plausibly short" is
// checked here, deliberately without enforcing a format.
const MAX_ID_LENGTH = 200;

const PLAYLIST_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

// ---- IDs ----

// Required ID (e.g. req.params.id). Allows numbers and strings, only
// rejects empty values, objects/arrays, and absurdly long values.
function requireId(value, label = "id") {
  if (isMissing(value)) throw new ValidationError(`${label} is required`);
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ValidationError(`${label} is invalid`);
  }
  const str = String(value).trim();
  if (!str) throw new ValidationError(`${label} is required`);
  if (str.length > MAX_ID_LENGTH) throw new ValidationError(`${label} is invalid`);
  return str;
}

// Optional ID (e.g. ?folderId= or body.parentId). If the value is missing,
// that's fine - undefined is returned then.
function optionalId(value, label = "id") {
  if (isMissing(value)) return undefined;
  return requireId(value, label);
}

// ---- Date / playlist ID ----

function requireDate(value, label = "date") {
  if (isMissing(value)) throw new ValidationError(`${label} is required`);
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new ValidationError(`${label} must be in the format YYYY-MM-DD`);
  }
  return value;
}

function optionalDate(value, label = "date") {
  if (isMissing(value)) return undefined;
  return requireDate(value, label);
}

function requirePlaylistId(value, label = "playlist ID") {
  if (isMissing(value)) throw new ValidationError(`${label} is required`);
  if (typeof value !== "string" || !PLAYLIST_ID_RE.test(value)) {
    throw new ValidationError(`${label} must be in the format YYYY-MM-DD-HH`);
  }
  return value;
}

// ---- Numbers ----

// Integer >= 0 with an upper bound. If the value is missing, fallback is returned.
function optionalCount(value, label, { fallback, max }) {
  if (isMissing(value)) return fallback;
  const num = Number(value);
  if (!Number.isInteger(num)) throw new ValidationError(`${label} must be an integer`);
  if (num < 0) throw new ValidationError(`${label} must not be negative`);
  if (max !== undefined && num > max) {
    throw new ValidationError(`${label} must be at most ${max}`);
  }
  return num;
}

// Positions in playlists are 1-based integers.
function requirePosition(value, label = "position") {
  if (isMissing(value)) throw new ValidationError(`${label} is required`);
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new ValidationError(`${label} must be a positive integer`);
  }
  return num;
}

// ---- Text ----

function requireText(value, label, { maxLength = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${label} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label} is required`);
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${label} must be at most ${maxLength} characters long`);
  }
  return trimmed;
}

function optionalText(value, label, { maxLength = MAX_TEXT_LENGTH } = {}) {
  if (isMissing(value)) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${label} is invalid`);
  if (value.length > maxLength) {
    throw new ValidationError(`${label} must be at most ${maxLength} characters long`);
  }
  return value;
}

// ---- Objects ----

// Ensures a body is actually an object before it's accessed. Arrays don't
// count as an object here.
function requireObject(value, label = "Body") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function optionalObject(value, label) {
  if (isMissing(value)) return undefined;
  return requireObject(value, label);
}

// Array of IDs (e.g. resetting container content). Each element goes
// through requireId, an empty array is allowed (emptying a container).
function requireIdArray(value, label = "ids") {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array`);
  return value.map((id, i) => requireId(id, `${label}[${i}]`));
}

const REGION_KEY_RE = /^\d+$/;

// Region-container content: { "1": [itemId, ...], "2": [...], ... } — keys
// are numeric strings (not an array, see docs/MAIRLISTDB-API.md), each
// value an array of IDs (empty allowed, an empty region is valid).
function requireRegionsMap(value, label = "regions") {
  const obj = requireObject(value, label);
  const result = {};
  for (const [key, ids] of Object.entries(obj)) {
    if (!REGION_KEY_RE.test(key)) {
      throw new ValidationError(`${label}: region key "${key}" must be a number`);
    }
    result[key] = requireIdArray(ids, `${label}["${key}"]`);
  }
  return result;
}

// Wraps a handler so a ValidationError is answered as a 400 with an
// understandable message, instead of landing as a 500 in the error
// handler. Everything else goes to next() as before.
function wrapValidation(handler) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch((err) => {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        next(err);
      });
  };
}

module.exports = {
  ValidationError,
  MAX_TEXT_LENGTH,
  requireId,
  optionalId,
  requireDate,
  optionalDate,
  requirePlaylistId,
  optionalCount,
  requirePosition,
  requireText,
  optionalText,
  requireObject,
  optionalObject,
  requireIdArray,
  requireRegionsMap,
  wrapValidation,
};
