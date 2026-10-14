const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();
const Item = require("../model/Item");
const User = require("../model/User");

function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Please login first" });
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

// GET ITEMS
// The server computes isOwner from the login token.
// It does not send owner IDs or contact emails to the page.
router.get("/", authenticateUser, async (req, res) => {
    try {
        const items = await Item.find()
            .select("-studentContact")
            .sort({ createdAt: -1 });

        const safeItems = items.map(doc => {
            const item = doc.toObject();
            const isOwner = String(item.userId) === String(req.user.id);

            delete item.userId;
            delete item.studentContact;

            return { ...item, isOwner };
        });

        return res.json(safeItems);
    } catch (error) {
        console.error("GET ITEMS ERROR:", error);
        return res.status(500).json({
            message: "Failed to fetch items"
        });
    }
});

// GET POSTER CONTACT — logged-in users only
router.get("/:id/contact", authenticateUser, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid item ID" });
        }

        const item = await Item.findById(req.params.id)
            .select("studentName studentContact userId");

        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        if (String(item.userId) === String(req.user.id)) {
            return res.status(400).json({
                message: "This is your own report."
            });
        }

        return res.json({
            studentName: item.studentName,
            studentContact: item.studentContact
        });
    } catch (error) {
        console.error("GET CONTACT ERROR:", error);
        return res.status(500).json({
            message: "Could not get poster contact"
        });
    }
});

// CREATE ITEM
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
                message: "Please fill in all required fields."
            });
        }

        if (typeof description !== "string" || !description.trim()) {
            return res.status(400).json({
                message: "Please enter an item description."
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(401).json({
                message: "User not found. Please login again."
            });
        }

        const newItem = new Item({
            itemName: finalName.trim(),
            category: category.trim(),
            type: finalType,
            description: description.trim(),
            location: location.trim(),
            date: String(date),
            image: typeof image === "string" ? image : "",
            studentName: user.name,
            studentContact: user.email,
            userId: user._id
        });

        const savedItem = await newItem.save();

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

// DELETE ITEM — owner only
router.delete("/:id", authenticateUser, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid item ID" });
        }

        const item = await Item.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        if (!item.userId) {
            return res.status(403).json({
                message: "This report has no recorded owner."
            });
        }

        if (String(item.userId) !== String(req.user.id)) {
            return res.status(403).json({
                message: "You can only delete your own reports."
            });
        }

        await item.deleteOne();

        return res.json({ message: "Item deleted successfully" });
    } catch (error) {
        console.error("DELETE ITEM ERROR:", error);
        return res.status(500).json({
            message: "Failed to delete item"
        });
    }
});

module.exports = router;