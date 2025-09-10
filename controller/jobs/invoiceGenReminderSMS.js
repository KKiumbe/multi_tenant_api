// sms/reminder.js

const moment = require('moment-timezone');

const {prisma} = require('../../cron-jobs/cronPrismaClient.js');

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


const notifyUnreceiptedPayments = async () => {
  try {
    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
      },
    });

    for (const tenant of tenants) {
      // Get unreceipted payments for this tenant
      const payments = await prisma.payment.findMany({
        where: {
          tenantId: tenant.id,
          receipted: false,
        },
        select: {
          id: true,
          amount: true,
          ref: true,
          createdAt: true,
        },
      });

      if (!payments.length) continue;

      for (const payment of payments) {
        // Extract phone number from ref (basic Kenyan phone number validation)
        let recipient = payment.ref && /^(\+?254|0)\d{9}$/.test(payment.ref)
          ? payment.ref
          : tenant.phoneNumber || tenant.alternativePhoneNumber;

        if (!recipient) {
          console.warn(`No valid phone number found for payment ID: ${payment.id}`);
          continue;
        }

        // Ensure number is in correct format (international format)
        if (/^0\d{9}$/.test(recipient)) {
          recipient = recipient.replace(/^0/, '+254');
        }

        const message = `Dear customer,we noticed you made a payment of KES ${payment.amount} on ${payment.createdAt.toLocaleDateString()} for garbage collection service , but it has not been receipted because this phone number is not registered with us. Please contact ${tenant.phoneNumber || tenant.alternativePhoneNumber} for assistance.`;

        try {
          const { sendSMS } = require('../sms/sms.js');
          const result = await sendSMS(tenant.id, recipient, message);
          console.log(`SMS sent to ${recipient} for payment ID ${payment.id}`, result);
        } catch (smsErr) {
          console.error(`Failed to send SMS for payment ID ${payment.id}`, smsErr);
        }
      }
    }
  } catch (err) {
    console.error('Error in notifyUnreceiptedPayments:', err);
  }
};


module.exports = { sendInvoiceReminders ,notifyUnreceiptedPayments};
