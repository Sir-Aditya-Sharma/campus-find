
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Item = require("../model/Item");

// ===============================
// AUTHENTICATION
// ===============================
function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Please login first"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "campus-secret-key"
        );

        req.user = decoded;

        if (!req.user.id) {
            return res.status(401).json({
                message: "Invalid login token. Please login again."
            });
        }

        next();
    } catch (error) {
        console.error("Authentication error:", error.message);

        return res.status(401).json({
            message: "Invalid or expired login. Please login again."
        });
    }
}

// ===============================
// GET ALL ITEMS
// ===============================
router.get("/", async (req, res) => {
    try {
        const items = await Item.find().sort({ createdAt: -1 });
        res.json(items);
    } catch (error) {
        console.error("GET ITEMS ERROR:", error);

        res.status(500).json({
            message: "Failed to fetch items"
        });
    }
});

// ===============================
// CREATE NEW ITEM
// Matches the existing index.html form
// ===============================
router.post("/", authenticateUser, async (req, res) => {
    try {
        const {
            title,
            category,
            status,
            description,
            location,
            date,
            image
        } = req.body;

        // Only the fields marked * in the frontend are required.
        if (
            typeof title !== "string" || !title.trim() ||
            typeof category !== "string" || !category.trim() ||
            !["Lost", "Found"].includes(status) ||
            typeof location !== "string" || !location.trim() ||
            !date
        ) {
            return res.status(400).json({
                message: "Please enter Item Name, choose Category and Report Type, and fill Location and Date."
            });
        }

        const newItem = new Item({
            title: title.trim(),
            category: category.trim(),
            status,
            description: typeof description === "string"
                ? description.trim()
                : "",
            location: location.trim(),
            date,
            image: typeof image === "string" ? image : "",
            userId: req.user.id
        });

        const savedItem = await newItem.save();

        console.log("ITEM CREATED BY USER:", req.user.email || req.user.id);

        return res.status(201).json({
            message: "Item created successfully",
            item: savedItem
        });
    } catch (error) {
        console.error("CREATE ITEM ERROR:", error);

        return res.status(500).json({
            message: "Failed to create item",
            error: error.message
        });
    }
});

// ===============================
// DELETE ITEM
// ===============================
router.delete("/:id", authenticateUser, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);

        if (!item) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // Do not allow deletion of reports that have no recorded owner.
        if (!item.userId) {
            return res.status(403).json({
                message: "This older report has no recorded owner. An admin must review it."
            });
        }

        if (item.userId.toString() !== String(req.user.id)) {
            return res.status(403).json({
                message: "You can only delete your own reports"
            });
        }

        await Item.findByIdAndDelete(req.params.id);

        return res.json({
            message: "Item deleted successfully"
        });
    } catch (error) {
        console.error("DELETE ITEM ERROR:", error);

        return res.status(500).json({
            message: "Failed to delete item"
        });
    }
});

module.exports = router;