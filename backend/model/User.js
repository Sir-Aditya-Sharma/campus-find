const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        // Optional. Email remains required.
        phone: {
            type: String,
            default: "",
            trim: true,
            maxlength: 30
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);