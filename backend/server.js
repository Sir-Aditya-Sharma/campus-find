
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routers/auth");
const itemRoutes = require("./routers/items");

const app = express();
const PORT = process.env.PORT || 5000;

// Check required environment variables
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

app.use(cors());
app.use(express.json({ limit: "15mb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CampusFind Backend is Running",
  });
});

// Handle JSON parsing errors and oversized requests
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

// Start server after MongoDB connects
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
