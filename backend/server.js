require("dotenv").config();

const missingSettings = ["MONGO_URI", "JWT_SECRET"].filter(
    name => !process.env[name]
);

if (missingSettings.length) {
    console.error(
        "Missing required environment settings:",
        missingSettings.join(", ")
    );
    process.exit(1);
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "3mb" }));

const authRoutes = require("./routers/auth");
const itemRoutes = require("./routers/items");

app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);

app.get("/api/health", (req, res) => {
    res.json({
        message: "CampusFind Backend is Running"
    });
});

const PORT = process.env.PORT || 5000;

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