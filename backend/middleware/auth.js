const jwt = require("jsonwebtoken");

function getAdminEmail() {
  return String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

function authenticateUser(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function authenticateAdmin(req, res, next) {
  return authenticateUser(req, res, () => {
    const adminEmail = getAdminEmail();
    const userEmail = String(req.user?.email || "").trim().toLowerCase();
    const isAdmin =
      Boolean(req.user?.isAdmin) ||
      req.user?.accountType === "Admin" ||
      (adminEmail && userEmail === adminEmail);

    if (!isAdmin) {
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
