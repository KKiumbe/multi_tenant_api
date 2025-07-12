const { PrismaClient, CustomerType } = require('@prisma/client');
const axios = require('axios');
const {getSMSConfigForTenant }= require('../smsConfig/getSMSConfig.js')
const {fetchTenant} = require('../tenants/tenantupdate.js')
const { v4: uuidv4, stringify } = require('uuid');
const { generatePaymentLink } = require('../mpesa/stkpush.js');


const prisma = new PrismaClient();

// const SMS_API_KEY = process.env.SMS_API_KEY;
// const PARTNER_ID = process.env.PARTNER_ID;
// const SHORTCODE = process.env.SHORTCODE;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const BULK_SMS_ENDPOINT = process.env.BULK_SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;


// const customerSupport =  process.env.CUSTOMER_SUPPORT;


async function getShortCode(tenantId) {
  try {
    const config = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
      select: { shortCode: true },
    });

    return config ? config.shortCode : null;
  } catch (error) {
    console.error("Error fetching shortCode:", error);
    return null;
  }
}








const checkSmsBalance = async (apiKey, partnerId) => {
    if (!apiKey || !partnerId) {
      throw new Error('API key or partner ID is missing');
    }
  
    //console.log(`Checking SMS balance with apiKey: ${apiKey} and partnerId: ${partnerId}`);
  
    try {
      const response = await axios.post(SMS_BALANCE_URL, {
        apikey: apiKey,
        partnerID: partnerId,
      });
      //console.log('SMS balance:', response.data.balance);
      return response.data.balance;
    } catch (error) {
      console.error('Error checking SMS balance:', error.response?.data || error.message);
      throw new Error('Failed to retrieve SMS balance');
    }
  };
  
  



const sanitizePhoneNumber = (phone) => {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+254')) return phone.slice(1);
  if (phone.startsWith('0')) return `254${phone.slice(1)}`;
  if (phone.startsWith('254')) return phone;
  return `254${phone}`;
};



const getSmsBalance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const smsConfig = await getSMSConfigForTenant(tenantId);

    if (!smsConfig || !smsConfig.apikey || !smsConfig.partnerID) {
      return res.status(400).json({ error: 'SMS configuration not found or incomplete for tenant.' });
    }

    const { apikey, partnerID } = smsConfig;

    const response = await axios.post(SMS_BALANCE_URL, {
      apikey,
      partnerID,
    });

    //console.log('SMS balance:', response.data.credit);
    res.status(200).json({ credit: response.data.credit });

  } catch (error) {
    console.error('Error checking SMS balance:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve SMS balance. Please try again later.' });
  }
};

  




const sendToOne = async (req, res) => {

    const { tenantId } = req.user; 
    //console.log(`this is the tenant id ${tenantId}`);

  const { mobile, message } = req.body;
  try {
      const response = await sendSMS(tenantId,mobile, message);
      res.status(200).json({ success: true, response });
  } catch (error) {
      console.error('Error in sendToOne:', error.message);
      res.status(500).json({ success: false, message: error.message });
  }
};




const sendSMS = async (tenantId, recipient, message) => {
  try {
    // Fetch SMS configuration
    const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);

    // Handle single or batch recipients
    const messages = Array.isArray(recipient)
      ? recipient // Batch: [{ mobile: '254722230603', message: '...' }, ...]
      : [{ mobile: recipient, message }]; // Single: '254722230603', 'message'

    const responses = await Promise.all(
      messages.map(async ({ mobile, message }) => {
        let clientsmsid = uuidv4();
        const sanitizedPhoneNumber = sanitizePhoneNumber(mobile);

        try {
          // Create SMS record
          const smsRecord = await prisma.sMS.create({
            data: {
              tenantId,
              clientsmsid,
              mobile: sanitizedPhoneNumber,
              message,
              status: 'pending',
            },
          });

          // Prepare payload
          const payload = {
            apikey,
            partnerID,
            message,
            shortcode: shortCode,
            mobile: sanitizedPhoneNumber,
          };

          // Send SMS
          const response = await axios.post(SMS_ENDPOINT, payload);

          // Update SMS record to "sent"
          await prisma.sMS.update({
            where: { id: smsRecord.id },
            data: { status: 'sent' },
          });

          return {
            phoneNumber: sanitizedPhoneNumber,
            status: 'success',
            clientsmsid,
            details: response.data,
          };
        } catch (error) {
          // Update SMS record to "failed"
          if (clientsmsid) {
            await prisma.sMS.update({
              where: { clientsmsid },
              data: { status: 'failed' },
            });
          }

          return {
            phoneNumber: sanitizedPhoneNumber,
            status: 'error',
            clientsmsid,
            details: error.response?.data || error.message,
          };
        }
      })
    );

    return responses;
  } catch (error) {
    console.error('Error in sendSMS:', error.message);
    throw new Error('Failed to send SMS');
  }
};


  











// Send bills to all active customers

const sendBills = async (req, res) => {
  const { tenantId } = req.user;
  const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  try {
    // Fetch active customers with customerType
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: {
        id: true, // Added for error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = activeCustomers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Process each customer
    const messages = activeCustomers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears message
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Paybill: ${paybill}, acct: ${customer.phoneNumber}. ` +
        `Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);
    res.status(200).json({ message: 'Bills sent successfully', smsResponses });
  } catch (error) {
    console.error('Error sending bills:', error);
    res.status(500).json({ error: 'Failed to send bills.', details: error.message });
  }
};

const sendDetailedBill = async (req, res) => {
  const { tenantId } = req.user; 
  const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  // Get the current month name, e.g. "May"
  const nameOfMonth = new Date().toLocaleString('en-US', { month: 'long' });

  try {
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: {
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
      },
    });

    const messages = activeCustomers.map((customer) => {
      // Format the closing balance portion
      const balanceText = customer.closingBalance < 0
        ? `overpayment of KES ${Math.abs(customer.closingBalance)}`
        : `KES ${customer.closingBalance}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message: 
          `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${customer.monthlyCharge}, ` +
          `balance ${balanceText}. Paybill: ${paybill}, acct: ${customer.phoneNumber}. ` +
          `Inquiries? ${customerSupport}`
      };
    });

    const smsResponses = await sendSms(tenantId, messages);
    res.status(200).json({ message: 'Bills sent successfully', smsResponses });
  } catch (error) {
    console.error('Error sending bills:', error);
    res.status(500).json({ error: 'Failed to send bills.' });
  }
};




const sendBillsEstate = async (req, res) => {
  const { tenantId } = req.user;
  const { estateName } = req.body; // Extract estateName from request body

  // Validate estateName in the request body
  if (!estateName || typeof estateName !== 'string') {
    return res.status(400).json({ error: 'Estate name is required and must be a string.' });
  }

  try {
    // Fetch SMS configuration and paybill for the tenant
    const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);

    // Fetch active customers for the tenant in the specified estate (case-insensitive)
    const activeCustomers = await prisma.customer.findMany({
      where: {
        tenantId: tenantId,
        status: 'ACTIVE',
        estateName: {
          equals: estateName,
          mode: 'insensitive', // Case-insensitive matching
        },
      },
      select: { phoneNumber: true, 

        firstName:true,
        closingBalance:true,
        monthlyCharge:true,
},
    });

    if (!activeCustomers || activeCustomers.length === 0) {
      return res.status(404).json({
        message: `No active customers found for tenant ${tenantId} in estate ${estateName}.`,
      });
    }

    // Prepare SMS messages for the customers in the specified estate

    const messages = activeCustomers.map((customer) => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber),
   
      message: `Dear ${customer.firstName},your bill is KES ${customer.monthlyCharge},balance ${
        customer.closingBalance < 0
          ? "overpayment of KES" + Math.abs(customer.closingBalance)
          : "KES " + customer.closingBalance
      }.Paybill: ${paybill},acct:your phone number;${customer.phoneNumber}.Inquiries? ${customerSupport}`


    }));

   
    // Send SMS messages
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message and SMS responses
    res.status(200).json({
      message: `Bills sent successfully to ${activeCustomers.length} customers in estate ${estateName}`,
      smsResponses,
    });
  } catch (error) {
    console.error(`Error sending bills for estate ${estateName}:`, error);
    res.status(500).json({ error: `Failed to send bills for estate ${estateName}.` });
  }
};



const sendToAll = async (req, res) => {
  const { tenantId } = req.user;
  const { message } = req.body;
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(100); // Limit to 100 concurrent operations

  // Validate inputs
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID is required.' });
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'A valid message is required.' });
  }

  try {
    // Check SMS configuration
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (!smsConfig) {
      return res.status(400).json({ error: 'Missing SMS configuration for tenant.' });
    }

    // Fetch active customers
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
      },
    });

    if (activeCustomers.length === 0) {
      return res.status(200).json({ message: 'No active customers found.' });
    }

    // Process customers in batches of 1000
    const batchSize = 1000;
    const messages = [];
    for (let i = 0; i < activeCustomers.length; i += batchSize) {
      const customerBatch = activeCustomers.slice(i, i + batchSize);
      const batchMessages = await Promise.all(
        customerBatch.map((customer) =>
          limit(async () => ({
            mobile: sanitizePhoneNumber(customer.phoneNumber),
            message: `Dear ${customer.firstName}, ${message.trim()}`,
          }))
        )
      );
      messages.push(...batchMessages);
    }

    // Send SMS in batches of 500
    const smsBatchSize = 500;
    const smsResponses = [];
    for (let i = 0; i < messages.length; i += smsBatchSize) {
      const batch = messages.slice(i, i + smsBatchSize);
      try {
        const batchResponses = await sendSms(tenantId, batch);
        smsResponses.push(...batchResponses);
      } catch (batchError) {
        console.error(`Error sending SMS batch ${i / smsBatchSize + 1}:`, batchError);
        smsResponses.push(
          ...batch.map((msg) => ({
            phoneNumber: msg.mobile,
            status: 'error',
            details: batchError.message,
          }))
        );
      }
    }

    // Respond with success
    res.status(200).json({
      success: true,
      message: `SMS sent to ${activeCustomers.length} active customers in ${Math.ceil(messages.length / smsBatchSize)} SMS batches.`,
      count: activeCustomers.length,
      smsResponses,
    });
  } catch (error) {
    console.error('Error sending SMS to all customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS to all customers.',
      details: error.message,
    });
  }
};


const sendToEstate = async (req, res) => {
  const { tenantId } = req.user;
  const { estateName, message } = req.body;

  // Validate request body
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }
  if (!estateName || typeof estateName !== 'string') {
    return res.status(400).json({ error: 'Estate name is required and must be a string.' });
  }

  try {
    // Check if SMS configuration exists for the tenant
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (!smsConfig) {
      return res.status(400).json({ error: 'Missing SMS configuration for tenant.' });
    }

    // Fetch active customers for the specified estate (case-insensitive)
    const activeCustomers = await prisma.customer.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        estateName: {
          equals: estateName,
          mode: 'insensitive', // Case-insensitive matching
        },
      },
      select: { phoneNumber: true },
    });

    if (activeCustomers.length === 0) {
      return res.status(200).json({
        message: `No active customers found in estate ${estateName} for tenant ${tenantId}.`,
      });
    }

    // Prepare messages
    const messages = activeCustomers.map((customer) => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber),
      message,
    }));

    // Send SMS in batches to avoid timeouts (reusing your existing logic)
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message
    res.status(200).json({
      message: `SMS sent to ${activeCustomers.length} active customers in estate ${estateName}.`,
      smsResponses,
    });
  } catch (error) {
    console.error(`Error sending SMS to customers in estate ${estateName}:`, error);
    res.status(500).json({
      error: `Failed to send SMS to customers in estate ${estateName}.`,
      details: error.message,
    });
  }
};

// Send bill SMS for a specific customer


const sendBill = async (req, res) => {
  const { customerId } = req.body;
  const { tenantId } = req.user;
  const { customerSupportPhoneNumber } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required.' });
  }

  try {
    // Fetch the customer with customerType
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      select: {
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Validate customerType
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    if (!validCustomerTypes.includes(customer.customerType)) {
      return res.status(400).json({ error: `Invalid customerType. Must be one of: ${validCustomerTypes.join(', ')}.` });
    }

    // Get current date in Kenyan time (Africa/Nairobi, UTC+3)
    const currentDate = new Date().toLocaleString('en-US', {
      timeZone: 'Africa/Nairobi',
    });
    const billingDate = customer.customerType === 'POSTPAID'
      ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
      : new Date(currentDate);
    const nameOfMonth = billingDate.toLocaleString('en-US', {
      month: 'long',
      timeZone: 'Africa/Nairobi',
    });

    // Check M-Pesa config for all required credentials
    const mpesaConfig = await prisma.mPESAConfig.findFirst({
      where: { tenantId },
      select: { apiKey: true, passKey: true, secretKey: true },
    });

    // Generate payment link only if all credentials exist
    let linkUrl = '';
    if (mpesaConfig && mpesaConfig.apiKey && mpesaConfig.passKey && mpesaConfig.secretKey) {
      linkUrl = await generatePaymentLink(customerId, tenantId);
    }

    // Calculate arrears and total balance
    const monthBill = customer.monthlyCharge;
    const isOverpayment = customer.closingBalance < 0;
    const isBalanceEqualToBill = customer.closingBalance === monthBill;
    const previousArrears = isOverpayment || isBalanceEqualToBill
      ? 0
      : customer.closingBalance > monthBill
      ? customer.closingBalance - monthBill
      : 0;
    const totalBalance = customer.closingBalance;

    // Format balance and arrears message
    const balanceText = isOverpayment
      ? `overpayment of KES ${Math.abs(totalBalance)}`
      : `KES ${totalBalance}`;
    const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

    // Construct SMS message
    let message = `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, total balance ${balanceText}. Paybill: ${paybill}, acct: ${customer.phoneNumber}.`;
    if (linkUrl) {
      message += ` Pay here: ${linkUrl}.`;
    }
    message += ` Inquiries? ${customerSupportPhoneNumber}`;

    // Send SMS
    const smsResponses = await sendSMS(tenantId, customer.phoneNumber, message);

    res.status(200).json({ message: 'Bill sent successfully.', smsResponses, linkUrl });
  } catch (error) {
    console.error('Error sending bill:', error.message);
    res.status(500).json({ error: 'Failed to send bill.', details: error.message });
  }
};


// Send bill SMS for customers grouped by collection day

const sendBillPerDay = async (req, res) => {
  const { day } = req.body;
  const { tenantId } = req.user;
  const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  if (!day) {
    return res.status(400).json({ error: 'Day is required.' });
  }

  // Validate day
  const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const upperDay = day.toUpperCase();
  if (!validDays.includes(upperDay)) {
    return res.status(400).json({ error: `Invalid day. Must be one of: ${validDays.join(', ')}.` });
  }

  try {
    // Fetch active customers for the specified day
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        garbageCollectionDay: upperDay,
      },
      select: {
        id: true, // For error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No active customers found for the specified day.' });
    }

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = customers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Pay via ${paybill}, acct: ${customer.phoneNumber}. Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message
    res.status(200).json({
      message: 'Bills sent for the day successfully.',
      count: messages.length,
      smsResponses,
    });
  } catch (error) {
    console.error('Error sending bill per day:', error);
    res.status(500).json({ error: 'Failed to send bill per day.', details: error.message });
  }
};

const billReminderPerDay = async (req, res) => {
  const { day } = req.body;
  const { tenantId } = req.user;
  const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  if (!day) {
    return res.status(400).json({ error: 'Day is required.' });
  }

  // Validate day
  const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const upperDay = day.toUpperCase();
  if (!validDays.includes(upperDay)) {
    return res.status(400).json({ error: `Invalid day. Must be one of: ${validDays.join(', ')}.` });
  }

  try {
    // Fetch active customers with positive closingBalance for the specified day
    const customers = await prisma.customer.findMany({
      where: {
        garbageCollectionDay: upperDay,
        status: 'ACTIVE',
        tenantId,
        closingBalance: { gt: 0 }, // Customers who owe money
      },
      select: {
        id: true, // For error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify for the given day.' });
    }

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = customers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears message
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Paybill: ${paybill}, acct: ${customer.phoneNumber}. ` +
        `Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent for the day successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminder per day:', error);
    res.status(500).json({ error: 'Failed to send bill reminders per day.', details: error.message });
  }
};


const billReminderForAll = async (req, res) => {
  const { tenantId } = req.user;
  const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  try {
    // Fetch all active customers with a positive closingBalance
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        closingBalance: { gt: 0 }, // Only include customers who owe money
      },
      select: {
        id: true, // For error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify.' });
    }

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = customers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Pay via ${paybill}, acct: ${customer.phoneNumber} to avoid service disruption. ` +
        `Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent to all customers successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminders for all customers:', error);
    res.status(500).json({ error: 'Failed to send bill reminders for all customers.', details: error.message });
  }
};



// Send SMS to a group of customers

// Helper function to send SMS

const sendToGroup = async (req, res) => {
  const { day, message } = req.body;
  const { tenantId } = req.user;

  // Validate inputs
  if (!day || !message) {
    return res.status(400).json({ error: 'Day and a valid message are required.' });
  }

  // Validate day
  const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const upperDay = stringify(day);
  if (!validDays.includes(upperDay)) {
    return res.status(400).json({ error: `Invalid day. Must be one of: ${validDays.join(', ')}.` });
  }

  try {
    // Check SMS configuration
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (!smsConfig) {
      return res.status(400).json({ error: 'Missing SMS configuration for tenant.' });
    }

    // Fetch active customers for the specified day
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        garbageCollectionDay: upperDay,
      },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: `No active customers found for ${upperDay}.` });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber),
      message: `Dear ${customer.firstName}, ${message.trim()}`,
    }));

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    res.status(200).json({
      success: true,
      message: `SMS sent to ${customers.length} customers for ${upperDay} successfully.`,
      count: customers.length,
      smsResponses,
    });
  } catch (error) {
    console.error('Error sending SMS to group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS to group.',
      details: error.message,
    });
  }
};


const sendSms = async (tenantId, messages) => {
  try {
    const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);

    if (!partnerID || !apikey || !shortCode) {
      throw new Error('Missing SMS configuration for tenant.');
    }

    // Prepare the SMS list for bulk sending
    const smsList = messages.map((msg) => ({
      apikey,
      partnerID,
      message: msg.message,
      shortcode: shortCode,
      mobile: String(msg.mobile),
    }));

    const batchSize = 450; // Adjust based on API limits
    const batches = [];
    for (let i = 0; i < smsList.length; i += batchSize) {
      batches.push(smsList.slice(i, i + batchSize));
    }

    let allResponses = [];

    for (const batch of batches) {
      const payload = {
        smslist: batch, // Use smslist as the key
      };

      //console.log("📞 Sending SMS payload:", payload);

      let response;
      try {
        response = await axios.post(process.env.BULK_SMS_ENDPOINT, payload);
        //console.log(`Batch of ${batch.length} SMS sent successfully:`, response.data);
      } catch (error) {
        console.error('Bulk SMS API error:', error.response?.data || error.message);
        response = { data: { status: 'FAILED' } }; // Simulate failure response
      }

      // Log each SMS in the batch
      const smsLogs = batch.map((sms) => ({
        clientsmsid: uuidv4(), // Unique ID for logging
        tenantId,
        mobile: sms.mobile,
        message: sms.message,
        status: response.data.status === 'FAILED' ? 'FAILED' : 'SENT',
        createdAt: new Date(),
      }));

      await prisma.sMS.createMany({ data: smsLogs });
      allResponses.push(response.data);
    }

    return allResponses;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send SMS.');
  }
};




  const sendUnpaidCustomers = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Fetch active customers with unpaid balances (closingBalance > 0)
    const unpaidCustomers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        closingBalance: { gt: 0 }, // Exclude paid customers (closingBalance <= 0)
      },
      select: {
        id: true, // For error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    if (unpaidCustomers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No unpaid customers found.',
      });
    }

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = unpaidCustomers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Prepare SMS messages
    const messages = unpaidCustomers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Please settle promptly to avoid service disruption. ` +
        `Pay via ${paybill}, acct: ${customer.phoneNumber}. Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send bulk SMS
    try {
      const smsResponses = await sendSms(tenantId, messages);
      res.status(200).json({
        success: true,
        message: 'SMS sent to unpaid customers successfully.',
        count: messages.length,
        smsResponses,
      });
    } catch (smsError) {
      console.error('Failed to send bulk SMS:', smsError.message);
      res.status(500).json({
        success: false,
        message: 'Failed to send SMS to unpaid customers.',
        details: smsError.message,
      });
    }
  } catch (error) {
    console.error('Error in sendUnpaidCustomers:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error processing unpaid customers.',
      details: error.message,
    });
  }
};




const sendCustomersAboveBalance = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { balance } = req.body;

    // Validate inputs
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    if (balance === undefined || isNaN(balance) || balance < 0) {
      throw new Error('A valid balance amount is required');
    }

    // Check SMS configuration
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });
    if (!smsConfig) {
      throw new Error('Missing SMS configuration for tenant.');
    }

    // Get paybill and customer care number
    const paybill = await getShortCode(tenantId);
    const { phoneNumber: customerCarePhoneNumber } = await fetchTenant(tenantId);

    // Fetch active customers
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    // Validate customerType
    const validCustomerTypes = [CustomerType.POSTPAID , CustomerType.PREPAID];
    const invalidCustomers = activeCustomers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Filter customers with closingBalance > balance
    const customersAboveBalance = activeCustomers.filter(
      (customer) => customer.closingBalance > balance
    );

    if (customersAboveBalance.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No customers found with balance above ${balance}.`,
      });
    }

    // Prepare SMS messages
    const messages = customersAboveBalance.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === CustomerType.POSTPAID
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Pay via ${paybill}, acct: ${customer.phoneNumber}. ` +
        `Inquiries? ${customerCarePhoneNumber}.`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    res.status(200).json({
      success: true,
      message: `SMS sent to ${customersAboveBalance.length} customers with balance above ${balance} successfully.`,
      count: customersAboveBalance.length,
      smsResponses,
    });
  } catch (error) {
    console.error('Error in sendCustomersAboveBalance:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS to customers above balance.',
      details: error.message,
    });
  }
};

  const sendHighBalanceCustomers = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required.' });
    }

    // Fetch active customers for the specific tenant
    const activeCustomers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
      },
      select: {
        id: true, // For error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = activeCustomers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Filter customers with high balances (balance > 1.5x monthly charge)
    const highBalanceCustomers = activeCustomers.filter(
      (customer) => customer.closingBalance > customer.monthlyCharge * 1.5
    );

    if (highBalanceCustomers.length === 0) {
      return res.status(200).json({ success: true, message: 'No high balance customers found.' });
    }

    // Prepare messages for high balance customers
    const messages = highBalanceCustomers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Please settle promptly to avoid service disruption. ` +
        `Pay via ${paybill}, acct: ${customer.phoneNumber}. Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send bulk SMS
    try {
      const smsResponses = await sendSms(tenantId, messages);
      res.status(200).json({
        success: true,
        message: 'SMS sent to high balance customers successfully.',
        count: messages.length,
        smsResponses,
      });
    } catch (smsError) {
      console.error('Failed to send bulk SMS:', smsError.message);
      res.status(500).json({
        success: false,
        message: 'Failed to send SMS to high balance customers.',
        details: smsError.message,
      });
    }
  } catch (error) {
    console.error('Error in sendHighBalanceCustomers:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error processing high balance customers.',
      details: error.message,
    });
  }
};



const sendCustomersAboveBalanceCoreWaste = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { balance } = req.body;

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
     const threshold = parseFloat(balance);
    if (threshold === undefined || isNaN(threshold) || threshold < 0) {
      throw new Error('A valid balance amount is required');
    }

    const paybill = await getShortCode(tenantId);
    const { phoneNumber: customerCarePhoneNumber } = await fetchTenant(tenantId);
  

    const customersAboveBalance = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        closingBalance: { gt: threshold },
      },
      select: {
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
      },
    });

    if (customersAboveBalance.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: `No customers found with balance above ${balance}.` });
    }

    const messages = customersAboveBalance.map((customer) => {
      const outstandingBalance = customer.closingBalance - customer.monthlyCharge;
      let balanceText;

      if (outstandingBalance < 0) {
        // Overpayment case
        balanceText = `you have an overpayment of KES ${Math.abs(outstandingBalance)}`;
      } else if (outstandingBalance === 0) {
        // Exactly zero arrears
        balanceText = `you have Ksh 0 previous arrears`;
      } else {
        // Positive arrears
        balanceText = `your previous arrears is KES ${outstandingBalance}`;
      }

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message: `Dear ${customer.firstName}, your monthly bill is KES ${customer.monthlyCharge}, ${balanceText}. Paybill: ${paybill}, account: ${customer.phoneNumber}. Inquiries? ${customerCarePhoneNumber}`,
      };
    });

    await sendSms(tenantId, messages);

    return res.status(200).json({
      success: true,
      message: `SMS sent to ${messages.length} customers with balance above ${balance}.`,
      count: messages.length,
    });
  } catch (error) {
    console.error('Error in sendCustomersAboveBalance:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};




  
const sendCustomersAboveBalanceDetailed = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { balance, message } = req.body;

    if (!tenantId) throw new Error('Tenant ID is required');
    if (balance === undefined || isNaN(balance) || balance < 0) {
      throw new Error('A valid balance amount is required');
    }
    if (!message || typeof message !== 'string') {
      throw new Error('A message text is required');
    }

    // const paybill = await getShortCode(tenantId);
    // const { phoneNumber: customerCarePhoneNumber } = await fetchTenant(tenantId);

    // fetch all active customers for this tenant
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: { phoneNumber: true, closingBalance: true },
    });

    const customersAboveBalance = activeCustomers.filter(c => c.closingBalance > balance);
    if (!customersAboveBalance.length) {
      return res
        .status(404)
        .json({ success: false, message: `No customers found with balance above ${balance}.` });
    }

    // build SMS payloads using the exact message you passed in
    const messages = customersAboveBalance.map(customer => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber),
      message, 
    }));

    await sendSms(tenantId, messages);

    res.status(200).json({
      success: true,
      message: `Sent SMS to ${messages.length} customers with balance above ${balance}.`,
      count: messages.length,
    });

  } catch (error) {
    console.error('Error in sendCustomersAboveBalanceDetailed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

  


const sendLowBalanceCustomers = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required.' });
    }

    // Fetch active customers with non-negative balances
    const lowBalanceCustomers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        closingBalance: { gte: 0 }, // Include zero or positive balances
      },
      select: {
        id: true, // For error reporting
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = lowBalanceCustomers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Filter customers with 0 <= closingBalance < monthlyCharge
    const filteredLowBalanceCustomers = lowBalanceCustomers.filter(
      (customer) => customer.closingBalance < customer.monthlyCharge
    );

    if (filteredLowBalanceCustomers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No low balance customers found.',
      });
    }

    // Prepare SMS messages
    const messages = filteredLowBalanceCustomers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Pay via ${paybill}, acct: ${customer.phoneNumber}. Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send bulk SMS
    try {
      const smsResponses = await sendSms(tenantId, messages);
      res.status(200).json({
        success: true,
        message: 'SMS sent to low balance customers successfully.',
        count: messages.length,
        smsResponses,
      });
    } catch (smsError) {
      console.error('Failed to send bulk SMS:', smsError.message);
      res.status(500).json({
        success: false,
        message: 'Failed to send SMS to low balance customers.',
        details: smsError.message,
      });
    }
  } catch (error) {
    console.error('Error in sendLowBalanceCustomers:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error processing low balance customers.',
      details: error.message,
    });
  }
};


  

  const harshBillReminder = async (req, res) => {
  const { tenantId } = req.user;
  const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);

  try {
    // Fetch active customers with closingBalance > 2x monthlyCharge
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
        closingBalance: {
          gt: prisma.literal('2 * "monthlyCharge"'), // Compare closingBalance > 2 * monthlyCharge
        },
      },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
        customerType: true,
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers with significant overdue balances.' });
    }

    // Validate customerType for each customer
    const validCustomerTypes = ['PREPAID', 'POSTPAID'];
    const invalidCustomers = customers.filter(
      (customer) => !validCustomerTypes.includes(customer.customerType)
    );
    if (invalidCustomers.length > 0) {
      return res.status(400).json({
        error: `Invalid customerType for some customers. Must be one of: ${validCustomerTypes.join(', ')}.`,
        invalidCustomerIds: invalidCustomers.map((c) => c.id),
      });
    }

    // Prepare harsher SMS messages
    const messages = customers.map((customer) => {
      // Get billing month in Kenyan time (Africa/Nairobi)
      const currentDate = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
      });
      const billingDate = customer.customerType === 'POSTPAID'
        ? new Date(new Date(currentDate).getFullYear(), new Date(currentDate).getMonth() - 1)
        : new Date(currentDate);
      const nameOfMonth = billingDate.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'Africa/Nairobi',
      });

      // Calculate arrears and total balance
      const monthBill = customer.monthlyCharge;
      const isOverpayment = customer.closingBalance < 0;
      const isBalanceEqualToBill = customer.closingBalance === monthBill;
      const previousArrears = isOverpayment || isBalanceEqualToBill
        ? 0
        : customer.closingBalance > monthBill
        ? customer.closingBalance - monthBill
        : 0;
      const totalBalance = customer.closingBalance;

      // Format balance and arrears
      const balanceText = isOverpayment
        ? `overpayment of KES ${Math.abs(totalBalance)}`
        : `KES ${totalBalance}`;
      const arrearsText = previousArrears > 0 ? `, previous arrears KES ${previousArrears}` : '';

      // Construct harsher SMS message
      const message =
        `Dear ${customer.firstName}, your ${nameOfMonth} bill is KES ${monthBill}${arrearsText}, ` +
        `total balance ${balanceText}. Immediate action is required to avoid service disruption. ` +
        `Pay via ${paybill}, acct: ${customer.phoneNumber}. Inquiries? ${customerSupport}`;

      return {
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      };
    });

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message
    res.status(200).json({ message: 'Harsh bill reminders sent to customers with high balances.', smsResponses });
  } catch (error) {
    console.error('Error sending harsh bill reminders:', error);
    res.status(500).json({ error: 'Failed to send harsh bill reminders.', details: error.message });
  }
};
  
  
  

module.exports = {
  getShortCode,
  getSMSConfigForTenant,
  sendBills,
  sendToAll,
  sendBill,
  sendBillPerDay,
  sendToGroup,
  sendSMS,
  sendToOne,
  billReminderPerDay,
  billReminderForAll,
  harshBillReminder,

  checkSmsBalance,
  getSmsBalance,
  sendUnpaidCustomers,

  sendLowBalanceCustomers,
  sendBillsEstate,
  sendToEstate,

  sendHighBalanceCustomers,
  sendCustomersAboveBalance,
  sendDetailedBill,
  sendCustomersAboveBalanceDetailed,
  sendCustomersAboveBalanceCoreWaste 
};