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

    // OLD single photo. Kept only so reports made before the update still show.
    image: {
      type: String,
      default: ""
    },

    // NEW: up to 5 photos per report.
    images: {
      type: [String],
      default: []
    },

    // Small preview of the first photo, used in the listing so it loads fast.
    thumbnail: {
      type: String,
      default: ""
    },

    imageCount: {
      type: Number,
      default: 0
    },

    studentName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    reporterRole: {
      type: String,
      enum: ["Student", "Faculty"],
      default: "Student"
    },

    designation: {
      type: String,
      default: "",
      trim: true,
      maxlength: 60
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
    },

    returnedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Item", itemSchema);
