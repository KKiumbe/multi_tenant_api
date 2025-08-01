
const { PrismaClient } = require('@prisma/client');

const winston = require('winston'); // For logging
const cron = require('node-cron');
const prisma = new PrismaClient();
const moment = require('moment-timezone'); // or dayjs
// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'invoices.log' }),
    new winston.transports.Console(),
  ],
});







// Generate a unique invoice number
function generateInvoiceNumber(customerId, tenantId, period) {
  const timestamp = Date.now();
  return `INV${customerId}-${tenantId}-${period.getFullYear()}${String(period.getMonth() + 1).padStart(2, '0')}-${timestamp}`;
}

async function generateInvoicesForAllTenants() {
  // Current date in EAT (Africa/Nairobi)




// Current date in EAT (Africa/Nairobi)
const now = moment.tz('Africa/Nairobi');

const currentMonth = new Date().getMonth(); // 0-based for Date

const year = now.year(); // 2025

 const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);


console.log(`Invoice period: ${invoicePeriod}`);






console.log(`Invoice period: ${invoicePeriod}`);

// Define periodStart and periodEnd for checking existing invoices
const periodStart = moment.tz(`${year}-${currentMonth}`, 'YYYY-M-DD', 'Africa/Nairobi')
  .startOf('day')
  .toDate();

const periodEnd = moment.tz(`${year}-${currentMonth}`, 'YYYY-M-DD', 'Africa/Nairobi')
  .startOf('day')
  .add(1, 'month')
  .toDate();

console.log(`Billing period: ${periodStart} to ${periodEnd}`);
  const BATCH_SIZE = 100; // Process customers in batches

  //(`Starting invoice generation for ${currentMonth + 1}/${year} at ${now.toISOString()}`);

  try {
    console.time('Find Tenants');
    // Fetch all tenants
    const tenants = await prisma.tenant.findMany({
      select: { id: true },
    });
    console.timeEnd('Find Tenants');
    //logger.info(`Found ${tenants.length} tenants.`);

    const results = {
      totalInvoices: 0,
      tenantsProcessed: 0,
      errors: [],
    };

    for (const tenant of tenants) {
      try {
        console.time(`Process Tenant ${tenant.id}`);
        //logger.info(`Processing tenant ${tenant.id}`);

        // Fetch active customers for the tenant in batches
        let skip = 0;
        let customersBatch;
        let tenantInvoices = 0;

        do {
          customersBatch = await prisma.customer.findMany({
            where: {
              status: 'ACTIVE',
              tenantId: tenant.id,
            },
            take: BATCH_SIZE,
            skip,
          });

          if (customersBatch.length > 0) {
           // logger.info(`Processing ${customersBatch.length} customers for tenant ${tenant.id}`);

            // Check for existing invoices to avoid duplicates
            const existingInvoices = await prisma.invoice.findMany({
              where: {
                tenantId: tenant.id,
                invoicePeriod: {
                  gte: periodStart,
                  lt: periodEnd,
                },
                customerId: { in: customersBatch.map((c) => c.id) },
              },
              select: { customerId: true },
            });
            const existingCustomerIds = new Set(existingInvoices.map((i) => i.customerId));

            // Filter out customers with existing invoices
            const customersToProcess = customersBatch.filter((c) => !existingCustomerIds.has(c.id));

            if (customersToProcess.length > 0) {
              const batchInvoices = await processCustomerBatchForAll(customersToProcess, invoicePeriod);
              tenantInvoices += batchInvoices.length;
            } else {
              //logger.info(`No new customers to process for tenant ${tenant.id} (all have invoices for ${currentMonth + 1}/${year}).`);
            }
          }

          skip += BATCH_SIZE;
        } while (customersBatch.length === BATCH_SIZE);

        results.totalInvoices += tenantInvoices;
        results.tenantsProcessed += 1;
        console.timeEnd(`Process Tenant ${tenant.id}`);
        logger.info(`Generated ${tenantInvoices} invoices for tenant ${tenant.id}`);
      } catch (error) {
        logger.error(`Error processing tenant ${tenant.id}: ${error.message}`, { stack: error.stack });
        results.errors.push({ tenantId: tenant.id, error: error.message });
      }
    }

    if (results.errors.length > 0) {
      logger.warn(`Completed with partial success: ${results.totalInvoices} invoices generated, ${results.tenantsProcessed}/${tenants.length} tenants processed`, {
        errors: results.errors,
      });
    } else {
      logger.info(`Successfully generated ${results.totalInvoices} invoices across ${results.tenantsProcessed} tenants`);
    }

    return results;
  } catch (error) {
    logger.error(`Fatal error generating invoices: ${error.message}`, { stack: error.stack });
    throw error; // Allow scheduler to handle retries or alerts
  }
}





async function processCustomerBatchForAll(customers, invoicePeriod) {
  const invoices = [];
  const invoiceItems = [];
  const customerUpdates = [];
  //const invoicePeriod = new Date(year, currentMonth - 1, 1);

  for (const customer of customers) {
    // Validate required fields
    if (customer.monthlyCharge == null || customer.closingBalance == null) {
      logger.warn(`Skipping customer ${customer.id}: Invalid monthlyCharge or closingBalance`, {
        customerId: customer.id,
        tenantId: customer.tenantId,
      });
      continue;
    }

    const invoiceNumber = generateInvoiceNumber(customer.id, customer.tenantId, invoicePeriod);
    const invoiceAmount = customer.monthlyCharge;
    const previousClosingBalance = customer.closingBalance;

    let status = 'UNPAID';
    let amountPaid = 0;
    let newClosingBalance = previousClosingBalance + invoiceAmount;

    if (previousClosingBalance < 0) {
      const availableCredit = Math.abs(previousClosingBalance);
      if (availableCredit >= invoiceAmount) {
        status = 'PAID';
        amountPaid = invoiceAmount;
        newClosingBalance = previousClosingBalance + invoiceAmount;
      } else {
        status = 'PPAID';
        amountPaid = availableCredit;
        newClosingBalance = previousClosingBalance + invoiceAmount;
      }
    }

    const invoice = {
      tenantId: customer.tenantId,
      customerId: customer.id,
      invoicePeriod,
      invoiceNumber,
      invoiceAmount,
      closingBalance: newClosingBalance,
      status,
      isSystemGenerated: true,
      createdAt: new Date(),
      amountPaid,
    };

    invoices.push(invoice);

    const invoiceItem = {
      description: `Monthly charge for ${invoicePeriod.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
      amount: invoiceAmount,
      quantity: 1,
    };

    invoiceItems.push({ ...invoiceItem, invoiceNumber }); // Temporarily store invoiceNumber for mapping

    customerUpdates.push({
      where: { id: customer.id },
      data: { closingBalance: newClosingBalance },
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Bulk create invoices
      await tx.invoice.createMany({
        data: invoices,
        skipDuplicates: true,
      });

      // Fetch created invoices to get their IDs
      const fetchedInvoices = await tx.invoice.findMany({
        where: { invoiceNumber: { in: invoices.map((i) => i.invoiceNumber) } },
        select: { id: true, invoiceNumber: true },
      });

      // Map invoice items to their corresponding invoice IDs
      const updatedInvoiceItems = invoiceItems.map((item) => ({
        description: item.description,
        amount: item.amount,
        quantity: item.quantity,
        invoiceId: fetchedInvoices.find((i) => i.invoiceNumber === item.invoiceNumber)?.id,
      }));

      // Filter out any items where invoiceId is undefined
      const validInvoiceItems = updatedInvoiceItems.filter((item) => item.invoiceId);

      // Step 2: Bulk create invoice items
      if (validInvoiceItems.length > 0) {
        await tx.invoiceItem.createMany({
          data: validInvoiceItems,
        });
      }

      // Step 3: Bulk update customer balances
      await Promise.all(customerUpdates.map((update) => tx.customer.update(update)));

      return fetchedInvoices;
    }, { timeout: 30000 }); // 30-second timeout for larger datasets

    return result;
  } catch (error) {
    logger.error(`Error in transaction: ${error.message}`, { stack: error.stack });
    throw error;
  }
}





module.exports = { generateInvoicesForAllTenants };