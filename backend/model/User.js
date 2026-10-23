
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

    phone: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30
    },

    // Account type: Student or Faculty
    accountType: {
      type: String,
      enum: ["Student", "Faculty"],
      default: "Student"
    },

    // Admin approval status
    accountStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Disabled"],
      default: "Approved"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
