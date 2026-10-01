const db = require('../src/db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
console.log(tables);