const cron = require('node-cron');
const moment = require('moment-timezone');
const { PrismaClient } = require('@prisma/client');
const { sendSMS } = require('../sms/sms');

const prisma = new PrismaClient();

function startInvoiceSMSScheduler() {
  cron.schedule('0 20 28-31 * *', async () => {
    const kenyaTime = moment().tz('Africa/Nairobi');
    const today = kenyaTime.date();
    const daysInMonth = kenyaTime.daysInMonth();

    const daysRemaining = daysInMonth - today;

    if (daysRemaining > 2) return; // Only act if today is among last 3 days

    console.log(`[${kenyaTime.format()}] 📲 Sending daily end-of-month invoice reminder SMS to tenants...`);

    try {
      const tenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          alternativePhoneNumber: true,
        },
      });

      for (const tenant of tenants) {
        const recipient = tenant.phoneNumber || tenant.alternativePhoneNumber;
        if (!recipient) {
          console.warn(`⚠️ Skipping tenant ${tenant.id} (${tenant.name}): No phone number.`);
          continue;
        }

        const message = `Hello ${tenant.name}, this is a reminder that invoices will be auto-generated at midnight on the 1st. Please ensure customer balances are up to date. Also clear the Unrecepted payments`;

        const result = await sendSMS(tenant.id, recipient, message);
        console.log(`✅ SMS sent to ${recipient} for tenant ${tenant.name}: ${result[0]?.status}`);
      }

    } catch (error) {
      console.error('❌ SMS Reminder Job Failed:', error.message);
    }
  }, {
    timezone: 'Africa/Nairobi',
  });

  console.log('📆 Invoice reminder SMS scheduler set: Runs daily on last 3 days of each month at 8PM EAT');
}

module.exports = startInvoiceSMSScheduler;
