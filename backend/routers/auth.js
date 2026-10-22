
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../model/User");
const router = express.Router();

function getAdminEmail() {
  return String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

function isValidPhone(phone) {
  return !phone || /^[+0-9().\-\s]{7,30}$/.test(phone);
}

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Please login first."
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        message: "Invalid login token. Please login again."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id || !mongoose.isValidObjectId(decoded.id)) {
      return res.status(401).json({
        message: "Invalid login token. Please login again."
      });
    }

    const user = await User.findById(decoded.id).select(
      "name email phone accountStatus"
    );

    if (!user) {
      return res.status(401).json({
        message: "Account not found. Please login again."
      });
    }

    const adminEmail = getAdminEmail();
    const isAdmin = Boolean(adminEmail) &&
      user.email.toLowerCase() === adminEmail;

    if (!isAdmin && user.accountStatus !== "Approved") {
      return res.status(403).json({
        message: "Your account is not approved or is disabled."
      });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      isAdmin
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError" ||
        error.name === "JsonWebTokenError") {
      return res.status(401).json({
        message: "Invalid or expired login. Please login again."
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      message: "Could not verify your login."
    });
  }
}

function authenticateAdmin(req, res, next) {
  const adminEmail = getAdminEmail();

  if (!adminEmail) {
    return res.status(503).json({
      message: "Admin access has not been configured."
    });
  }

  return authenticateUser(req, res, () => {
    if (req.user.email.toLowerCase() !== adminEmail) {
      return res.status(403).json({
        message: "This account does not have admin access."
      });
    }

    return next();
  });
}

// Register a student account. Admin approval is required before login.
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};

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
          "Enter your name, valid email, and a password of 8–128 characters."
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === getAdminEmail()) {
      return res.status(403).json({
        message:
          "The admin account cannot be created through student signup."
      });
    }

    const cleanPhone = typeof phone === "string" ? phone.trim() : "";

    if (!isValidPhone(cleanPhone)) {
      return res.status(400).json({
        message: "Enter a valid phone number, or leave it blank."
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      password: await bcrypt.hash(password, 12),
      phone: cleanPhone,
      accountStatus: "Pending"
    });

    await user.save();

    return res.status(201).json({
      message:
        "Account request sent. An admin must approve it before you can log in.",
      accountStatus: user.accountStatus
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      message: "Could not submit the account request."
    });
  }
});

// Login approved students and the configured admin.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
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
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const adminEmail = getAdminEmail();
    const isAdmin = Boolean(adminEmail) &&
      cleanEmail === adminEmail;

    if (!isAdmin && user.accountStatus !== "Approved") {
      let message = "Your account is waiting for admin approval.";

      if (user.accountStatus === "Rejected") {
        message =
          "Your account request was rejected. Contact the campus admin.";
      } else if (user.accountStatus === "Disabled") {
        message = "This account is disabled. Contact the campus admin.";
      }

      return res.status(403).json({ message });
    }

    const token = jwt.sign(
      {
        id: String(user._id),
        email: user.email
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

// Admin: list student accounts without exposing password hashes.
router.get("/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find({
      email: { $ne: getAdminEmail() }
    })
      .select("name email phone accountStatus createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(users);
  } catch (error) {
    console.error("Load users error:", error.message);

    return res.status(500).json({
      message: "Could not load student accounts."
    });
  }
});

// Admin: approve, reject, or disable a student account.
router.patch(
  "/admin/users/:id/status",
  authenticateAdmin,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid account ID."
        });
      }

      const { accountStatus } = req.body || {};

      if (!["Approved", "Rejected", "Disabled"].includes(accountStatus)) {
        return res.status(400).json({
          message: "Choose Approved, Rejected, or Disabled."
        });
      }

      const user = await User.findOne({
        _id: req.params.id,
        email: { $ne: getAdminEmail() }
      });

      if (!user) {
        return res.status(404).json({
          message: "Student account not found."
        });
      }

      user.accountStatus = accountStatus;
      await user.save();

      return res.json({
        message: `Account ${accountStatus.toLowerCase()}.`,
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

// Admin: reset a student's password.
router.patch(
  "/admin/users/:id/password",
  authenticateAdmin,
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid account ID."
        });
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
        return res.status(404).json({
          message: "Student account not found."
        });
      }

      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();

      return res.json({
        message:
          "Password reset. Give the new password to the student privately."
      });
    } catch (error) {
      console.error("Password reset error:", error.message);

      return res.status(500).json({
        message: "Could not reset the password."
      });
    }
  }
);

// Logged-in student: update their optional phone number.
router.patch("/phone", authenticateUser, async (req, res) => {
  try {
    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim()
        : "";

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        message: "Enter a valid phone number, or leave it blank."
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
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
      message: "Could not update phone number."
    });
  }
});

module.exports = router;
