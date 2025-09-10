const {prisma} = require('../../cron-jobs/cronPrismaClient.js');

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
function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return `${day}th`; 
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

module.exports = { checkCustomersForAllTenants };