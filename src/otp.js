const crypto = require('crypto');

// Makes a 6 digit OTP using crypto.randomInt, which is a secure random source.
// padStart keeps leading zeros, so 42 becomes "000042".
function generateOtp() {
  const number = crypto.randomInt(0, 1000000);
  return String(number).padStart(6, '0');
}

// Random salt, a new one for every OTP
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// SHA-256 hash of salt + code
function hashOtp(code, salt) {
  return crypto.createHash('sha256').update(salt + code).digest('hex');
}

// Compares two hashes without leaking timing information
function hashesMatch(hashA, hashB) {
  const a = Buffer.from(hashA, 'hex');
  const b = Buffer.from(hashB, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Random opaque session token (64 hex characters)
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateOtp,
  generateSalt,
  hashOtp,
  hashesMatch,
  generateSessionToken,
};