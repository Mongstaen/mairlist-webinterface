require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const libraryRoutes = require("./routes/library");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: only allow from the local Vite dev server and our own host.
// For production, set ALLOWED_ORIGINS via env, e.g. "https://radio.example.com"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:4173').split(',');

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin = same-origin or curl/Postman in dev: allow
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

// Limit JSON body to 1 MB, prevents memory DoS
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dataSource: process.env.DATA_SOURCE || "mock" });
});

app.use("/api/auth", authRoutes);
app.use("/api", libraryRoutes);

// Serve the frontend statically (production build under frontend/dist)
const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");
app.use(express.static(FRONTEND_DIST));

// SPA fallback: pass all non-API routes through to index.html
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

// Global error handler — catches all unhandled errors from routes.
// Especially important once repository.js switches to async DB calls.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`mAirList webinterface API running on http://localhost:${PORT}`);
  console.log(`Data source: ${process.env.DATA_SOURCE || "mock"}`);
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});