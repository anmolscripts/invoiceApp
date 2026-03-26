const path = require("path");
const { pathToFileURL } = require("url");
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");

const dbPath = path.join(__dirname, "..", "prisma", "invoice.db");

const adapter = new PrismaLibSql({
  url: pathToFileURL(dbPath).href,
});

const prisma = new PrismaClient({
  adapter,
});

module.exports = prisma;
