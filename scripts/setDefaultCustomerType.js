const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRaw`UPDATE "Customer" SET "customerType" = 'PREPAID' WHERE "customerType" IS NULL;`;
  console.log(`✅ Updated ${result} customers with customerType = 'PREPAID'`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
