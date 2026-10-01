const db = require('../src/db');

const command = process.argv[2];
const identifier = process.argv[3];

if (command === 'show') {
  // show what is stored. only the first 20 characters of the hash are printed
  console.table(
    db.prepare(
      'SELECT id, identifier, substr(otp_hash, 1, 20) AS hash_start, used, attempts, created_at, expires_at FROM otps'
    ).all()
  );
  console.table(db.prepare('SELECT * FROM send_log').all());
} else if (command === 'expire') {
  // make the newest OTP of this identifier expired
  db.prepare(
    'UPDATE otps SET expires_at = ? WHERE id = (SELECT MAX(id) FROM otps WHERE identifier = ?)'
  ).run(Date.now() - 1000, identifier);
  console.log('Newest OTP for ' + identifier + ' is now expired');
} else if (command === 'age-sends') {
  // move this identifier's send requests 11 minutes into the past
  db.prepare('UPDATE send_log SET sent_at = sent_at - ? WHERE identifier = ?').run(
    11 * 60 * 1000,
    identifier
  );
  console.log('Send requests for ' + identifier + ' are now 11 minutes old');
} else {
  console.log('Use: show | expire <identifier> | age-sends <identifier>');
}