const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
    {
        itemName: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: String,
            required: true,
            trim: true
        },

        type: {
            type: String,
            enum: ["Lost", "Found"],
            required: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        location: {
            type: String,
            required: true,
            trim: true
        },

        date: {
            type: String,
            required: true
        },

        image: {
            type: String,
            default: ""
        },

        studentName: {
            type: String,
            required: true,
            trim: true
        },

        studentContact: {
            type: String,
            required: true,
            trim: true
        },

        /*
         * This stores the ID of the user
         * who created the report.
         *
         * It is used to identify the owner
         * and allow only that user to delete
         * their own report.
         */
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Item", itemSchema);