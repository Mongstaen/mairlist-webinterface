// Panel's own settings (not mAirList configuration), persisted as
// server/settings.json. The file is created with defaults if not present.

const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "settings.json");

const DEFAULT_SETTINGS = {
  stationName: "My Radio",
  dateFormat: "DD.MM.YYYY",
  timeFormat: "HH:mm:ss",
  defaultDate: "today",
  itemsPerPage: 50,
  audioBaseDir: "",
  uploadBaseDir: "",
  allowedOrigins: "",
  listenerSource: "none",
  lautfmStation: "",
  listenerUrl: "",
  listenerJsonPath: "",
};

function getSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(data) {
  const current = getSettings();
  const merged = { ...current, ...data };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { getSettings, saveSettings };
