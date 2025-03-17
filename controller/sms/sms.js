const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const {getSMSConfigForTenant }= require('../smsConfig/getSMSConfig.js')
const {fetchTenant} = require('../tenants/tenantupdate.js')
const { v4: uuidv4 } = require('uuid');


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
  
    console.log(`Checking SMS balance with apiKey: ${apiKey} and partnerId: ${partnerId}`);
  
    try {
      const response = await axios.post(SMS_BALANCE_URL, {
        apikey: apiKey,
        partnerID: partnerId,
      });
      console.log('SMS balance:', response.data.balance);
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



const getSmsBalance = async (req,res) => {

    const { tenantId } = req.user; 
    const { apikey,partnerID } = await getSMSConfigForTenant(tenantId);

    console.log(`this is the api key ${apikey}`);

  
    try {
      const response = await axios.post(SMS_BALANCE_URL, {
        apikey: apikey,
        partnerID: partnerID,
      });
      console.log('SMS balance:', response.data.credit);

      res.status(200).json({ credit: response.data.credit });
   
    } catch (error) {
      console.error('Error checking SMS balance:', error.response?.data || error.message);
      throw new Error('Failed to retrieve SMS balance');
    }
  };
  




const sendToOne = async (req, res) => {

    const { tenantId } = req.user; 
    console.log(`this is the tenant id ${tenantId}`);

  const { mobile, message } = req.body;
  try {
      const response = await sendSMS(tenantId,mobile, message);
      res.status(200).json({ success: true, response });
  } catch (error) {
      console.error('Error in sendToOne:', error.message);
      res.status(500).json({ success: false, message: error.message });
  }
};




const sendSMS = async (tenantId, mobile, message) => {
    console.log(`Sending SMS to ${mobile}`);
    let clientsmsid;
  
    try {
      // Fetch SMS configuration for the tenant
      const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);
  
    
  
      // Sanitize phone number
      const sanitizedPhoneNumber = sanitizePhoneNumber(mobile);
  
      // Fetch the customer ID from the database
      
  
      // Generate unique clientsmsid
      clientsmsid = uuidv4();
  
      console.log(`Creating SMS record with clientsmsid: ${clientsmsid} for customerId:`);
  
      // Create SMS record in the database
      const smsRecord = await prisma.sMS.create({
        data: {
          tenantId, // ✅ Add this line
          clientsmsid,
          mobile: sanitizedPhoneNumber,
          message,
          status: 'sent',
        },
      });
      
  
      console.log(`SMS record created: ${JSON.stringify(smsRecord)}`);
  
      // Prepare SMS payload
      const payload = {
        apikey,
        partnerID,
       
        message,
        shortcode:shortCode,
        mobile
      };
  
      console.log(`Sending SMS with payload: ${JSON.stringify(payload)}`);
  
      // Send SMS
     
      try {
        const response = await axios.post(SMS_ENDPOINT, payload);
        console.log(`SMS sent successfully to ${mobile}:`, response.data);
        return response.data;
      } catch (error) {
        console.error('Error sending SMS:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
          mobile,
        });
        throw new Error('Failed to send SMS');
      }
      

  
      console.log('SMS sent successfully. Updating status to "sent".');
  
      // Update SMS record to "sent"
      await prisma.sMS.update({
        where: { id: smsRecord.id },
        data: { status: 'sent' },
      });
  
      return response.data;
    } catch (error) {
      console.error('Error sending SMS:', {
        message: error.message,
        stack: error.stack,
        mobile,
      });
  
      // Handle failed SMS
      if (clientsmsid) {
        try {
          await prisma.sMS.update({
            where: { clientsmsid },
            data: { status: 'failed' },
          });
          console.log(`SMS status updated to "failed" for clientsmsid: ${clientsmsid}`);
        } catch (updateError) {
          console.error('Error updating SMS status to "failed":', updateError.message);
        }
      }
  
      throw new Error(error.response ? error.response.data : 'Failed to send SMS.');
    }
  };
  











// Send bills to all active customers
const sendBills = async (req, res) => {
    const { tenantId } = req.user; 

    const { customerSupportPhoneNumber:customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);
  try {
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
    });

    const messages = activeCustomers.map((customer) => {
      const message = `Dear ${customer.firstName},your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No:${paybill};your phone number,is the account number.Inquiries? call:${customerSupport}.Thank you for being a loyal customer.`;
      return { phoneNumber: customer.phoneNumber, message };
    });

    const smsResponses = await sendSms(tenantId,messages);

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
    });

    if (!activeCustomers || activeCustomers.length === 0) {
      return res.status(404).json({
        message: `No active customers found for tenant ${tenantId} in estate ${estateName}.`,
      });
    }

    // Prepare SMS messages for the customers in the specified estate
    const messages = activeCustomers.map((customer) => {
      const message = `Dear ${customer.firstName}, your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}. Use paybill No: ${paybill}; your phone number is the account number. Inquiries? Call: ${customerSupport}. Thank you for being a loyal customer.`;
      return { phoneNumber: customer.phoneNumber, message };
    });

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

// Send SMS to all active customers
const sendToAll = async (req, res) => {
  const { tenantId } = req.user;
  const { message } = req.body;

  // Validate request body
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }

  try {
    // Check if SMS configuration exists for the tenant
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (!smsConfig) {
      return res.status(400).json({ error: 'Missing SMS configuration for tenant.' });
    }

    // Fetch active customers
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
    });

    if (activeCustomers.length === 0) {
      return res.status(200).json({ message: 'No active customers found.' });
    }

    // Prepare messages
    const messages = activeCustomers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message,
    }));

    // Batch size limit (set to 1000 based on API constraint)
    const batchSize = 1000;
    const smsResponses = [];

    // Process messages in batches
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const batchResponses = await sendSms(tenantId, batch);
        smsResponses.push(...batchResponses);
      } catch (batchError) {
        console.error(`Error sending batch ${i / batchSize + 1}:`, batchError);
        // Optionally, you could collect failed responses or retry the batch
        smsResponses.push(
          ...batch.map((msg) => ({
            phoneNumber: msg.phoneNumber,
            status: 'error',
            details: batchError.message,
          }))
        );
      }
    }

    // Respond with success message and all SMS responses
    res.status(200).json({
      message: `SMS sent to ${activeCustomers.length} active customers in ${Math.ceil(messages.length / batchSize)} batches.`,
      smsResponses,
    });
  } catch (error) {
    console.error('Error sending SMS to all customers:', error);
    res.status(500).json({
      error: 'Failed to send SMS to all customers.',
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
    });

    if (activeCustomers.length === 0) {
      return res.status(200).json({
        message: `No active customers found in estate ${estateName} for tenant ${tenantId}.`,
      });
    }

    // Prepare messages
    const messages = activeCustomers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
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
  console.log(`this is the customer support number ${customerSupportPhoneNumber}`);

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required.' });
  }

  try {
    // Fetch the customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Prepare the message
    const message = `Dear ${customer.firstName}, your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No :${paybill} ;your phone number is the account number.Inquiries? call: ${customerSupportPhoneNumber}.Thank you for being a loyal customer.`;
    // Call sendSms with an array



    const smsResponses = await sendSMS(tenantId,
       customer.phoneNumber, message
    );

    res.status(200).json({ message: 'Bill sent successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill:', error);
    res.status(500).json({ error: 'Failed to send bill.', details: error.message });
  }
};


// Send bill SMS for customers grouped by collection day
const sendBillPerDay = async (req, res) => {
  const { day } = req.body;
  const { tenantId } = req.user; 
  const { customerSupportPhoneNumber:customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);
  if (!day) {
    return res.status(400).json({ error: 'Day is required.' });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: { garbageCollectionDay: day.toUpperCase() },
    });

    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,

     message : `Dear ${customer.firstName}, your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No :${paybill} ;your phone number is the account number.Inquiries? call: ${customerSupport}.Thank you for being a loyal customer.`


      ,
    }));

    const smsResponses = await sendSms(tenantId,messages);

    res.status(200).json({ message: 'Bills sent for the day successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill per day:', error);
    res.status(500).json({ error: 'Failed to send bill per day.' });
  }
};




const billReminderPerDay = async (req, res) => {
  const { day } = req.body;
  const { tenantId } = req.user; 
  const { customerSupportPhoneNumber:customerSupport } = await getSMSConfigForTenant(tenantId);
  const paybill = await getShortCode(tenantId);
  if (!day) {
    return res.status(400).json({ error: 'Day is required.' });
  }

  try {
    // Fetch active customers with a closingBalance less than monthlyCharge for the specified day
    const customers = await prisma.customer.findMany({
      where: {
        garbageCollectionDay: day.toUpperCase(),
        status: 'ACTIVE', // Ensure customer is active
        closingBalance: { lt: prisma.customer.monthlyCharge }, // Check if closingBalance is less than monthlyCharge
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify for the given day.' });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message: `Dear ${customer.firstName}, your garbage collection is scheduled today. Please pay immediately to avoid service disruption. Use Paybill ${paybill}, and your phone number as the account number. Inquiries? Call ${customerSupport}.`,


    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(tenantId,messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent for the day successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminder per day:', error);
    res.status(500).json({ error: 'Failed to send bill reminders per day.' });
  }
};


const billReminderForAll = async (req, res) => {
    const { tenantId } = req.user; 
    const paybill = await getShortCode(tenantId);
  try {
    // Fetch all active customers with a closingBalance less than monthlyCharge
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE', // Ensure customer is active
        closingBalance: { lt: prisma.customer.monthlyCharge }, // Check if closingBalance is less than monthlyCharge
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify.' });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message: `Dear ${customer.firstName},you have a pending balance of $${customer.closingBalance},Help us server you better by settling your bill.Pay via ${paybill}, your phone is the the account number `,
    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(tenantId,messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent to all customers successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminders for all customers:', error);
    res.status(500).json({ error: 'Failed to send bill reminders for all customers.' });
  }
};



const harshBillReminder = async (req, res) => {
    const { tenantId } = req.user; 
    const paybill = await getShortCode(tenantId);
  try {
    // Fetch active customers with a closingBalance greater than 2x their monthlyCharge
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE', // Only active customers
        closingBalance: { gt: { multiply: prisma.customer.monthlyCharge, factor: 2 } }, // Closing balance > 2x monthly charge
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers with significant overdue balances.' });
    }

    // Prepare harsher SMS messages
    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message: `Dear ${customer.firstName}, Please settle your pending bill of ${customer.closingBalance}. Immediate action is required to avoid service disruption. Pay via ${paybill}, your phone is the the account number`,
    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(tenantId,messages);

    // Respond with success message
    res.status(200).json({ message: 'Harsh bill reminders sent to customers with high balances.', smsResponses });
  } catch (error) {
    console.error('Error sending harsh bill reminders:', error);
    res.status(500).json({ error: 'Failed to send harsh bill reminders.' });
  }
};




// Send SMS to a group of customers
const sendToGroup = async (req, res) => {
  const { day, message } = req.body;
  const { tenantId } = req.user; 


  if (!day || !message) {
    return res.status(400).json({ error: 'Day and message are required.' });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: { garbageCollectionDay: day.toUpperCase() },
    });

    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message,
    }));

    const smsResponses = await sendSms(tenantId,messages);

    res.status(200).json({ message: 'SMS sent to the group successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending SMS to group:', error);
    res.status(500).json({ error: 'Failed to send SMS to group.' });
  }
};

// Helper function to send SMS






const sendSms = async (tenantId, messages) => {
  try {
    const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);

    if (!partnerID || !apikey || !shortCode) {
      throw new Error('Missing SMS configuration for tenant.');
    }

    let allResponses = [];

    for (const msg of messages) {
      const payload = {
        apikey,
        partnerID,
        message: msg.message,
        shortcode: shortCode,
        mobile: String(msg.mobile),
      };

      console.log("📞 Sending SMS payload:", payload);

      let response;
      try {
        response = await axios.post(process.env.BULK_SMS_ENDPOINT, payload);
        console.log(`SMS sent successfully to ${payload.mobile}:`, response.data);
      } catch (error) {
        console.error(`SMS API error for ${payload.mobile}:`, error.response?.data || error.message);
        response = { data: { status: 'FAILED' } };
      }

      const smsLog = {
        clientsmsid: uuidv4(),
        tenantId,
        mobile: payload.mobile,
        message: payload.message,
        status: response.data.status === 'FAILED' ? 'FAILED' : 'SENT',
        createdAt: new Date(),
      };

      await prisma.sMS.create({ data: smsLog });
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
      const { tenantId } = req.user; // Extract tenant ID from the request
      const paybill = await getShortCode(tenantId);
      const { phoneNumber: customerCarePhoneNumber } = await fetchTenantDetails(tenantId);
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }
  
      console.log(`Fetching unpaid customers for tenant ID: ${tenantId}`);
  
      // Fetch customers for the specific tenant with an active status
      const activeCustomers = await prisma.customer.findMany({
        where: {
          status: 'ACTIVE',
          tenantId: tenantId, // Ensure customers belong to the specified tenant
        },
        select: {
          phoneNumber: true,
          firstName: true,
          closingBalance: true,
          monthlyCharge: true,
        },
      });
  
      // Filter customers with unpaid balances
      const unpaidCustomers = activeCustomers.filter(
        (customer) => customer.closingBalance > 0
      );
  
      // Create bulk SMS messages
      const messages = unpaidCustomers.map((customer) => ({
        mobile: customer.phoneNumber,
        message: `Dear ${customer.firstName}, you have an outstanding balance of ${customer.closingBalance.toFixed(
          2
        )}. Help us serve you better by always paying on time. Paybill No: ${paybill}, use your phone number as the account number. Customer support: ${customerCarePhoneNumber}.`,
      }));
  
      console.log(`Prepared ${messages.length} messages for unpaid customers.`);
  
      // Check if there are messages to send
      if (messages.length === 0) {
        return res.status(404).json({ success: false, message: 'No unpaid customers found.' });
      }
  
      // Send bulk SMS
      try {
        await sendSms(tenantId, messages);
        console.log('Bulk SMS sent successfully.');
        res.status(200).json({
          success: true,
          message: 'SMS sent to unpaid customers successfully.',
          count: messages.length,
        });
      } catch (smsError) {
        console.error('Failed to send bulk SMS:', smsError.message);
        res.status(500).json({
          success: false,
          message: 'Failed to send SMS to unpaid customers.',
        });
      }
    } catch (error) {
      console.error('Error in sendUnpaidCustomers:', error.message);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  
  const sendCustomersAboveBalance = async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { balance } = req.body;
      const paybill = await getShortCode(tenantId);
      const { phoneNumber: customerCarePhoneNumber } = await fetchTenant(tenantId);
  
      if (!tenantId) throw new Error('Tenant ID is required');
      if (balance === undefined || isNaN(balance) || balance < 0) {
        throw new Error('A valid balance amount is required');
      }
  
      console.log(`Fetching customers above balance ${balance} for tenant ID: ${tenantId}`);
  
      const activeCustomers = await prisma.customer.findMany({
        where: { status: 'ACTIVE', tenantId },
        select: { phoneNumber: true, firstName: true, closingBalance: true, monthlyCharge: true },
      });
  
      const customersAboveBalance = activeCustomers.filter(
        (customer) => customer.closingBalance > balance
      );
  
      const messages = customersAboveBalance.map((customer) => ({
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message: `Dear ${customer.firstName}, your outstanding balance is KSH.${customer.closingBalance.toFixed(2)}, your monthly charge is KSH.${customer.monthlyCharge.toFixed(2)}. Use Paybill No: ${paybill}, use your phone number as the account number. For any concern, call us on: ${sanitizePhoneNumber(customerCarePhoneNumber)}.`,
      }));
  
      console.log("📞 Prepared messages:", messages);
  
      if (messages.length === 0) {
        return res.status(404).json({ success: false, message: `No customers found with balance above ${balance}.` });
      }
  
      await sendSms(tenantId, messages);
      console.log('SMS sent successfully.');
      res.status(200).json({
        success: true,
        message: `SMS sent to customers with balance above ${balance} successfully.`,
        count: messages.length,
      });
    } catch (error) {
      console.error('Error in sendCustomersAboveBalance:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  


  const sendLowBalanceCustomers = async (req, res) => {
    try {
      const { tenantId } = req.user;
      const paybill = await getShortCode(tenantId);
      const { phoneNumber: customerCarePhoneNumber } = await fetchTenantDetails(tenantId);
      if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID is required.' });
      }
  
      console.log(`Fetching low balance customers for tenant ID: ${tenantId}`);
  
      // Fetch active customers for the tenant
      const activeCustomers = await prisma.customer.findMany({
        where: {
          status: 'ACTIVE',
          tenantId: tenantId, // Filter by tenant ID
        },
        select: {
          phoneNumber: true,
          firstName: true,
          closingBalance: true,
          monthlyCharge: true,
        },
      });
  
      // Filter customers with low balance
      const lowBalanceCustomers = activeCustomers.filter(
        (customer) => customer.closingBalance < customer.monthlyCharge
      );
  
      // Create SMS messages for low balance customers
      const messages = lowBalanceCustomers.map((customer) => ({
        mobile: customer.phoneNumber,
        message: `Dear ${customer.firstName}, your balance is ${customer.closingBalance.toFixed(
          2
        )}. Help us serve you better by always paying on time. Paybill No:${paybill}, use your phone number as the account number. Customer support: ${customerCarePhoneNumber}.`,
      }));
  
      console.log(`Prepared ${messages.length} messages for low balance customers.`);
  
      // Check if there are messages to send
      if (messages.length === 0) {
        return res.status(404).json({ success: false, message: 'No low balance customers found.' });
      }
  
      // Send bulk SMS
      try {
        await sendSms(tenantId, messages); // Send all messages in one API call
        console.log('Bulk SMS sent successfully.');
        res.status(200).json({
          success: true,
          message: 'SMS sent to low balance customers successfully.',
          count: messages.length,
        });
      } catch (smsError) {
        console.error('Failed to send bulk SMS:', smsError.message);
        res.status(500).json({
          success: false,
          message: 'Failed to send SMS to low balance customers.',
        });
      }
    } catch (error) {
      console.error('Error in sendLowBalanceCustomers:', error.message);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  

  const sendHighBalanceCustomers = async (req, res) => {
    try {
      const { tenantId } = req.user; // Extract tenant ID from req.user
      const paybill = await getShortCode(tenantId);
      const { phoneNumber: customerCarePhoneNumber } = await fetchTenantDetails(tenantId);
    
      if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID is required.' });
      }
  
      console.log(`Fetching high balance customers for tenant ID: ${tenantId}`);
  
      // Fetch active customers for the specific tenant
      const activeCustomers = await prisma.customer.findMany({
        where: {
          status: 'ACTIVE',
          tenantId: tenantId, // Filter by tenant ID
        },
        select: {
          phoneNumber: true,
          firstName: true,
          closingBalance: true,
          monthlyCharge: true,
        },
      });
  
      // Filter customers with high balances (balance > 1.5x monthly charge)
      const highBalanceCustomers = activeCustomers.filter(
        (customer) => customer.closingBalance > customer.monthlyCharge * 1.5
      );
  
      // Prepare messages for high balance customers
      const messages = highBalanceCustomers.map((customer) => ({
        mobile: customer.phoneNumber,
        message: `Dear ${customer.firstName}, your current balance is ${customer.closingBalance.toFixed(
          2
        )}, which is quite high. Help us serve you better by always paying on time. Paybill No: ${paybill}, use your phone number as the account number. Customer support: ${customerCarePhoneNumber}.`,
      }));
  
      console.log(`Prepared ${messages.length} messages for high balance customers.`);
  
      // Check if there are messages to send
      if (messages.length === 0) {
        return res.status(404).json({ success: false, message: 'No high balance customers found.' });
      }
  
      // Send bulk SMS
      try {
        await sendSms(tenantId, messages); // Send all messages in one API call
        console.log('Bulk SMS sent successfully.');
        res.status(200).json({
          success: true,
          message: 'SMS sent to high balance customers successfully.',
          count: messages.length,
        });
      } catch (smsError) {
        console.error('Failed to send bulk SMS:', smsError.message);
        res.status(500).json({
          success: false,
          message: 'Failed to send SMS to high balance customers.',
        });
      }
    } catch (error) {
      console.error('Error in sendHighBalanceCustomers:', error.message);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  

      
  
  
  

module.exports = {
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

  sendHighBalanceCustomers,sendCustomersAboveBalance
};