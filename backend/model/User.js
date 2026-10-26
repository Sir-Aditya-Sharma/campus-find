
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
      trim: true,
      maxlength: 254
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
    },

    // Server-side authorization role (JWT claims are not trusted alone).
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    // Bump this to revoke old sessions (for password reset / disabling).
    tokenVersion: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

userSchema.index({ accountStatus: 1, accountType: 1, createdAt: -1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model("User", userSchema);
