const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../model/User");
const router = express.Router();

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

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill in name, email, and password."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters."
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = typeof phone === "string" ? phone.trim() : "";

        if (cleanPhone && !/^[+0-9().\-\s]{7,30}$/.test(cleanPhone)) {
            return res.status(400).json({
                message: "Please enter a valid phone number, or leave it blank."
            });
        }

        const existingUser = await User.findOne({ email: cleanEmail });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name: name.trim(),
            email: cleanEmail,
            password: hashedPassword,
            phone: cleanPhone
        });

        await user.save();

        return res.status(201).json({
            message: "Registration successful."
        });
    } catch (error) {
        console.error("REGISTER ERROR:", error);
        return res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter email and password."
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                email: user.email
            },
            process.env.JWT_SECRET || "campus-secret-key",
            { expiresIn: "7d" }
        );

        return res.json({
            message: "Login successful.",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone || ""
            }
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// UPDATE OPTIONAL PHONE FOR AN EXISTING ACCOUNT
router.patch("/phone", authenticateUser, async (req, res) => {
    try {
        const phone = typeof req.body.phone === "string"
            ? req.body.phone.trim()
            : "";

        if (phone && !/^[+0-9().\-\s]{7,30}$/.test(phone)) {
            return res.status(400).json({
                message: "Please enter a valid phone number, or leave it blank."
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        user.phone = phone;
        await user.save();

        return res.json({
            message: phone
                ? "Phone number saved."
                : "Phone number removed.",
            phone: user.phone
        });
    } catch (error) {
        console.error("UPDATE PHONE ERROR:", error);
        return res.status(500).json({
            message: "Could not update phone number."
        });
    }
});

module.exports = router;