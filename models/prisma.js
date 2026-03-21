const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

const adapter = new PrismaLibSql({
    url: "file:./prisma/invoice.db"
});

const prisma = new PrismaClient({
    adapter
});

module.exports = prisma;