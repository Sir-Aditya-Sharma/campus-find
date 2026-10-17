const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../model/User");
const router = express.Router();

function getAdminEmail() {
  return String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Please login first." });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: "Login is not configured on the server."
      });
    }

    const decoded = jwt.verify(
      authHeader.split(" ")[1],
      process.env.JWT_SECRET
    );

    if (!decoded.id || !mongoose.isValidObjectId(decoded.id)) {
      return res.status(401).json({
        message: "Invalid login token. Please login again."
      });
    }

    const user = await User.findById(decoded.id).select("email accountStatus");

    if (!user) {
      return res.status(401).json({
        message: "Account not found. Please login again."
      });
    }

    const isAdmin =
      Boolean(getAdminEmail()) && user.email === getAdminEmail();

    if (!isAdmin && user.accountStatus !== "Approved") {
      return res.status(403).json({
        message: "Your account is not approved or is disabled."
      });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      isAdmin
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired login. Please login again."
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
    if (req.user.email !== adminEmail) {
      return res.status(403).json({
        message: "This account does not have admin access."
      });
    }

    return next();
  });
}

// New account requests remain pending until an admin approves them.
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Enter your name, email, and a password of at least 8 characters."
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === getAdminEmail()) {
      return res.status(403).json({
        message: "The admin account cannot be created through student signup."
      });
    }

    const cleanPhone = typeof phone === "string" ? phone.trim() : "";

    if (cleanPhone && !/^[+0-9().\-\s]{7,30}$/.test(cleanPhone)) {
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
      message: "Account request sent. An admin must approve it before you can log in.",
      accountStatus: user.accountStatus
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    return res.status(500).json({
      message: "Could not submit the account request."
    });
  }
});

// Only approved students and the configured admin can log in.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

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
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const isAdmin =
      Boolean(getAdminEmail()) && cleanEmail === getAdminEmail();

    if (!isAdmin && user.accountStatus !== "Approved") {
      let message = "Your account is waiting for admin approval.";

      if (user.accountStatus === "Rejected") {
        message = "Your account request was rejected. Contact the campus admin.";
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
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        isAdmin
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not log in."
    });
  }
});

// Admin can see account details and statuses, never the existing passwords.
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
    return res.status(500).json({
      message: "Could not load student accounts."
    });
  }
});

// Admin can approve, reject, or disable student accounts.
router.patch("/admin/users/:id/status", authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid account ID."
      });
    }

    const { accountStatus } = req.body;

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
    return res.status(500).json({
      message: "Could not update the account."
    });
  }
});

// Admin can set a new password; the old password is never shown.
router.patch("/admin/users/:id/password", authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid account ID."
      });
    }

    const { newPassword } = req.body;

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters."
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
      message: "Password reset. Give the new password to the student privately."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not reset the password."
    });
  }
});

// A logged-in student can update their optional phone number.
router.patch("/phone", authenticateUser, async (req, res) => {
  try {
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (phone && !/^[+0-9().\-\s]{7,30}$/.test(phone)) {
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
      phone: user.phone
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update phone number."
    });
  }
});

module.exports = router;