const cron = require('node-cron');
const moment = require('moment-timezone');
const { generateInvoicesForAllTenants } = require('../bill/processBillsAllTenants');



function startInvoiceScheduler() {
  cron.schedule('0 2 1 * *', async () => {
    const kenyaTime = moment().tz('Africa/Nairobi');

    if (kenyaTime.date() === kenyaTime.daysInMonth()) {
      console.log('📅 Running end-of-month invoice generation at 2AM (Kenyan time)');
      try {
        await generateInvoicesForAllTenants();
        console.log('✅ Invoice generation completed successfully');
      } catch (error) {
        console.error('❌ Invoice generation failed:', error.message);
      }
    }
  }, {
    timezone: 'Africa/Nairobi',
  });




  console.log('📆 Invoice generation scheduler initialized.');
}

module.exports = startInvoiceScheduler;

