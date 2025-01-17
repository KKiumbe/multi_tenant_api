const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const {getSMSConfigForTenant }= require('../smsConfig/getSMSConfig.js')
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

// const SMS_API_KEY = process.env.SMS_API_KEY;
// const PARTNER_ID = process.env.PARTNER_ID;
// const SHORTCODE = process.env.SHORTCODE;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const BULK_SMS_ENDPOINT = process.env.BULK_SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;

const paybill = process.env.PAYBILL;
// const customerSupport =  process.env.CUSTOMER_SUPPORT;








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
      return response.data.credit;
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
          clientsmsid,
         
          mobile: sanitizedPhoneNumber,
          message,
          status: 'pending',
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

// Send SMS to all active customers
const sendToAll = async (req, res) => {
    const { tenantId } = req.user; 
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
    });

    const messages = activeCustomers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message,
    }));

    const smsResponses = await sendSms(tenantId,messages);

    res.status(200).json({ message: 'SMS sent to all active customers.', smsResponses });
  } catch (error) {
    console.error('Error sending SMS to all customers:', error);
    res.status(500).json({ error: 'Failed to send SMS to all customers.' });
  }
};

// Send bill SMS for a specific customer
const sendBill = async (req, res) => {
  const { customerId } = req.body;
  const { tenantId } = req.user; 
  const { customerSupportPhoneNumber:customerSupport } = await getSMSConfigForTenant(tenantId);

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
    const message = `Dear ${customer.firstName}, your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No :${paybill} ;your phone number is the account number.Inquiries? call: ${customerSupport}.Thank you for being a loyal customer.`;
    // Call sendSms with an array
    const smsResponses = await sendSms(tenantId,[
      { phoneNumber: customer.phoneNumber, message },
    ]);

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
    // Fetch tenant-specific SMS configuration
    const { partnerID, apiKey, shortCode } = await getSMSConfigForTenant(tenantId);
  
    // Prepare the SMS payload
    const smsList = messages.map((msg) => ({
      partnerID: partnerID,
      apikey: apiKey,
      pass_type: 'plain',
      clientsmsid: uuidv4(),
      message: msg.message,
      shortcode: shortCode,
      mobile: sanitizePhoneNumber(msg.phoneNumber),
    }));
  
    const response = await axios.post(process.env.BULK_SMS_ENDPOINT, {
      count: smsList.length,
      smslist: smsList,
    });
  
    return response.data;
  };
  


  const sendUnpaidCustomers = async (req, res) => {
    try {
      const { tenantId } = req.user; // Extract tenant ID from the request
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
        )}. Help us serve you better by always paying on time. Paybill No: 4107197, use your phone number as the account number. Customer support: 0726594923.`,
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
  


  const sendLowBalanceCustomers = async (req, res) => {
    try {
      const { tenantId } = req.user;
  
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
        )}. Help us serve you better by always paying on time. Paybill No: 4107197, use your phone number as the account number. Customer support: 0726594923.`,
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
        )}, which is quite high. Help us serve you better by always paying on time. Paybill No: 4107197, use your phone number as the account number. Customer support: 0726594923.`,
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

  sendHighBalanceCustomers
};