const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const sourceDbPath = path.join(__dirname, "..", "prisma", "invoice.db");
const writableDbPath = path.join(__dirname, "..", "prisma", "invoice-local.db");

if (!fs.existsSync(writableDbPath) && fs.existsSync(sourceDbPath)) {
  fs.copyFileSync(sourceDbPath, writableDbPath);
}

const db = new sqlite3.Database(writableDbPath, (err) => {
  if (err) console.error(err.message);
  else console.log("Connected to SQLite DB");
});

db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL
  )
`);

module.exports = db;
