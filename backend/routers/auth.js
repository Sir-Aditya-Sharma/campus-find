const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../model/User");
const {
  getAdminEmail,
  authenticateUser,
  authenticateAdmin
} = require("../middleware/auth");
const loginGuard = require("../middleware/loginGuard");

const router = express.Router();

function isValidPhone(phone) {
  return !phone || /^[+0-9().\-\s]{7,30}$/.test(phone);
}

// Public registration remains disabled.
router.post("/register", (req, res) => {
  return res.status(403).json({
    message:
      "Public registration is disabled. Please contact the administrator."
  });
});

// Login approved users and the configured administrator.
router.post("/login", async (req, res) => {
  try {
    const {
      email,
      password,
      accountType: requestedAccountType
    } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Please enter email and password."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: "Login is not configured on the server."
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const guardKey = `${req.ip}|${cleanEmail}`;

    if (loginGuard.isBlocked(guardKey)) {
      return res.status(429).json({
        message: "Too many wrong attempts. Please try again after 15 minutes."
      });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      loginGuard.recordFailure(guardKey);

      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const adminEmail = getAdminEmail();
    const isAdmin = Boolean(adminEmail) && cleanEmail === adminEmail;

    // Verify the selected role for non-admin accounts.
    if (!isAdmin) {
      if (!["Student", "Faculty"].includes(requestedAccountType)) {
        return res.status(400).json({
          message: "Choose Student or Faculty login."
        });
      }

      const savedAccountType = user.accountType || "Student";

      if (savedAccountType !== requestedAccountType) {
        return res.status(403).json({
          message: `This account is registered as ${savedAccountType}, not ${requestedAccountType}.`
        });
      }

      // Only approved accounts may log in.
      if (user.accountStatus !== "Approved") {
        let message = "Your account is waiting for admin approval.";

        if (user.accountStatus === "Rejected") {
          message =
            "Your account request was rejected. Contact the campus admin.";
        } else if (user.accountStatus === "Disabled") {
          message = "This account is disabled. Contact the campus admin.";
        }

        return res.status(403).json({ message });
      }
    }

    loginGuard.clear(guardKey);

    const accountType = user.accountType || (isAdmin ? "Admin" : "Student");

    const token = jwt.sign(
      {
        id: String(user._id),
        email: user.email,
        accountType,
        isAdmin
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful.",
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        accountType,
        isAdmin
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Could not log in."
    });
  }
});

// Admin: create a Student or Faculty account.
router.post("/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};

    // Default to Student for compatibility with older admin forms.
    const accountType =
      req.body?.accountType === undefined
        ? "Student"
        : req.body.accountType;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      !email.trim() ||
      email.trim().length > 254 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message:
          "Enter a name, valid email, and password of 8–128 characters."
      });
    }

    if (!["Student", "Faculty"].includes(accountType)) {
      return res.status(400).json({
        message: "Account type must be Student or Faculty."
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";

    if (cleanEmail === getAdminEmail()) {
      return res.status(400).json({
        message: "Use a different email for this account."
      });
    }

    if (!isValidPhone(cleanPhone)) {
      return res.status(400).json({
        message: "Enter a valid phone number or leave it blank."
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    // Students are approved immediately; Faculty require admin approval.
    const accountStatus = accountType === "Faculty" ? "Pending" : "Approved";

    const user = new User({
      name: cleanName,
      email: cleanEmail,
      password: await bcrypt.hash(password, 12),
      phone: cleanPhone,
      accountType,
      accountStatus
    });

    await user.save();

    return res.status(201).json({
      message:
        accountType === "Faculty"
          ? "Faculty account created. Admin approval is required."
          : "Student account created successfully.",
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        accountType: user.accountType,
        accountStatus: user.accountStatus
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    console.error("Admin account creation failed:", error.message);

    return res.status(500).json({
      message: "Could not create the account."
    });
  }
});

// Admin: list accounts without exposing password hashes.
router.get("/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find({
      email: { $ne: getAdminEmail() }
    })
      .select("name email phone accountType accountStatus createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Older accounts without accountType are treated as Students.
    return res.json(
      users.map((user) => ({
        ...user,
        accountType: user.accountType || "Student"
      }))
    );
  } catch (error) {
    console.error("Load users error:", error.message);

    return res.status(500).json({
      message: "Could not load accounts."
    });
  }
});

// Admin: approve, reject, set pending, or disable an account.
router.patch(
  "/admin/users/:id/status",
  authenticateAdmin,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid account ID." });
      }

      const { accountStatus } = req.body || {};

      if (
        !["Pending", "Approved", "Rejected", "Disabled"].includes(
          accountStatus
        )
      ) {
        return res.status(400).json({
          message: "Choose Pending, Approved, Rejected, or Disabled."
        });
      }

      const user = await User.findOne({
        _id: req.params.id,
        email: { $ne: getAdminEmail() }
      });

      if (!user) {
        return res.status(404).json({ message: "Account not found." });
      }

      user.accountStatus = accountStatus;
      await user.save();

      return res.json({
        message: `Account status updated to ${accountStatus}.`,
        accountStatus
      });
    } catch (error) {
      console.error("Update account status error:", error.message);

      return res.status(500).json({
        message: "Could not update the account."
      });
    }
  }
);

// Admin: reset an account password.
router.patch(
  "/admin/users/:id/password",
  authenticateAdmin,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid account ID." });
      }

      const { newPassword } = req.body || {};

      if (
        typeof newPassword !== "string" ||
        newPassword.length < 8 ||
        newPassword.length > 128
      ) {
        return res.status(400).json({
          message: "New password must be 8–128 characters."
        });
      }

      const user = await User.findOne({
        _id: req.params.id,
        email: { $ne: getAdminEmail() }
      });

      if (!user) {
        return res.status(404).json({ message: "Account not found." });
      }

      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();

      return res.json({
        message: "Password reset successfully. Share it privately."
      });
    } catch (error) {
      console.error("Password reset error:", error.message);

      return res.status(500).json({
        message: "Could not reset the password."
      });
    }
  }
);

// Logged-in Student or Faculty: update optional phone number.
router.patch("/phone", authenticateUser, async (req, res) => {
  try {
    const phone =
      typeof req.body?.phone === "string" ? req.body.phone.trim() : "";

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        message: "Enter a valid phone number, or leave it blank."
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.phone = phone;
    await user.save();

    return res.json({
      message: phone ? "Phone number saved." : "Phone number removed.",
      phone: user.phone || ""
    });
  } catch (error) {
    console.error("Update phone error:", error.message);

    return res.status(500).json({
      message: "Could not update the phone number."
    });
  }
});

module.exports = router;
