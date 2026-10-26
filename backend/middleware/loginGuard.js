class LoginGuard {
  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.store = new Map();
    this.lastSweep = 0;
  }

  getKey(key) {
    return String(key || "");
  }

  isBlocked(key) {
    this.sweepExpired();
    const normalizedKey = this.getKey(key);
    const entry = this.store.get(normalizedKey);
    const now = Date.now();

    if (!entry) return false;

    if (now - entry.start > this.windowMs) {
      this.store.delete(normalizedKey);
      return false;
    }

    return entry.attempts >= this.maxAttempts;
  }

  recordFailure(key) {
    this.sweepExpired();
    const normalizedKey = this.getKey(key);
    const now = Date.now();
    const existing = this.store.get(normalizedKey);

    if (!existing) {
      this.store.set(normalizedKey, { attempts: 1, start: now });
      return;
    }

    if (now - existing.start > this.windowMs) {
      this.store.set(normalizedKey, { attempts: 1, start: now });
      return;
    }

    this.store.set(normalizedKey, {
      attempts: existing.attempts + 1,
      start: existing.start
    });
  }

  clear(key) {
    this.store.delete(this.getKey(key));
  }

  sweepExpired() {
    const now = Date.now();

    // Avoid scanning on every call while still keeping the map bounded.
    if (now - this.lastSweep < 60 * 1000) {
      return;
    }

    this.lastSweep = now;

    for (const [key, entry] of this.store.entries()) {
      if (!entry || now - entry.start > this.windowMs) {
        this.store.delete(key);
      }
    }
  }
}

module.exports = new LoginGuard();
