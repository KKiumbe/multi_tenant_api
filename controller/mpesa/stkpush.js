// src/controllers/mpesaController.js
const { v4: uuidv4 } = require('uuid');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getAccessToken } = require('./token');
const { settleInvoice } = require('./paymentSettlement');
const axios = require('axios');
const { getTenantSettings } = require('./mpesaConfig');



async function generatePaymentLink(customerId, tenantId) {
  if (!process.env.APP_URL) {
    throw new Error('APP_URL environment variable is not set');
  }

  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 2); // Set expiration to 2 months from now

  await prisma.paymentLink.create({
    data: { token, tenantId, customerId, expiresAt },
  });

  return `${process.env.APP_URL}/pay/${token}`;
}






// Render pay page
async function renderPayPage(req, res, next) {
  try {
    const link = await prisma.paymentLink.findUnique({
      where: { token: req.params.token }, include: { customer: true }
    });
    if (!link || link.expiresAt < new Date()) return res.status(404).send('Link expired');
    const amount = link.customer.closingBalance.toFixed(2);
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Pay KES ${amount}</title></head><body>
      <h1>Your balance: KES ${amount}</h1>
      <button id="pay">Pay Now</button>
      <script>
        document.getElementById('pay').onclick = () => {
          fetch('/api/mpesa/stkpush', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              amount: ${amount},
              phoneNumber: '${link.customer.phoneNumber}',
              accountReference: '${link.token}',
              transactionDesc: 'Balance payment'
            })
          })
          .then(r=>r.json()).then(()=>alert('Prompt sent')).catch(()=>alert('Error'));
        };
      </script></body></html>
    `);
  } catch (err) { next(err); }
}



async function stkPush(req, res, next) {
  try {
    // extract fields from request body
    const { amount, phoneNumber, accountReference: token, transactionDesc } = req.body;

    // look up tenantId by payment link token
    const link = await prisma.paymentLink.findUnique({
      where: { token },
      select: { tenantId: true }
    });
    if (!link) {
      return res.status(400).json({ error: 'Invalid payment link token' });
    }
    const tenantId = link.tenantId;

    // fetch MPESA config for this tenant
    const {shortCode,passKey} =  getTenantSettings(tenantId);

    if (!shortCode || !passKey) {
      return res.status(400).json({ error: 'MPESA configuration not found for this tenant' });
    }
  

    // get OAuth token
    const accessToken = await getAccessToken(tenantId);

    // build STK Push password and payload
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0,14);
    const password = Buffer.from(shortCode + passKey + timestamp).toString('base64');
    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phoneNumber.replace(/^0/, '254'),
      PartyB: shortCode,
      PhoneNumber: phoneNumber.replace(/^0/, '254'),
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: token,
      TransactionDesc: transactionDesc
    };

    // send STK Push request
    const { data } = await axios.post(
      `${process.env.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // persist STK request IDs on the link
    await prisma.paymentLink.update({
      where: { token },
      data: {
        merchantRequestId: data.MerchantRequestID,
        checkoutRequestId: data.CheckoutRequestID
      }
    });

    // respond with Safaricom's immediate response
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// STK Callback
async function stkCallback(req, res) {
  // Acknowledge immediately to M-Pesa
  res.status(200).end();

  try {
    const cb = req.body.Body?.stkCallback;
    if (!cb || cb.ResultCode !== 0) {
      console.log(`STK Callback failed: ResultCode ${cb.ResultCode}, ${cb.ResultDesc}`);
      return;
    }

    const checkoutRequestId = cb.CheckoutRequestID;
    if (!checkoutRequestId) {
      console.error('Missing CheckoutRequestID in callback');
      return;
    }

    // Find payment link
    const link = await prisma.paymentLink.findUnique({
      where: { checkoutRequestId },
      include: { customer: true },
    });
    if (!link) {
      console.error(`No payment link found for CheckoutRequestID ${checkoutRequestId}`);
      return;
    }

    // Extract callback metadata
    const items = cb.CallbackMetadata?.Item;
    if (!items) {
      console.error('Missing CallbackMetadata in callback');
      return;
    }

    const amount = parseFloat(items.find(i => i.Name === 'Amount')?.Value);
    const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const phone = items.find(i => i.Name === 'PhoneNumber')?.Value;
    const transactionDate = items.find(i => i.Name === 'TransactionDate')?.Value;

    if (!amount || !receipt || !phone || !transactionDate) {
      console.error('Missing required callback metadata');
      return;
    }

    // Format transaction date (YYYYMMDDHHMMSS to Date)
    const transTime = new Date(
      `${transactionDate.slice(0, 4)}-${transactionDate.slice(4, 6)}-${transactionDate.slice(6, 8)}T${transactionDate.slice(8, 10)}:${transactionDate.slice(10, 12)}:${transactionDate.slice(12, 14)}`
    );

    // Use customer's phone number as BillRefNumber
    const billRefNumber = phone; // e.g., "254708920430"

    // Check for duplicate transaction
    const existingTransaction = await prisma.mPESATransactions.findUnique({
      where: { TransID: receipt },
    });
    if (existingTransaction) {
      console.log(`Duplicate transaction ${receipt}. Skipping.`);
      return;
    }

    // Store transaction in mPESATransactions
    await prisma.mPESATransactions.create({
      data: {
        BillRefNumber: billRefNumber,
        TransAmount: amount.toString(),
        FirstName: link.customer.firstName || 'Unknown',
        MSISDN: phone,
        TransID: receipt,
        TransTime: transTime,
        processed: false,
        mpesaConfig: {
          connect: { tenantId: link.tenantId }, // Link to tenant's M-Pesa config
        },
      },
    });

    // Call settleInvoice to process the transaction
    await settleInvoice();

    console.log(`STK Callback processed for CheckoutRequestID ${checkoutRequestId}`);
  } catch (err) {
    console.error('STK Callback error:', err.message);
  }
}

module.exports = { stkCallback };




module.exports = {
  generatePaymentLink,
  renderPayPage,
  stkPush,
  stkCallback
}
