const express = require('express');
const db = require('../db');
const {
  generateOtp,
  generateSalt,
  hashOtp,
  hashesMatch,
  generateSessionToken,
} = require('../otp');

const router = express.Router();

const OTP_LIFETIME_MS = 10 * 60 * 1000; // an OTP is valid for 10 minutes
const SEND_WINDOW_MS = 10 * 60 * 1000;  // send limit window: 10 minutes
const MAX_SENDS = 3;                    // max 3 sends per identifier in the window
const MAX_ATTEMPTS = 5;                 // max 5 wrong guesses per OTP

router.post('/send', (req, res) => {
  const body = req.body || {};

  if (typeof body.identifier !== 'string' || body.identifier.trim() === '') {
    return res.status(400).json({ message: 'identifier is required' });
  }

  const identifier = body.identifier.trim().toLowerCase();
  const now = Date.now();

  // send rate limit: how many codes did this identifier request in the last 10 minutes?
  const recent = db
    .prepare('SELECT COUNT(*) AS count FROM send_log WHERE identifier = ? AND sent_at > ?')
    .get(identifier, now - SEND_WINDOW_MS);

  if (recent.count >= MAX_SENDS) {
    return res.status(429).json({ message: 'Too many OTP requests. Please try again later.' });
  }

  // make the code and keep only its hash
  const code = generateOtp();
  const salt = generateSalt();
  const otpHash = hashOtp(code, salt);

  // record this send request
  db.prepare('INSERT INTO send_log (identifier, sent_at) VALUES (?, ?)').run(identifier, now);

  // a new code replaces any older unused code for this identifier
  db.prepare('UPDATE otps SET used = 1 WHERE identifier = ? AND used = 0').run(identifier);

  db.prepare(
    'INSERT INTO otps (identifier, otp_hash, salt, created_at, expires_at, used, attempts) VALUES (?, ?, ?, ?, ?, 0, 0)'
  ).run(identifier, otpHash, salt, now, now + OTP_LIFETIME_MS);

  // no real SMS or email in this project, so the code is printed here (development only)
  console.log(`[DEV] OTP for ${identifier}: ${code}`);

  res.status(200).json({ message: `OTP sent to ${identifier}` });
});

router.post('/verify', (req, res) => {
  const body = req.body || {};

  if (
    typeof body.identifier !== 'string' || body.identifier.trim() === '' ||
    typeof body.code !== 'string' || body.code.trim() === ''
  ) {
    return res.status(400).json({ message: 'identifier and code are required' });
  }

  const identifier = body.identifier.trim().toLowerCase();
  const code = body.code.trim();
  const now = Date.now();

  // only the newest OTP for this identifier can be used
  const otp = db
    .prepare('SELECT * FROM otps WHERE identifier = ? ORDER BY id DESC LIMIT 1')
    .get(identifier);

  // 1. no OTP exists for this identifier
  if (!otp) {
    return res.status(400).json({ message: 'Invalid or expired code' });
  }

  // 2. expired (this runs on every verify attempt)
  if (now > otp.expires_at) {
    return res.status(400).json({ message: 'Invalid or expired code' });
  }

  // 3. already used
  if (otp.used === 1) {
    return res.status(400).json({ message: 'Invalid or expired code' });
  }

  // 4. already had 5 wrong attempts, so this OTP is locked
  if (otp.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({
      message: 'Too many incorrect attempts. This code is locked, please request a new one.',
    });
  }

  // 5. hash what the user typed and compare it with the stored hash
  const submittedHash = hashOtp(code, otp.salt);

  if (!hashesMatch(submittedHash, otp.otp_hash)) {
    const attempts = otp.attempts + 1;
    db.prepare('UPDATE otps SET attempts = ? WHERE id = ?').run(attempts, otp.id);

    // this was the 5th wrong attempt, the OTP is now locked
    if (attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        message: 'Too many incorrect attempts. This code is locked, please request a new one.',
      });
    }

    return res.status(400).json({
      message: 'Invalid or expired code',
      attempts_remaining: MAX_ATTEMPTS - attempts,
    });
  }

  // 6. correct code: mark it used straight away so it cannot work twice
  db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otp.id);

  res.status(200).json({
    message: 'Verified',
    session_token: generateSessionToken(),
  });
});

module.exports = router;