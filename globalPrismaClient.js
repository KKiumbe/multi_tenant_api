// prismaClient.js
const { PrismaClient, Prisma } = require('@prisma/client');

let prisma;

if (!global.prisma) {
  global.prisma = new PrismaClient();
}

prisma = global.prisma;

// Export both the singleton client and enums
module.exports = {
  prisma,
  CustomerType: Prisma.CustomerType,
  TenantStatus: Prisma.TenantStatus
  
};
