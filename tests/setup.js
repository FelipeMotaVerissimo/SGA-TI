const { PrismaClient } = require('@prisma/client');

module.exports = async function() {
  const prisma = new PrismaClient();
  await prisma.$disconnect();
};