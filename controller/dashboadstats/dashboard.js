// controllers/dashboardController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDashboardStats = async (req, res) => {

  const {tenantId} = req.user; // Extract tenantId from authenticated user

  // Validate required fields
  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
  }

  try {
    // Fetch all active customers with their invoices and monthly charge
    const activeCustomers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId
        // Only fetch active customers
      },
      include: {
        invoices: true, // Include invoices for status checks
      },
    });

    // Calculate statistics based on the active customer data
    const paidCustomers = activeCustomers.filter(customer => 
      customer.closingBalance < 0
    ).length;

    const unpaidCustomers = activeCustomers.filter(customer => 
      customer.closingBalance > 0 // Customers who owe money (closing balance less than 15% of monthly charge)
    ).length;

    const lowBalanceCustomers = activeCustomers.filter(customer => 
      customer.closingBalance < customer.monthlyCharge  // Customers with closing balance less than their monthly charge
    ).length;

    const highBalanceCustomers = activeCustomers.filter(customer => 
      customer.closingBalance > customer.monthlyCharge * 1.5 // Customers with closing balance more than 1.5 times their monthly charge
    ).length;

    const totalCustomers = activeCustomers.length; // Count of active customers

    const overdueCustomers = activeCustomers.filter(customer => {
      // Check if the customer has more than 2 unpaid invoices
      const unpaidInvoices = customer.invoices.filter(invoice => invoice.status === 'UNPAID');
      return unpaidInvoices.length > 2;
    }).length;

    // Send the response
    res.status(200).json({
      success: true,
      data: {
        paidCustomers,
        unpaidCustomers,
        lowBalanceCustomers,
        highBalanceCustomers,
        totalCustomers,
        overdueCustomers,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats.' });
  } finally {
    await prisma.$disconnect();
  }
};





function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return `${day}th`; 
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

const checkCustomersForAllTenants = async () => {
  try {
    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        alternativePhoneNumber: true
      },
    });

    for (const tenant of tenants) {
      // Get all active customers
      const activeCustomers = await prisma.customer.findMany({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE'
        },
        select: { closingBalance: true }
      });

      const totalCustomers = activeCustomers.length;
      if (totalCustomers === 0) {
        console.log(`Tenant ${tenant.name} has no active customers.`);
        continue;
      }

      // Paid = closingBalance <= 0
      const paidCustomers = activeCustomers.filter(
        c => c.closingBalance <= 0
      ).length;

      const paidPercentage = ((paidCustomers / totalCustomers) * 100).toFixed(1);

      const currentDate = new Date();
      const currentDay = currentDate.getDate();
      const dayWithSuffix = getOrdinalSuffix(currentDay);

      // Optional: show month name
      const monthName = currentDate.toLocaleString('default', { month: 'long' });

      const message = `Dear ${tenant.name}, ${paidPercentage}% of customers have paid you as of ${dayWithSuffix} ${monthName}. You can nudge your customers to pay you by sending them reminders. Most people run out of money as the month progresses.`;

      console.log(`Tenant ${tenant.name}: ${message}`);

      // Pick number
      const recipientNumber = tenant.phoneNumber || tenant.alternativePhoneNumber;
      if (!recipientNumber) {
        console.warn(`Tenant ${tenant.name} has no phone number.`);
        continue;
      }

const { sendSMS } = require('../sms/sms.js');

      await sendSMS(
        tenant.id,
        recipientNumber,
        message
      );
    }
  } catch (error) {
    console.error('Error checking customers for all tenants:', error);
  }
};



module.exports = {
  getDashboardStats,checkCustomersForAllTenants
};
