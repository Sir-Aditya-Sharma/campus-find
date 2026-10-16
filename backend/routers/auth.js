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
            return res.status(401).json({
                message: "Please login first."
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(503).json({
                message: "Login is not configured on the server."
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.id || !mongoose.isValidObjectId(decoded.id)) {
            return res.status(401).json({
                message: "Invalid login token. Please login again."
            });
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired login. Please login again."
        });
    }
}

router.post("/register", async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill in name, email, and password."
            });
        }

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            password.length < 6
        ) {
            return res.status(400).json({
                message: "Enter a name, valid email, and password of at least 6 characters."
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = typeof phone === "string" ? phone.trim() : "";

        if (cleanPhone && !/^[+0-9().\-\s]{7,30}$/.test(cleanPhone)) {
            return res.status(400).json({
                message: "Enter a valid phone number, or leave it blank."
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
        return res.status(500).json({
            message: "Could not create the account."
        });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter email and password."
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(503).json({
                message: "Login is not configured on the server."
            });
        }

        const user = await User.findOne({
            email: String(email).trim().toLowerCase()
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            {
                id: String(user._id),
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
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
        return res.status(500).json({
            message: "Could not log in."
        });
    }
});

router.patch("/phone", authenticateUser, async (req, res) => {
    try {
        const phone = typeof req.body.phone === "string"
            ? req.body.phone.trim()
            : "";

        if (phone && !/^[+0-9().\-\s]{7,30}$/.test(phone)) {
            return res.status(400).json({
                message: "Enter a valid phone number, or leave it blank."
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
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
        return res.status(500).json({
            message: "Could not update phone number."
        });
    }
});

module.exports = router;