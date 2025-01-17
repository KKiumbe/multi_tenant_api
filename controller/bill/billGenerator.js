const { PrismaClient } = require('@prisma/client');
//const { GarbageCollectionDay } = require('./enum.js'); // Adjust the path if needed

const schedule = require('node-schedule'); // For scheduling jobs
const invoiceQueue = require('./jobFunction.js');
const prisma = new PrismaClient();

// Function to generate a unique invoice number
function generateInvoiceNumber(customerId) {
  const invoiceSuffix = Math.floor(Math.random() * 1000000).toString().padStart(3, '0');
  return `INV${invoiceSuffix}-${customerId}`;
}

// Fetch the customer's current closing balance
async function getCurrentClosingBalance(customerId) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error(`Customer with ID ${customerId} not found.`);
    return customer.closingBalance;
  } catch (error) {
    console.error('Error fetching closing balance:', error);
    throw error;
  }
}

// Get the current month's bill (monthly charge)
async function getCurrentMonthBill(customerId) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    return customer ? customer.monthlyCharge : 0;
  } catch (error) {
    console.error('Error fetching current month bill:', error);
    throw error;
  }
}





// Generate invoices for active customers atomically
async function generateInvoices(req,res) {

  const tenantId = req.user?.tenantId; // Extract tenantId from the authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required' });
  }

  const currentMonth = new Date().getMonth() + 1;

  const transaction = await prisma.$transaction(async (prisma) => {
    try {
      const customers = await prisma.customer.findMany({ where:   {  tenantId, status: 'ACTIVE' } });
      console.log(`Found ${customers.length} active customers.`);

      const invoices = await Promise.all(
        customers.map(async (customer) => {
          const invoiceNumber = generateInvoiceNumber(customer.id);
          const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
          const currentClosingBalance = await getCurrentClosingBalance(customer.id);
          const currentMonthBill = await getCurrentMonthBill(customer.id);
          const invoiceAmount = currentMonthBill;

          // Determine the status of the invoice based on the current closing balance
          let status = 'UNPAID'; // Default status

          const newClosingBalance = currentClosingBalance + invoiceAmount;

          if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
            // Scenario: PAID - Invoice is fully paid due to overpayment or negative balance
            status = 'PAID';
          } else if (newClosingBalance === 0) {
            // Scenario: PAID - Invoice is fully paid (no remaining balance)
            status = 'PAID';
          } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
            // Scenario: PPAID (Partially Paid) - Customer has made a partial payment
            status = 'PPAID';
          } else {
            // Scenario: UNPAID - Customer still owes money
            status = 'UNPAID';
          }

          // Create the new invoice
          const newInvoice = await prisma.invoice.create({
            data: {
              customerId: customer.id,
              tenantId,
              invoiceNumber,
              invoicePeriod,
              closingBalance: newClosingBalance, // Update closing balance
              invoiceAmount,
              status, // Set status based on the determined condition
              isSystemGenerated: true,
            },
          });

          // Create invoice item only if invoice amount is greater than zero
          if (invoiceAmount > 0) {
            await prisma.invoiceItem.create({
              data: {
                invoiceId: newInvoice.id,
                description: 'Monthly Charge',
                amount: invoiceAmount,
                quantity: 1,
              },
            });
          }

          // Update the customer’s closing balance
          await prisma.customer.update({
            where: { id: customer.id },
            data: { closingBalance: newClosingBalance },
          });

          return newInvoice;
        })
      );

      console.log(`Generated ${invoices.length} invoices.`);
      return invoices;
    } catch (error) {
      console.error('Error generating invoices:', error);
      throw new Error('Transaction failed');
    }
  });

  return transaction;
}





// Controller function to handle invoice generation based on collection day
const generateInvoicesByDay = async (req, res) => {
  const { collectionDay } = req.body;



  try {
    // Call helper function to generate invoices
    const invoices = await generateInvoicesForDay(collectionDay);
    res.status(200).json({ message: "Invoices generated successfully", invoices });
  } catch (error) {
    console.error("Error generating invoices:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Helper function to generate invoices for a specific collection day
const generateInvoicesForDay = async (day) => {
  const currentMonth = new Date().getMonth() + 1;


    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        garbageCollectionDay:day
      }
    });

    const invoices = await Promise.all(
      customers.map(async (customer) => {
        const invoiceNumber = generateInvoiceNumber(customer.id);
        const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
        const currentClosingBalance = await getCurrentClosingBalance(customer.id);
        const currentMonthBill = await getCurrentMonthBill(customer.id);
        const invoiceAmount = currentMonthBill;

        let status = 'UNPAID';
        const newClosingBalance = currentClosingBalance + invoiceAmount;

        if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          status = 'PAID';
        } else if (newClosingBalance === 0) {
          status = 'PAID';
        } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
          status = 'PPAID';
        } else {
          status = 'UNPAID';
        }

        const newInvoice = await prisma.invoice.create({
          data: {
            customerId: customer.id,
            invoiceNumber,
            invoicePeriod,
            closingBalance: newClosingBalance,
            invoiceAmount,
            status,
            isSystemGenerated: true,
          },
        });

        if (invoiceAmount > 0) {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: newInvoice.id,
              description: 'Monthly Charge',
              amount: invoiceAmount,
              quantity: 1,
            },
          });
        }

        await prisma.customer.update({
          where: { id: customer.id },
          data: { closingBalance: newClosingBalance },
        });

        return newInvoice;
      })
    );

 
};












// Create a manual invoice for a customer

async function createInvoice(req, res) {
  const { customerId, invoiceItemsData } = req.body;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID is required' });
  }

  if (!customerId || !Array.isArray(invoiceItemsData) || invoiceItemsData.length === 0) {
    return res.status(400).json({ error: 'Customer ID and invoice items are required' });
  }

  const invalidItems = invoiceItemsData.filter(
    item => !item.description || !item.amount || !item.quantity || item.amount <= 0 || item.quantity <= 0
  );

  if (invalidItems.length > 0) {
    return res.status(400).json({ error: 'Invalid invoice items', invalidItems });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or does not belong to this tenant' });
    }

    const invoicePeriod = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const currentClosingBalance = (await getCurrentClosingBalance(customer.id)) || 0;
    const invoiceAmount = Math.round(
      invoiceItemsData.reduce((total, item) => total + item.amount * item.quantity, 0) * 100
    ) / 100;

    if (invoiceAmount <= 0) {
      return res.status(400).json({ error: 'Invalid invoice amount' });
    }

    const newClosingBalance = currentClosingBalance + invoiceAmount;
    const invoiceNumber = generateInvoiceNumber(customerId);

    let invoiceStatus;
    if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
      invoiceStatus = 'PAID';
    } else if (newClosingBalance === 0) {
      invoiceStatus = 'PAID';
    } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
      invoiceStatus = 'PPAID';
    } else {
      invoiceStatus = 'UNPAID';
    }

    const newInvoice = await prisma.$transaction(async (prisma) => {
      const createdInvoice = await prisma.invoice.create({
        data: {
          customerId,
          tenantId  ,
          invoiceNumber,
          invoicePeriod,
          closingBalance: newClosingBalance,
          invoiceAmount,
          status: invoiceStatus,
          isSystemGenerated: false,
        },
      });

      await prisma.invoiceItem.createMany({
        data: invoiceItemsData.map(itemData => ({
          invoiceId: createdInvoice.id,
          description: itemData.description,
          amount: itemData.amount,
          quantity: itemData.quantity,
        })),
      });

      await prisma.customer.update({
        where: { id: customerId },
        data: { closingBalance: newClosingBalance },
      });

      return createdInvoice;
    });

    res.status(200).json({ newInvoice });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}





// Cancel an invoice by ID
async function cancelInvoice(invoiceId) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoiceAmount: true,
        customerId: true,
        closingBalance: true,
        status: true,
      },
    });

    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'CANCELLED') return invoice;

    const currentClosingBalance = await getCurrentClosingBalance(invoice.customerId);
    const newClosingBalance = currentClosingBalance - invoice.invoiceAmount;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        closingBalance: newClosingBalance,
      },
    });

    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: { closingBalance: newClosingBalance },
    });

    return updatedInvoice;
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    throw error;
  }
}

// Cancel system-generated invoices atomically
async function cancelSystemGeneratedInvoices() {
  const transaction = await prisma.$transaction(async (prisma) => {
    try {
      // Fetch the latest system-generated invoice
      const latestInvoice = await prisma.invoice.findFirst({
        where: { isSystemGenerated: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestInvoice) return null;

      const currentClosingBalance = await getCurrentClosingBalance(latestInvoice.customerId);
      const newClosingBalance = currentClosingBalance - latestInvoice.invoiceAmount;

      // Update the invoice status and closing balance
      const updatedInvoice = await prisma.invoice.update({
        where: { id: latestInvoice.id },
        data: {
          status: 'CANCELLED',
          closingBalance: currentClosingBalance, // Retain the original balance before canceling
        },
      });

      // Update the customer's closing balance
      await prisma.customer.update({
        where: { id: latestInvoice.customerId },
        data: { closingBalance: newClosingBalance },
      });

      return updatedInvoice;
    } catch (error) {
      console.error('Error cancelling system-generated invoice:', error);
      throw new Error('Transaction failed');
    }
  });

  return transaction;
}

// Get all invoices, ordered by the latest first
async function getAllInvoices(req, res) {
  const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant ID is required to fetch invoices' });
  }

  try {
    // Fetch invoices filtered by tenantId
    const invoices = await prisma.invoice.findMany({
      where: { tenantId }, // Filter by tenantId
      include: {
        customer: true, // Include customer details
        items: true,    // Include invoice items
      },
      orderBy: {
        createdAt: 'desc', // Order by creation date in descending order
      },
    });

    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Error fetching invoices' });
  }
}



// Cancel an invoice by ID (for API)
async function cancelInvoiceById(req, res) {
  const { invoiceId } = req.params;
  const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to cancel invoices' });
  }

  try {
    // Retrieve the invoice details including the tenant ID, customer ID, and invoice amount
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        tenantId: true,
        invoiceAmount: true,
        customerId: true,
        status: true,
      },
    });

    // Check if the invoice exists
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify that the invoice belongs to the authenticated tenant
    if (invoice.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Access denied: You do not own this invoice' });
    }

    // Check if the invoice is already cancelled
    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice is already cancelled' });
    }

    // Retrieve the customer details to get the current closing balance
    const customer = await prisma.customer.findUnique({
      where: { id: invoice.customerId },
      select: { closingBalance: true },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Calculate the new closing balance for the customer
    const newClosingBalance = customer.closingBalance - invoice.invoiceAmount;

    // Update the invoice status to "CANCELLED" and the customer's closing balance in a transaction
    const [updatedInvoice] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
        },
      }),
      prisma.customer.update({
        where: { id: invoice.customerId },
        data: { closingBalance: newClosingBalance },
      }),
    ]);

    // Return a success response
    res.status(200).json({
      message: 'Invoice cancelled successfully',
      invoice: updatedInvoice,
      newClosingBalance,
    });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}



// Scheduled job to generate invoices on the 1st of every month
schedule.scheduleJob('0 0 1 * *', async () => {
  console.log('Running scheduled job to generate invoices...');
  try {
    await generateInvoices();
  } catch (error) {
    console.error('Error during scheduled job execution:', error);
  }
});

// Get invoice details by ID
async function getInvoiceDetails(req, res) {
  const { id } = req.params; // Extract the invoice ID from the route parameters
  const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required' });
  }

  try {
    // Fetch the invoice and verify tenant ownership
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    // Check if the invoice exists
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify that the invoice belongs to the authenticated tenant
    if (invoice.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Access denied: You do not own this invoice' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice details:', error);
    res.status(500).json({ message: 'Error fetching invoice details' });
  }
}

// Exporting all functions
module.exports = {
  createInvoice,
  generateInvoices,
  cancelInvoice,
  cancelSystemGeneratedInvoices,
  getAllInvoices,
  cancelInvoiceById,
  getInvoiceDetails,
  getCurrentClosingBalance,
  getCurrentMonthBill,
  generateInvoicesByDay
};
