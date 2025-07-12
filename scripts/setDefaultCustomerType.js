const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.customer.updateMany({
    where: {
      customerType: {
        equals: null,
      },
    },
    data: {
      customerType: 'PREPAID',
    },
  });

  console.log(`✅ Updated ${updated.count} customers to customerType PREPAID.`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
