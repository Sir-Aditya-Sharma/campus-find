```javascript
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();
const Item = require("../model/Item");
const User = require("../model/User");

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

        if (!decoded.id || !mongoose.isValidObjectId(decoded.id)) {
            return res.status(401).json({
                message: "Invalid login token. Please login again."
            });
        }

        req.user = decoded;
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
        return res.json(items);
    } catch (error) {
        console.error("GET ITEMS ERROR:", error);

        return res.status(500).json({
            message: "Failed to fetch items"
        });
    }
});

// ===============================
// CREATE NEW ITEM
// ===============================
router.post("/", authenticateUser, async (req, res) => {
    try {
        const {
            title,
            itemName,
            category,
            status,
            type,
            description,
            location,
            date,
            image
        } = req.body;

        // Support both the current frontend and older field names.
        const finalName = itemName ?? title;
        const finalType = type ?? status;

        if (
            typeof finalName !== "string" ||
            !finalName.trim() ||
            typeof category !== "string" ||
            !category.trim() ||
            !["Lost", "Found"].includes(finalType) ||
            typeof location !== "string" ||
            !location.trim() ||
            !date
        ) {
            return res.status(400).json({
                message: "Please fill in Item Name, Category, Report Type, Location and Date."
            });
        }

        // Get the authenticated user from the database.
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(401).json({
                message: "User account not found. Please login again."
            });
        }

        const newItem = new Item({
            itemName: finalName.trim(),
            category: category.trim(),
            type: finalType,
            description:
                typeof description === "string"
                    ? description.trim()
                    : "",
            location: location.trim(),
            date: String(date),
            image: typeof image === "string" ? image : "",
            studentName: user.name,
            studentContact: user.email,
            userId: user._id
        });

        const savedItem = await newItem.save();

        console.log("ITEM CREATED BY USER:", user.email);

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
// DELETE ITEM - OWNER ONLY
// ===============================
router.delete("/:id", authenticateUser, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid item ID"
            });
        }

        const item = await Item.findById(req.params.id);

        if (!item) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

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

        await item.deleteOne();

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
```
