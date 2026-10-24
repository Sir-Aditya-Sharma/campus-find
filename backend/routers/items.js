const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();
const Item = require("../model/Item");
const User = require("../model/User");
const {
  authenticateUser,
  authenticateAdmin
} = require("../middleware/auth");

const REPORT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGES = 5;
// The website shrinks every photo before upload, so real photos are far smaller than this.
const MAX_IMAGE_LENGTH = 4_000_000;
const MAX_THUMBNAIL_LENGTH = 300_000;

/* ---------------- HELPERS ---------------- */

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedImage(image, maxLength) {
  if (
    typeof image !== "string" ||
    !image ||
    image.length > maxLength
  ) {
    return false;
  }

  return (
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(image) ||
    /^https:\/\/res\.cloudinary\.com\/[\w\-./~%:@+?=&]+$/i.test(image)
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

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// A date more than ~1.5 days ahead is a mistake (the slack covers time zones).
function isFarFuture(value) {
  const time = new Date(`${value}T00:00:00.000Z`).getTime();
  return time > Date.now() + 36 * 60 * 60 * 1000;
}

// All photos of a report (new reports use `images`, old ones use `image`).
function imagesOf(item) {
  if (Array.isArray(item.images) && item.images.length) {
    return item.images;
  }

  return item.image ? [item.image] : [];
}

// Only these fields are ever sent to the browser (no userId, no contact data).
function publicFields(item) {
  return {
    _id: item._id,
    itemName: item.itemName,
    category: item.category,
    type: item.type,
    description: item.description,
    location: item.location,
    date: item.date,
    studentName: item.studentName,
    reporterRole: item.reporterRole || "Student",
    designation: item.designation || "",
    course: item.course || "",
    department: item.department || "",
    batch: item.batch || "",
    semester: item.semester || "",
    reviewStatus: item.reviewStatus || "Approved",
    resolutionStatus: item.resolutionStatus || "Open",
    createdAt: item.createdAt
  };
}

// Listing view: small preview photo + photo count only (full photos load on click).
function listFields(item) {
  const count = item.imageCount || (item.image ? 1 : 0);

  return {
    ...publicFields(item),
    thumbnail: item.thumbnail || item.image || "",
    imageCount: count
  };
}

function validObjectId(req, res, message) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message });
    return false;
  }

  return true;
}

/* ---------------- ADMIN ROUTES ---------------- */

// All reports for the admin panel (preview photo only, not the full photos).
router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const items = await Item.find().select("-images").sort({ createdAt: -1 }).lean();

    return res.json(
      items.map((item) => ({
        ...listFields(item),
        reporterEmail: item.studentContact,
        reviewedAt: item.reviewedAt,
        returnedAt: item.returnedAt,
        isExpired: isExpired(item)
      }))
    );
  } catch (error) {
    console.error("Admin report list error:", error.message);

    return res.status(500).json({ message: "Could not load admin reports." });
  }
});

// One report with all photos and full reporter details (admin).
router.get("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    if (!validObjectId(req, res, "Invalid item ID.")) return;

    const item = await Item.findById(req.params.id).lean();

    if (!item) {
      return res.status(404).json({ message: "Report not found." });
    }

    const poster = await User.findById(item.userId)
      .select("name email phone accountType")
      .lean();

    return res.json({
      ...publicFields(item),
      reviewedAt: item.reviewedAt,
      returnedAt: item.returnedAt,
      images: imagesOf(item),
      reporter: {
        name: poster?.name || item.studentName,
        email: poster?.email || item.studentContact,
        phone: poster?.phone || "",
        accountType: poster?.accountType || item.reporterRole || "Student"
      }
    });
  } catch (error) {
    console.error("Admin report detail error:", error.message);

    return res.status(500).json({ message: "Could not load this report." });
  }
});

// Approve or reject a report.
router.patch("/admin/:id/review", authenticateAdmin, async (req, res) => {
  try {
    if (!validObjectId(req, res, "Invalid item ID.")) return;

    const { reviewStatus } = req.body || {};

    if (!["Approved", "Rejected"].includes(reviewStatus)) {
      return res.status(400).json({ message: "Choose Approved or Rejected." });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Report not found." });
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
    console.error("Report review error:", error.message);

    return res.status(500).json({ message: "Could not update report review." });
  }
});

// Admin deletes any report.
router.delete("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    if (!validObjectId(req, res, "Invalid item ID.")) return;

    const item = await Item.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Report not found." });
    }

    return res.json({ message: "Report deleted." });
  } catch (error) {
    console.error("Admin delete error:", error.message);

    return res.status(500).json({ message: "Could not delete report." });
  }
});

/* ---------------- STUDENT / FACULTY ROUTES ---------------- */

// Recent approved reports + the current user's own reports.
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
    })
      .select("-images")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(
      items.map((item) => ({
        ...listFields(item),
        isOwner: String(item.userId) === req.user.id
      }))
    );
  } catch (error) {
    console.error("Student report list error:", error.message);

    return res.status(500).json({ message: "Failed to fetch items." });
  }
});

// One report: all photos + full details + poster contact (when allowed).
router.get("/:id", authenticateUser, async (req, res) => {
  try {
    if (!validObjectId(req, res, "Invalid item ID.")) return;

    const item = await Item.findById(req.params.id).lean();

    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    const isOwner = String(item.userId) === req.user.id;
    const reviewStatus = item.reviewStatus || "Approved";
    const resolutionStatus = item.resolutionStatus || "Open";

    if ((reviewStatus !== "Approved" && !isOwner) || isExpired(item)) {
      return res.status(404).json({ message: "This report is not available." });
    }

    // Contact details only for an approved, open report that is not your own.
    let contact = null;

    if (!isOwner && reviewStatus === "Approved" && resolutionStatus === "Open") {
      const poster = await User.findById(item.userId)
        .select("name email phone")
        .lean();

      if (poster) {
        contact = {
          studentName: poster.name,
          studentContact: poster.email,
          studentPhone: poster.phone || ""
        };
      }
    }

    return res.json({
      ...publicFields(item),
      images: imagesOf(item),
      isOwner,
      contact
    });
  } catch (error) {
    console.error("Report detail error:", error.message);

    return res.status(500).json({ message: "Could not load this report." });
  }
});

// Create a lost/found report.
router.post("/", authenticateUser, async (req, res) => {
  try {
    const body = req.body || {};
    const isFaculty = req.user.accountType === "Faculty";

    const finalName = cleanString(body.itemName ?? body.title);
    const finalType = body.type ?? body.status;
    const cleanCategory = cleanString(body.category);
    const cleanLocation = cleanString(body.location);
    const cleanDescription = cleanString(body.description);
    const cleanCourse = cleanString(body.course);
    const cleanDepartment = cleanString(body.department);
    const cleanBatch = cleanString(body.batch);
    const cleanSemester = cleanString(body.semester);
    const cleanDesignation = cleanString(body.designation);

    // Students must give course, batch and semester. Faculty must give a designation.
    const missingRoleFields = isFaculty
      ? !cleanDesignation
      : !cleanCourse || !cleanBatch || !cleanSemester;

    if (
      !finalName ||
      finalName.length > 120 ||
      !cleanCategory ||
      cleanCategory.length > 80 ||
      !["Lost", "Found"].includes(finalType) ||
      !cleanLocation ||
      cleanLocation.length > 200 ||
      !cleanDepartment ||
      cleanDepartment.length > 100 ||
      cleanCourse.length > 100 ||
      cleanBatch.length > 30 ||
      cleanSemester.length > 30 ||
      cleanDesignation.length > 60 ||
      missingRoleFields ||
      !isValidDateString(body.date)
    ) {
      return res.status(400).json({
        message: "Please check all required fields and try again."
      });
    }

    if (isFarFuture(body.date)) {
      return res.status(400).json({
        message: "The date cannot be in the future."
      });
    }

    if (!cleanDescription || cleanDescription.length > 3000) {
      return res.status(400).json({
        message: "Description is required and must be 3000 characters or fewer."
      });
    }

    // Photos: new sites send `images` (array); an old single `image` still works.
    let imageList = [];

    if (Array.isArray(body.images)) {
      imageList = body.images;
    } else if (typeof body.image === "string" && body.image) {
      imageList = [body.image];
    }

    if (imageList.length > MAX_IMAGES) {
      return res.status(400).json({
        message: `You can upload up to ${MAX_IMAGES} photos.`
      });
    }

    if (!imageList.every((image) => isAllowedImage(image, MAX_IMAGE_LENGTH))) {
      return res.status(400).json({
        message: "Use valid supported photos (JPG, PNG, WEBP or GIF)."
      });
    }

    let thumbnail = typeof body.thumbnail === "string" ? body.thumbnail : "";

    if (thumbnail && !isAllowedImage(thumbnail, MAX_THUMBNAIL_LENGTH)) {
      return res.status(400).json({ message: "Invalid photo preview." });
    }

    if (!thumbnail && imageList.length) {
      thumbnail = imageList[0];
    }

    const savedItem = await new Item({
      itemName: finalName,
      category: cleanCategory,
      type: finalType,
      description: cleanDescription,
      location: cleanLocation,
      date: body.date.trim(),
      images: imageList,
      imageCount: imageList.length,
      thumbnail,
      studentName: req.user.name,
      reporterRole: isFaculty ? "Faculty" : "Student",
      designation: cleanDesignation,
      course: cleanCourse,
      department: cleanDepartment,
      batch: cleanBatch,
      semester: cleanSemester,
      studentContact: req.user.email,
      userId: req.user.id,
      reviewStatus: "Pending",
      resolutionStatus: "Open"
    }).save();

    return res.status(201).json({
      message: "Report sent to an admin for review.",
      item: {
        _id: savedItem._id,
        reviewStatus: savedItem.reviewStatus
      }
    });
  } catch (error) {
    console.error("Create report error:", error.message);

    return res.status(500).json({ message: "Failed to create item." });
  }
});

// Mark the current user's approved report as returned.
router.patch("/:id/resolve", authenticateUser, async (req, res) => {
  try {
    if (!validObjectId(req, res, "Invalid item ID.")) return;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    if (String(item.userId) !== req.user.id) {
      return res.status(403).json({
        message: "You can only close your own reports."
      });
    }

    if ((item.reviewStatus || "Approved") !== "Approved") {
      return res.status(400).json({
        message: "Only approved reports can be closed."
      });
    }

    if ((item.resolutionStatus || "Open") === "Returned") {
      return res.status(409).json({
        message: "This report is already marked as returned."
      });
    }

    item.resolutionStatus = "Returned";
    item.returnedAt = new Date();
    await item.save();

    return res.json({
      message: "Report marked as returned.",
      resolutionStatus: item.resolutionStatus
    });
  } catch (error) {
    console.error("Resolve report error:", error.message);

    return res.status(500).json({ message: "Could not close report." });
  }
});

// A user can delete only their own report.
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    if (!validObjectId(req, res, "Invalid item ID.")) return;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    if (String(item.userId) !== req.user.id) {
      return res.status(403).json({
        message: "You can only delete your own reports."
      });
    }

    await item.deleteOne();

    return res.json({ message: "Item deleted." });
  } catch (error) {
    console.error("Delete report error:", error.message);

    return res.status(500).json({ message: "Failed to delete item." });
  }
});

module.exports = router;
