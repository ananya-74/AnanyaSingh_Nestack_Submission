const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// keep the sqlite file inside a data/ folder
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const db = new Database(path.join(dataDir, 'otp.db'));

// one row per OTP. we only store the hash, never the code itself
db.exec(`
  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0
  )
`);

// one row per send request, used for the 3 sends per 10 minutes limit
db.exec(`
  CREATE TABLE IF NOT EXISTS send_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    sent_at INTEGER NOT NULL
  )
`);

module.exports = db;