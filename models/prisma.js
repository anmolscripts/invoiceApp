const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");

const sourceDbPath = path.join(__dirname, "..", "prisma", "invoice.db");
const writableDbPath = path.join(__dirname, "..", "prisma", "invoice-local.db");

if (!fs.existsSync(writableDbPath) && fs.existsSync(sourceDbPath)) {
  fs.copyFileSync(sourceDbPath, writableDbPath);
}

const adapter = new PrismaLibSql({
  url: pathToFileURL(writableDbPath).href,
});

const prisma = new PrismaClient({
  adapter,
});

module.exports = prisma;
