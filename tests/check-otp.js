const {
  generateOtp,
  generateSalt,
  hashOtp,
  hashesMatch,
  generateSessionToken,
} = require('../src/otp');

const code = generateOtp();
const salt = generateSalt();
const hash = hashOtp(code, salt);

console.log('otp:', code);
console.log('salt:', salt);
console.log('hash:', hash);

// the same code should match, a different code should not
const wrongCode = code === '123456' ? '654321' : '123456';
console.log('correct code matches:', hashesMatch(hashOtp(code, salt), hash));
console.log('wrong code matches:', hashesMatch(hashOtp(wrongCode, salt), hash));

// generate 1000 otps and check they are all exactly 6 digits
let allSixDigits = true;
for (let i = 0; i < 1000; i++) {
  if (!/^\d{6}$/.test(generateOtp())) {
    allSixDigits = false;
  }
}
console.log('1000 otps all 6 digits:', allSixDigits);

console.log('session token:', generateSessionToken());