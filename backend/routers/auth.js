const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../model/User");

const router = express.Router();


// ==========================================
// REGISTER
// ==========================================

router.post("/register", async (req, res) => {

    try {

        console.log("REGISTER REQUEST RECEIVED");
        console.log(req.body);


        const {
            name,
            email,
            password
        } = req.body;


        // Check fields

        if (!name || !email || !password) {

            return res.status(400).json({
                message: "Please fill all fields"
            });

        }


        // Check password

        if (password.length < 6) {

            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });

        }


        // Clean email

        const cleanEmail =
            email.trim().toLowerCase();


        // Check existing user

        const existingUser =
            await User.findOne({
                email: cleanEmail
            });


        if (existingUser) {

            return res.status(400).json({
                message: "User already exists"
            });

        }


        // Hash password

        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );


        // Create user

        const user =
            new User({

                name: name.trim(),

                email: cleanEmail,

                password: hashedPassword

            });


        // Save user

        await user.save();


        console.log(
            "USER REGISTERED:",
            user.email
        );


        return res.status(201).json({

            message:
                "Registration successful"

        });


    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );


        return res.status(500).json({

            message:
                "Server error",

            error:
                error.message

        });

    }

});


// ==========================================
// LOGIN
// ==========================================

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({

                message:
                    "Please enter email and password"

            });

        }


        const cleanEmail =
            email.trim().toLowerCase();


        const user =
            await User.findOne({
                email: cleanEmail
            });


        if (!user) {

            return res.status(401).json({

                message:
                    "Invalid email or password"

            });

        }


        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!passwordMatch) {

            return res.status(401).json({

                message:
                    "Invalid email or password"

            });

        }


        const token =
            jwt.sign(

                {
                    id: user._id,
                    email: user.email
                },

                process.env.JWT_SECRET ||
                    "campus-secret-key",

                {
                    expiresIn: "7d"
                }

            );


        return res.json({

            message:
                "Login successful",

            token: token,

            user: {

                id: user._id,

                name: user.name,

                email: user.email

            }

        });


    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        return res.status(500).json({

            message:
                "Server error",

            error:
                error.message

        });

    }

});


module.exports = router;