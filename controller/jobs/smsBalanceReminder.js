// jobs/sendSmsBalanceAlerts.js
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');



const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;
const prisma = new PrismaClient();

const checkSmsBalance = async (apiKey, partnerId) => {
  if (!apiKey || !partnerId) {
    throw new Error('Missing API key or Partner ID');
  }

  try {
    const res = await axios.post(SMS_BALANCE_URL, {
      apikey: apiKey,
      partnerID: partnerId,
    });

    return Number(res.data.balance ?? res.data.credit ?? 0);
  } catch (err) {
    console.error('❌ Failed to fetch SMS balance:', err.response?.data || err.message);
    return null;
  }
};

const sendSmsBalanceAlerts = async () => {
  const smsConfigs = await prisma.sMSConfig.findMany({
    include: { tenant: true },
  });

  for (const config of smsConfigs) {
    const balance = await checkSmsBalance(config.apiKey, config.partnerId);

    if (balance === null) continue;

    if (balance < 100) {
      const phone = config.tenant.phoneNumber || config.tenant.alternativePhoneNumber;

      if (!phone) {
        console.warn(`⚠️ No phone number for tenant ${config.tenant.name}`);
        continue;
      }

      const message = `Hello ${config.tenant.name}, your SMS balance is very low. Please reach us on 0722230603 for a top up to ensure your customers get notifications.`;

      const {sendSMS}= require('../sms/sms.js');
      const result = await sendSMS(config.tenantId, phone, message);
      console.log(`✅ SMS alert sent to ${phone}: ${result[0]?.status || 'sent'}`);
    }
  }
};

module.exports = { sendSmsBalanceAlerts };
