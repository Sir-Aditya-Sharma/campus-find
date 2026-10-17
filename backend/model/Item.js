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

    course: {
      type: String,
      default: "",
      trim: true
    },

    department: {
      type: String,
      default: "",
      trim: true
    },

    batch: {
      type: String,
      default: "",
      trim: true
    },

    semester: {
      type: String,
      default: "",
      trim: true
    },

    studentContact: {
      type: String,
      required: true,
      trim: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    reviewStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Approved"
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    resolutionStatus: {
      type: String,
      enum: ["Open", "Returned"],
      default: "Open"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Item", itemSchema);