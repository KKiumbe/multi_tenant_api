const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const cron = require('node-cron');


const runTask = require('../controller/jobs/backup.js');
const {generateInvoicesForAllTenants} = require('../controller/bill/processBillsAllTenants.js');

const moment = require('moment-timezone');
const { sendInvoiceReminders } = require('../controller/jobs/invoiceGenReminderSMS.js');
const { sendSmsBalanceAlerts } = require('../controller/jobs/smsBalanceReminder.js');

cron.schedule('0 2 * * *', () => {
  console.log(`[ ⏰ Triggering backup task at: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}`);
  runTask();
}, {
  scheduled: true,
  timezone: 'Africa/Nairobi',
});



// 2:00 AM on the last day of every month


cron.schedule(
  '35 8 * * *',
  async () => {
    try {
      await generateInvoicesForAllTenants();
      console.log('✅ Invoice generation completed successfully');
    } catch (error) {
      console.error('❌ Invoice generation failed:', error.message);
    }
  },
  {
    timezone: 'Africa/Nairobi',
  }
);


cron.schedule('10 11 28-31 * *', async () => {
  try {
     await sendInvoiceReminders();

     console.log(`sms reminders sent`);
    
  } catch (error) {
    console.error('error sending sms reminders,', error.message);
  }
   
  }, {
    timezone: 'Africa/Nairobi',
  });







cron.schedule('0 0 * * 0', async () => {
    console.log('🔄 Running weekly job: Resetting collected status...');
    try {
        await prisma.customer.updateMany({
            data: { collected: false },
        });
        console.log('✅ Successfully updated collected status for all customers.');
    } catch (error) {
        console.error('❌ Error updating collected status:', error);
    }
});

// Reset `trashBagsIssued` status on the 1st of every month at midnight
cron.schedule('0 0 1 * *', async () => {
    console.log('🗑️ Running monthly job: Resetting trashBagsIssued status...');
    try {
        await prisma.customer.updateMany({
            data: { trashBagsIssued: false },
        });
        console.log('✅ Successfully updated trashBagsIssued status for all customers.');
    } catch (error) {
        console.error('❌ Error updating trashBagsIssued status:', error);
    }
});



cron.schedule('0 10 * * *', async () => {
  console.log(`[${moment().tz('Africa/Nairobi').format()}] 📡 Running SMS balance alert job...`);

  try {
    await sendSmsBalanceAlerts();
  } catch (error) {
    console.error('❌ Failed to send SMS balance alerts:', error.message);
  }
}, {
  timezone: 'Africa/Nairobi',
});

