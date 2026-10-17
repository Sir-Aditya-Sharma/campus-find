const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();
const Item = require("../model/Item");
const User = require("../model/User");

const REPORT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_LENGTH = 14_000_000;

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Please login first."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: "Login is not configured on the server."
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id || !mongoose.isValidObjectId(decoded.id)) {
      return res.status(401).json({
        message: "Invalid login token. Please login again."
      });
    }

    const user = await User.findById(decoded.id).select("email accountStatus");

    if (!user) {
      return res.status(401).json({
        message: "Account not found. Please log in again."
      });
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();

    const isAdmin = Boolean(adminEmail) && user.email === adminEmail;

    if (!isAdmin && user.accountStatus !== "Approved") {
      return res.status(403).json({
        message: "Your account is not approved or is disabled."
      });
    }

    req.user = {
      id: String(user._id),
      email: user.email
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired login. Please login again."
    });
  }
}

function authenticateAdmin(req, res, next) {
  authenticateUser(req, res, () => {
    const adminEmail = String(process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();

    if (!adminEmail) {
      return res.status(503).json({
        message: "Admin access has not been configured."
      });
    }

    const loggedInEmail = String(req.user.email || "")
      .trim()
      .toLowerCase();

    if (loggedInEmail !== adminEmail) {
      return res.status(403).json({
        message: "This account does not have admin access."
      });
    }

    return next();
  });
}

function isAllowedImage(image) {
  if (!image) {
    return true;
  }

  if (
    typeof image !== "string" ||
    image.length > MAX_IMAGE_LENGTH
  ) {
    return false;
  }

  return (
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image) ||
    /^https:\/\/res\.cloudinary\.com\//i.test(image)
  );
}

function isExpired(item) {
  if (!item.createdAt) {
    return true;
  }

  const createdAt = new Date(item.createdAt).getTime();

  return (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > REPORT_LIFETIME_MS
  );
}

/* Admin routes */

router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });

    return res.json(
      items.map(document => {
        const item = document.toObject();

        return {
          ...item,
          reviewStatus: item.reviewStatus || "Approved",
          resolutionStatus: item.resolutionStatus || "Open",
          isExpired: isExpired(item)
        };
      })
    );
  } catch (error) {
    return res.status(500).json({
      message: "Could not load admin reports."
    });
  }
});

router.patch("/admin/:id/review", authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid item ID."
      });
    }

    const { reviewStatus } = req.body;

    if (!["Approved", "Rejected"].includes(reviewStatus)) {
      return res.status(400).json({
        message: "Choose Approved or Rejected."
      });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Report not found."
      });
    }

    item.reviewStatus = reviewStatus;
    item.reviewedAt = new Date();
    item.reviewedBy = req.user.id;

    await item.save();

    return res.json({
      message: `Report ${reviewStatus.toLowerCase()}.`,
      reviewStatus: item.reviewStatus
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update report review."
    });
  }
});

router.delete("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid item ID."
      });
    }

    const item = await Item.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Report not found."
      });
    }

    return res.json({
      message: "Report deleted."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not delete report."
    });
  }
});

/* Student routes */

router.get("/", authenticateUser, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - REPORT_LIFETIME_MS);

    const items = await Item.find({
      createdAt: { $gte: cutoff },
      $or: [
        { reviewStatus: "Approved" },
        { reviewStatus: { $exists: false } },
        { reviewStatus: null },
        { userId: req.user.id }
      ]
    }).sort({ createdAt: -1 });

    const safeItems = items.map(document => {
      const item = document.toObject();
      const isOwner = String(item.userId) === String(req.user.id);

      delete item.userId;
      delete item.studentContact;
      delete item.reviewedBy;

      return {
        ...item,
        reviewStatus: item.reviewStatus || "Approved",
        resolutionStatus: item.resolutionStatus || "Open",
        isOwner
      };
    });

    return res.json(safeItems);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch items."
    });
  }
});

router.get("/:id/contact", authenticateUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid item ID."
      });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Item not found."
      });
    }

    if ((item.reviewStatus || "Approved") !== "Approved") {
      return res.status(404).json({
        message: "This report is not approved yet."
      });
    }

    if ((item.resolutionStatus || "Open") === "Returned") {
      return res.status(409).json({
        message: "This report has already been closed."
      });
    }

    if (String(item.userId) === String(req.user.id)) {
      return res.status(400).json({
        message: "This is your own report."
      });
    }

    const poster = await User.findById(item.userId)
      .select("name email phone");

    if (!poster) {
      return res.status(404).json({
        message: "Poster account not found."
      });
    }

    return res.json({
      studentName: poster.name,
      studentContact: poster.email,
      studentPhone: poster.phone || ""
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not get poster contact."
    });
  }
});

router.post("/", authenticateUser, async (req, res) => {
  try {
    const {
      title,
      itemName,
      category,
      status,
      type,
      description,
      location,
      date,
      image,
      course,
      department,
      batch,
      semester
    } = req.body;

    const finalName = itemName ?? title;
    const finalType = type ?? status;
    const cleanDate = typeof date === "string" ? date.trim() : "";

    if (
      typeof finalName !== "string" ||
      !finalName.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      !["Lost", "Found"].includes(finalType) ||
      typeof location !== "string" ||
      !location.trim() ||
      typeof course !== "string" ||
      !course.trim() ||
      typeof department !== "string" ||
      !department.trim() ||
      typeof batch !== "string" ||
      !batch.trim() ||
      typeof semester !== "string" ||
      !semester.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) ||
      Number.isNaN(Date.parse(`${cleanDate}T00:00:00Z`))
    ) {
      return res.status(400).json({
        message: "Please fill in all required fields."
      });
    }

    if (
      typeof description !== "string" ||
      !description.trim()
    ) {
      return res.status(400).json({
        message: "Please enter an item description."
      });
    }

    if (!isAllowedImage(image || "")) {
      return res.status(400).json({
        message: "Use a valid image of 10 MB or smaller."
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        message: "User not found. Please login again."
      });
    }

    const newItem = new Item({
      itemName: finalName.trim(),
      category: category.trim(),
      type: finalType,
      description: description.trim(),
      location: location.trim(),
      date: cleanDate,
      image: image || "",
      studentName: user.name,
      course: course.trim(),
      department: department.trim(),
      batch: batch.trim(),
      semester: semester.trim(),
      studentContact: user.email,
      userId: user._id,
      reviewStatus: "Pending",
      resolutionStatus: "Open"
    });

    const savedItem = await newItem.save();

    return res.status(201).json({
      message: "Report sent to an admin for review.",
      item: {
        _id: savedItem._id,
        reviewStatus: savedItem.reviewStatus
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create item."
    });
  }
});

router.patch("/:id/resolve", authenticateUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid item ID."
      });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Item not found."
      });
    }

    if (String(item.userId) !== String(req.user.id)) {
      return res.status(403).json({
        message: "You can only close your own reports."
      });
    }

    if ((item.reviewStatus || "Approved") !== "Approved") {
      return res.status(400).json({
        message: "Only approved reports can be closed."
      });
    }

    item.resolutionStatus = "Returned";
    await item.save();

    return res.json({
      message: "Report marked as returned.",
      resolutionStatus: item.resolutionStatus
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not close report."
    });
  }
});

router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid item ID."
      });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Item not found."
      });
    }

    if (String(item.userId) !== String(req.user.id)) {
      return res.status(403).json({
        message: "You can only delete your own reports."
      });
    }

    await item.deleteOne();

    return res.json({
      message: "Item deleted."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete item."
    });
  }
});

module.exports = router;