class MemoryRateLimiter {
  constructor({ maxRequests = 300, windowMs = 15 * 60 * 1000 } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = new Map();
    this.lastSweep = 0;
  }

  sweep(now) {
    if (now - this.lastSweep < 60 * 1000) return;
    this.lastSweep = now;

    for (const [key, entry] of this.store.entries()) {
      if (!entry || now - entry.start >= this.windowMs) {
        this.store.delete(key);
      }
    }
  }

  middleware() {
    return (req, res, next) => {
      const now = Date.now();
      this.sweep(now);

      const key = `${req.ip || "unknown"}:${req.method}:${req.path}`;
      const existing = this.store.get(key);

      if (!existing || now - existing.start >= this.windowMs) {
        this.store.set(key, { count: 1, start: now });
        return next();
      }

      if (existing.count >= this.maxRequests) {
        return res.status(429).json({
          message: "Too many requests. Please try again in a few minutes."
        });
      }

      existing.count += 1;
      this.store.set(key, existing);
      return next();
    };
  }
}

function createRateLimit(options) {
  const limiter = new MemoryRateLimiter(options);
  return limiter.middleware();
}

module.exports = { createRateLimit };
