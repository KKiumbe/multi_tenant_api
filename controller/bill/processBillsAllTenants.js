



const {prisma} = require('../../cron-jobs/cronPrismaClient.js');

const { processCustomerBatchForAll } = require('./billGenerator.js');
// Configure logger






const BATCH_SIZE = 100;

async function generateInvoicesForAllTenants() {
  const currentMonth = new Date().getMonth() + 1;
  let totalInvoices = 0;

  console.log(`🚀 Starting invoice generation for all tenants - ${new Date().toISOString()}`);

  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    try {
      console.time(`Tenant ${tenant.id}`);
      let skip = 0;
      let customersBatch;

      do {
        customersBatch = await prisma.customer.findMany({
          where: { status: 'ACTIVE', tenantId: tenant.id },
          take: BATCH_SIZE,
          skip,
          select: {
            id: true,
            tenantId: true,
            monthlyCharge: true,
            closingBalance: true,
          },
        });

        if (customersBatch.length > 0) {
          const batchInvoices = await processCustomerBatchForAll(customersBatch, currentMonth);
          totalInvoices += batchInvoices.length;
          console.log(`   ➡️ Processed batch of ${customersBatch.length} customers for tenant ${tenant.id}`);
        }

        skip += BATCH_SIZE;
      } while (customersBatch.length === BATCH_SIZE);

      console.timeEnd(`Tenant ${tenant.id}`);
    } catch (tenantError) {
      console.error(`❌ Error processing tenant ${tenant.id}:`, tenantError);
    }
  }

  console.log(`✅ Invoice generation finished. Total invoices created: ${totalInvoices}`);
}












module.exports = { generateInvoicesForAllTenants };