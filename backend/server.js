require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routers/auth");
const itemRoutes = require("./routers/items");

const app = express();

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

// Required environment variables
const missingSettings = ["MONGO_URI", "JWT_SECRET"].filter(
  (name) => !process.env[name]
);

if (missingSettings.length > 0) {
  console.error(
    "Missing required environment settings:",
    missingSettings.join(", ")
  );
  process.exit(1);
}

app.disable("x-powered-by");

// Render sits behind a proxy; this makes req.ip the real visitor IP (used by the login guard).
app.set("trust proxy", 1);

// A few basic security headers (no extra package needed).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'"
  ].join("; "));

  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
});

// CORS:
// - In production, ALLOWED_ORIGINS is required.
// - In development, localhost defaults are allowed.
// - Set ALLOWED_ORIGINS as comma separated values, for example:
//   https://campus-find-frontend.onrender.com,https://your-admin-site.onrender.com,http://127.0.0.1:5501
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.error("ALLOWED_ORIGINS is required in production.");
  process.exit(1);
}

const developmentOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501"
];
const corsOrigins =
  allowedOrigins.length > 0
    ? allowedOrigins
    : isProduction
      ? []
      : developmentOrigins;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin.replace(/\/$/, ""))) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS policy."));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Photos are sent as Base64 JSON (up to 5 shrunk photos + 1 preview per report).
app.use(express.json({ limit: "15mb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);

// Health-check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CampusFind Backend is Running"
  });
});

// Friendly response when someone opens the backend URL directly
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CampusFind API is live. Use the CampusFind website to continue."
  });
});

// Unknown API routes return JSON instead of an HTML error page
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API route not found."
  });
});

// JSON parsing errors and oversized requests
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON request body."
    });
  }

  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      message: "Request is too large. Please use fewer or smaller photos."
    });
  }

  console.error("Request error:", err.message);

  return res.status(500).json({
    message: "An unexpected server error occurred."
  });
});

// Start only after MongoDB connects successfully
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully.");

    app.listen(PORT, () => {
      console.log(`CampusFind backend listening on port ${PORT}.`);
    });
  } catch (error) {
    console.error("Could not start CampusFind backend.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
