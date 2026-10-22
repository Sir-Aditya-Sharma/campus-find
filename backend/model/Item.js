
const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    type: {
      type: String,
      enum: ["Lost", "Found"],
      required: true
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000
    },

    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
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
      trim: true,
      maxlength: 100
    },

    course: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    department: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    batch: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30
    },

    semester: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30
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
