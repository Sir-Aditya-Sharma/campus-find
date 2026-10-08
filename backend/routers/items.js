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

        if (!authHeader) {
            return res.status(401).json({
                message: "Please login first"
            });
        }

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Invalid authorization format"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "campus-secret-key"
        );

        req.user = decoded;

        next();

    } catch (error) {
        console.error("Authentication error:", error);

        return res.status(401).json({
            message: "Invalid or expired login"
        });
    }
}


// ===============================
// GET ALL ITEMS
// ===============================

router.get("/", async (req, res) => {
    try {

        const items = await Item.find()
            .sort({ createdAt: -1 });

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
// ===============================

router.post(
    "/",
    authenticateUser,
    async (req, res) => {

        try {

            const {
                itemName,
                category,
                type,
                description,
                location,
                date,
                image,
                studentName,
                studentContact
            } = req.body;


            if (
                !itemName ||
                !category ||
                !type ||
                !description ||
                !location ||
                !date ||
                !studentName ||
                !studentContact
            ) {

                return res.status(400).json({
                    message: "Please fill all required fields"
                });

            }


            const newItem = new Item({

                itemName: itemName,

                category: category,

                type: type,

                description: description,

                location: location,

                date: date,

                image: image || "",

                studentName: studentName,

                studentContact: studentContact,

                userId: req.user.id

            });


            const savedItem = await newItem.save();


            console.log(
                "ITEM CREATED BY USER:",
                req.user.email
            );


            res.status(201).json({

                message: "Item created successfully",

                item: savedItem

            });


        } catch (error) {

            console.error(
                "CREATE ITEM ERROR:",
                error
            );

            res.status(500).json({

                message: "Failed to create item",

                error: error.message

            });

        }

    }
);


// ===============================
// DELETE ITEM
// ===============================

router.delete(
    "/:id",
    authenticateUser,
    async (req, res) => {

        try {

            const item = await Item.findById(
                req.params.id
            );


            if (!item) {

                return res.status(404).json({
                    message: "Item not found"
                });

            }


            // User can delete only their own report

            if (
                item.userId &&
                item.userId.toString() !== req.user.id
            ) {

                return res.status(403).json({

                    message:
                        "You can only delete your own reports"

                });

            }


            await Item.findByIdAndDelete(
                req.params.id
            );


            res.json({

                message:
                    "Item deleted successfully"

            });


        } catch (error) {

            console.error(
                "DELETE ITEM ERROR:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to delete item"

            });

        }

    }
);


module.exports = router;