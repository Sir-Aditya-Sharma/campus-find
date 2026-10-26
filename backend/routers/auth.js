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
const { createRateLimit } = require("../middleware/rateLimit");

const router = express.Router();
router.use(createRateLimit({ maxRequests: 180, windowMs: 15 * 60 * 1000 }));
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)
  );
}

function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    !/\s/.test(password)
  );
}

function parsePagination(query, defaultLimit = 50, maxLimit = 200) {
  const hasPagination =
    query?.page !== undefined || query?.limit !== undefined;
  const page = Math.max(Number.parseInt(query?.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(query?.limit, 10) || defaultLimit, 1),
    maxLimit
  );
  const skip = (page - 1) * limit;
  return { hasPagination, page, limit, skip };
}

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
      !isValidEmail(cleanString(email).toLowerCase()) ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Please enter a valid email and password."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: "Login is not configured on the server."
      });
    }

    const cleanEmail = cleanString(email).toLowerCase();
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
    const isAdminByRole = user.role === "admin";
    const isAdminByEmail = Boolean(adminEmail) && cleanEmail === adminEmail;
    const isAdmin = isAdminByRole || isAdminByEmail;

    // Verify the selected role for non-admin accounts.
    if (!isAdmin) {
      if (!["Student", "Faculty"].includes(requestedAccountType)) {
        return res.status(400).json({
          message: "Choose Student or Faculty login."
        });
      }

      const savedAccountType = user.accountType || "Student";
      const currentStatus = user.accountStatus || "Approved";

      if (savedAccountType !== requestedAccountType) {
        return res.status(403).json({
          message: `This account is registered as ${savedAccountType}, not ${requestedAccountType}.`
        });
      }

      // Only approved accounts may log in.
      if (currentStatus !== "Approved") {
        let message = "Your account is waiting for admin approval.";

        if (currentStatus === "Rejected") {
          message =
            "Your account request was rejected. Contact the campus admin.";
        } else if (currentStatus === "Disabled") {
          message = "This account is disabled. Contact the campus admin.";
        }

        return res.status(403).json({ message });
      }
    }

    loginGuard.clear(guardKey);

    const accountType = user.accountType || (isAdmin ? "Admin" : "Student");
    const tokenVersion = Number(user.tokenVersion || 0);

    const token = jwt.sign(
      {
        id: String(user._id),
        email: user.email,
        accountType,
        tokenVersion
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
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
      !cleanString(name) ||
      cleanString(name).length > MAX_NAME_LENGTH ||
      !isValidEmail(cleanString(email).toLowerCase()) ||
      !isStrongPassword(password)
    ) {
      return res.status(400).json({
        message:
          "Enter a name, valid email, and a strong password (10+ chars with upper, lower, and number)."
      });
    }

    if (!["Student", "Faculty"].includes(accountType)) {
      return res.status(400).json({
        message: "Account type must be Student or Faculty."
      });
    }

    const cleanName = cleanString(name);
    const cleanEmail = cleanString(email).toLowerCase();
    const cleanPhone = cleanString(phone);

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
      accountStatus,
      role: "user",
      tokenVersion: 0
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
    const { hasPagination, page, limit, skip } = parsePagination(
      req.query,
      50,
      200
    );
    const query = {
      email: { $ne: getAdminEmail() }
    };
    const baseQuery = User.find(query)
      .select("name email phone accountType accountStatus createdAt")
      .sort({ createdAt: -1 });
    const users = await (hasPagination
      ? baseQuery.skip(skip).limit(limit)
      : baseQuery
    ).lean();
    const payload = users.map((user) => ({
      ...user,
      accountType: user.accountType || "Student"
    }));

    if (!hasPagination) {
      return res.json(payload);
    }

    const total = await User.countDocuments(query);
    return res.json({ users: payload, page, limit, total });
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
      if (accountStatus === "Disabled") {
        user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      }
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
        !isStrongPassword(newPassword)
      ) {
        return res.status(400).json({
          message:
            "New password must be strong (10+ chars with upper, lower, and number)."
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
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
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
