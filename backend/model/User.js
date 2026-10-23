const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    accountType: {
  type: String,
  enum: ["Student", "Faculty"],
  default: "Student",
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

    accountStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Disabled"],
      // Existing accounts stay usable; new registrations are set to Pending.
      default: "Approved"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
