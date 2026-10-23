require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routers/auth");
const itemRoutes = require("./routers/items");

const app = express();

const PORT = process.env.PORT || 5000;

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

// CORS is kept compatible with the current frontend.
// Restrict allowed origins after confirming the exact deployed
// frontend URL and any local development URLs, for example:
// app.use(cors({ origin: ["https://campus-find-frontend.onrender.com"] }));
app.use(cors());

// The frontend sends item images as Base64 JSON data.
// Keep this limit aligned with the frontend's image-size validation.
app.use(express.json({ limit: "15mb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);

// Health-check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CampusFind Backend is Running",
  });
});

// Friendly response when someone opens the backend URL directly
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CampusFind API is live. Use the CampusFind website to continue.",
  });
});

// Unknown API routes return JSON instead of an HTML error page
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API route not found.",
  });
});

// JSON parsing errors and oversized requests
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON request body.",
    });
  }

  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      message: "Request is too large. Please use a smaller image.",
    });
  }

  console.error("Request error:", err.message);

  return res.status(500).json({
    message: "An unexpected server error occurred.",
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
