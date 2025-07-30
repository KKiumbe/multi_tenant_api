// sms/reminder.js
const { PrismaClient } = require('@prisma/client');
const moment = require('moment-timezone');


const prisma = new PrismaClient();

async function sendInvoiceReminders() {
  const kenyaTime = moment().tz('Africa/Nairobi');
  const today = kenyaTime.date();
  const daysInMonth = kenyaTime.daysInMonth();

  const daysRemaining = daysInMonth - today;
  if (daysRemaining > 2) {
    console.log(`[${kenyaTime.format()}] Skipping SMS: Not within last 3 days.`);
    return;
  }

  console.log(`[${kenyaTime.format()}] 📲 Sending invoice reminders to tenants...`);

  const tenants = await prisma.tenant.findMany({
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

    try {
        const {sendSMS} = require('../sms/sms.js');
      const result = await sendSMS(tenant.id, recipient, message);
      console.log(`✅ SMS sent to ${recipient} for tenant ${tenant.name}: ${result[0]?.status}`);
    } catch (error) {
      console.error(`❌ Failed to send SMS to ${recipient}: ${error.message}`);
    }
  }
}

module.exports = { sendInvoiceReminders };
