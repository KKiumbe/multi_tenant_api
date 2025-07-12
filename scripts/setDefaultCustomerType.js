// scripts/setDefaultCustomerType.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.customer.updateMany({
    where: {
      customerType: null,
    },
    data: {
      customerType: 'PREPAID',
    },
  });

  console.log(`Updated ${updated.count} customer records with default customerType.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
