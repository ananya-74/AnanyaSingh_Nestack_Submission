# Abuse-Resistant OTP System

This is my submission for the Nestack backend assessment. It is a small OTP login API: you give it an email or phone number, it creates a 6-digit code, and you send that code back to get a session token.

Most of the work went into making it hard to abuse. It protects against three things: someone guessing the code, someone spamming the send endpoint, and someone reusing a code that was already used.

**Live deployment:** https://YOUR-DEPLOYMENT-URL-HERE

**Credentials:** none needed. There are no accounts or passwords. Any email or phone string works as an identifier, and the OTP is printed in the server console.

## What it does

- `POST /auth/send` creates a 6-digit OTP and saves only its hash
- `POST /auth/verify` checks the code and returns a random session token
- An OTP expires 10 minutes after it is created
- An OTP is locked after 5 wrong attempts
- Max 3 send requests per identifier in 10 minutes
- A used OTP cannot be verified again
- Both limits are tracked per identifier, not per IP
- No authentication library, all the logic is in this repo

## Tech stack

- Node.js
- Express (only for routing and reading JSON)
- SQLite, using `better-sqlite3`
- Node's built-in `crypto` module

## Project structure

```
.
├── src/
│   ├── server.js        starts the Express app
│   ├── db.js            opens SQLite and creates the tables
│   ├── otp.js           OTP, salt, hash and session token functions
│   └── routes/
│       └── auth.js      /auth/send and /auth/verify
├── tests/
│   ├── check-db.js      checks that the tables get created
│   ├── check-otp.js     checks the OTP functions
│   └── db-tools.js      helper for testing expiry and the send window
├── data/                created when the app runs, holds otp.db (not committed)
├── .gitignore
├── package.json
└── README.md
```

## Setup

You need Node.js 18 or newer.

```bash
npm install
```

## How to run

```bash
npm start
```

The server runs on port 3000 (or the `PORT` environment variable if it is set). The database file `data/otp.db` is created automatically the first time it starts.

### About the OTP in the console

There is no real SMS or email service in this project. When an OTP is created, it is printed in the server console instead:

```
[DEV] OTP for user@example.com: 482913
```

This is only for development and testing. In a real system this line would be replaced by a call to an SMS or email provider, and the code would never be logged.

## API

### POST /auth/send

Request:

```json
{ "identifier": "user@example.com" }
```

| Status | Meaning |
|---|---|
| 200 | OTP created |
| 400 | identifier missing or empty |
| 429 | too many send requests |

Success:

```json
{ "message": "OTP sent to user@example.com" }
```

Rate limited:

```json
{ "message": "Too many OTP requests. Please try again later." }
```

### POST /auth/verify

Request:

```json
{ "identifier": "user@example.com", "code": "123456" }
```

| Status | Meaning |
|---|---|
| 200 | verified, session token returned |
| 400 | wrong, expired, already used or unknown code (also missing fields) |
| 429 | too many wrong attempts, the OTP is locked |

Success:

```json
{ "message": "Verified", "session_token": "<64 character random hex string>" }
```

Wrong code:

```json
{ "message": "Invalid or expired code", "attempts_remaining": 3 }
```

Locked (the 5th wrong attempt, and anything after it):

```json
{ "message": "Too many incorrect attempts. This code is locked, please request a new one." }
```

Every response has a `message` field.

## How to test

Start the server with `npm start`, then open a second terminal.

On Windows PowerShell:

```powershell
# send a code, then read it from the server console
'{"identifier":"user@example.com"}' | curl.exe -i -X POST http://localhost:3000/auth/send -H "Content-Type: application/json" -d "@-"

# verify (replace 123456 with the code from the console)
'{"identifier":"user@example.com","code":"123456"}' | curl.exe -i -X POST http://localhost:3000/auth/verify -H "Content-Type: application/json" -d "@-"
```

On macOS or Linux:

```bash
curl -i -X POST http://localhost:3000/auth/send -H "Content-Type: application/json" -d '{"identifier":"user@example.com"}'
curl -i -X POST http://localhost:3000/auth/verify -H "Content-Type: application/json" -d '{"identifier":"user@example.com","code":"123456"}'
```

Things worth trying:

1. Send, then verify with the right code. You get 200 and a session token.
2. Verify the same code again. You get 400, because the code was already used.
3. Send, then verify with a wrong code 5 times. The first 4 give 400 with `attempts_remaining`, the 5th gives 429. After that even the correct code gives 429.
4. Send 4 times for the same identifier. The 4th gives 429.
5. Try a different identifier while the first is blocked. It works, because limits are separate per identifier.

Waiting 10 minutes to test expiry is slow, so there is a small helper script:

```bash
node tests/db-tools.js show                        # print the stored rows (only the start of each hash)
node tests/db-tools.js expire user@example.com     # make the newest OTP expired
node tests/db-tools.js age-sends user@example.com  # move send requests 11 minutes back
```

## How the security parts work

### Random number function (CSPRNG)

The OTP is made with `crypto.randomInt(0, 1000000)` from Node's built-in `crypto` module, then padded with zeros to 6 digits. It uses the operating system's secure random source, so the next code can't be predicted from earlier ones. It also picks evenly across the range. I do not use `Math.random()` anywhere. The salt and the session token are made with `crypto.randomBytes`.

### Hashing

I hash the OTP with SHA-256 over `salt + code`, using Node's `crypto`. Each OTP gets its own random 16-byte salt. The database stores the hash and the salt, never the code. Hashes are compared with `crypto.timingSafeEqual`.

I chose SHA-256 over bcrypt because it needs no extra package and both are allowed. bcrypt wouldn't give much extra protection here anyway. A 6-digit code only has 1,000,000 possible values, so anyone holding the hash can try all of them, with either algorithm. What really protects the code is the attempt limit, the 10-minute expiry and the single use. There is more on this in the leak section below.

### Expiry

Each OTP row has an `expires_at` value, which is `created_at` plus 10 minutes. On every verify request the server checks the time against `expires_at` first. If it has passed, the request gets a 400.

### Brute-force protection

Each OTP row has an `attempts` counter. Every wrong code adds 1 and saves it. The 5th wrong attempt returns 429 and the OTP is locked. Before the server compares any code, it checks `attempts >= 5`, so after the lock even the correct code is refused. This is tracked per identifier (each identifier has its own OTP row), not per IP.

### Send rate limit

Every successful send is saved in a `send_log` table with the identifier and the time. On a new send request, I count that identifier's rows from the last 10 minutes. If there are already 3, the server returns 429. It is a sliding window, so once a send is older than 10 minutes it stops counting and the identifier can send again. Blocked requests are not saved. This limit is separate from the 5-attempt limit, and it is also per identifier, not per IP.

### Invalidating codes

- When the correct code is verified, `used` is set to 1 right away. The same code can't be used a second time, even inside the 10 minutes.
- When a new code is requested, older unused codes for that identifier are marked as used. Only the newest code works.
- Expired codes are rejected on every verify.
- Wrong, expired, used and unknown codes all give the same message, so an attacker can't tell which one it was.

### Session token

After a successful verify the server returns a random 64-character hex string made with `crypto.randomBytes(32)`. It is just random data with no readable information inside, which is what the assignment asks for (a full JWT is not required). This project does not store or check session tokens, because there is no endpoint in the assignment that uses them.

## If the OTP table were leaked

**What an attacker would get:**

- The emails and phone numbers that asked for codes
- When each code was created and when it expires
- Whether each code was used, and how many wrong attempts were made
- The salt and the hash of each code

**What they would not get directly:**

- The plain OTP, because I never store it
- Session tokens, because I don't store those either

**The honest part:** hashing does not make a 6-digit code safe. There are only 1,000,000 possible codes and SHA-256 is very fast, so someone with the hash and salt can try every code on their own machine and find the right one in a very short time. The salt only stops one precomputed table from working on every row, it does not stop this. A slow hash like bcrypt would make it more expensive, but it would not fix the problem.

What really limits the damage is time and single use. A code only works for 10 minutes and only once. Codes that are already used or expired are useless to an attacker. But a code that is still unused and unexpired at the moment of the leak could be cracked and used. So hashing helps against casual exposure (a backup, a log, a developer looking at the table), but not against someone with a fresh copy of the live table.

## Other things to know

- **Guess budget:** every new send creates a new OTP with 5 fresh attempts. With 3 sends per 10 minutes, one identifier can be guessed against at most 15 times per 10 minutes, out of 1,000,000 possible codes.
- **Lockout abuse:** limits are per identifier, not per IP, so someone who knows another person's email could use up that email's send limit. That is the tradeoff of the design in the assignment.
- **Identifiers:** they are trimmed and lowercased, so `A@x.com` and `a@x.com` share the same limits.
- **Race conditions:** `better-sqlite3` is synchronous and this runs as one Node process, so two verify requests can't mix up the attempt counter. If this ran on several servers at once, those updates would need to be made atomic in SQL.
- **Missing fields:** an empty or missing `identifier` or `code` returns 400. The assignment doesn't say what to do here, so this was my choice.
- **HTTPS:** the app does not handle HTTPS itself. The hosting platform provides it when deployed.

## Deployment

I deployed this as a web service on Render. The steps:

1. Push the code to GitHub
2. In Render, create a new **Web Service** and connect the repository
3. Build command: `npm install`
4. Start command: `npm start`
5. No environment variables are needed (the platform sets `PORT`)
6. Once it is live, call `POST /auth/send` on the live URL

**About SQLite on hosting:** many free plans have a temporary filesystem, so `data/otp.db` can be wiped when the service restarts or redeploys. That is fine here because OTPs only live for 10 minutes. A real production system would use a persistent database.

**OTPs on the live service:** the code is only printed in the service logs, as explained in the console section above.

**Live URL:** https://ananya-otp-system.onrender.com