const jwt = require("jsonwebtoken");
const User = require("../model/User");

function getAdminEmail() {
  return String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

function accountStatusMessage(status) {
  if (status === "Rejected") {
    return "Your account request was rejected. Contact the campus admin.";
  }

  if (status === "Disabled") {
    return "This account is disabled. Contact the campus admin.";
  }

  return "Your account is waiting for admin approval.";
}

async function authenticateUser(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select("name email phone accountType accountStatus role tokenVersion")
      .lean();

    if (!user) {
      return res.status(401).json({ message: "User no longer exists." });
    }

    const adminEmail = getAdminEmail();
    const userEmail = String(user.email || "").trim().toLowerCase();
    const isAdminByRole = user.role === "admin";
    const isAdminByEmail = Boolean(adminEmail) && userEmail === adminEmail;
    const isAdmin = isAdminByRole || isAdminByEmail;

    if (!isAdmin && user.accountStatus !== "Approved") {
      return res.status(403).json({
        message: accountStatusMessage(user.accountStatus)
      });
    }

    const tokenVersion = Number(user.tokenVersion || 0);
    if (Number(decoded.tokenVersion || 0) !== tokenVersion) {
      return res.status(401).json({
        message: "Session revoked. Please log in again."
      });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      accountType: user.accountType || (isAdmin ? "Admin" : "Student"),
      accountStatus: user.accountStatus || "Approved",
      role: isAdmin ? "admin" : "user",
      isAdmin,
      tokenVersion
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function authenticateAdmin(req, res, next) {
  return authenticateUser(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required." });
    }

    return next();
  });
}

module.exports = {
  getAdminEmail,
  authenticateUser,
  authenticateAdmin
};
