// src/controllers/mpesaController.js
const { v4: uuidv4 } = require('uuid');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getAccessToken } = require('./token');
const { settleInvoice } = require('./paymentSettlement');
const axios = require('axios');
const { getTenantSettings, getTenantSettingSTK } = require('./mpesaConfig');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();


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

  return `${process.env.APP_URL}/api/pay/${token}`;
}








async function renderPayPage(req, res, next) {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).send('Payment token is required');
    }

    // Fetch payment link with customer details
    const link = await prisma.paymentLink.findUnique({
      where: { token },
      include: {
        customer: {
          select: {
            id: true,
            phoneNumber: true,
            closingBalance: true,
          },
        },
      },
    });

    if (!link || link.expiresAt < new Date()) {
      return res.status(404).send('Payment link expired or invalid');
    }

    // Validate customer data
    if (!link.customer || !link.customer.phoneNumber || !link.customer.id) {
      return res.status(400).send('Invalid customer data');
    }

    // Get closing balance as default amount
    const defaultAmount = link.customer.closingBalance || 0;
    const amount = Number(defaultAmount).toFixed(2);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).send('Invalid balance');
    }

    // Base API URL with fallback
    const apiBaseUrl = process.env.APP_URL || 'http://localhost:5000';

    // Sanitize user inputs
    const sanitizedPhone = sanitizeHtml(link.customer.phoneNumber);
    const sanitizedToken = sanitizeHtml(link.token);

    // Render mobile-optimized payment page
    res.set('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Pay Your Bill</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f5f5;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              background: white;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              padding: 20px;
              width: 100%;
              max-width: 400px;
              text-align: center;
            }
            h1 { font-size: 1.5rem; margin-bottom: 10px; }
            .balance { font-size: 1rem; color: #666; margin-bottom: 15px; }
            .input-group {
              margin-bottom: 20px;
              text-align: left;
            }
            label { font-size: 1rem; color: #333; display: block; margin-bottom: 5px; }
            input {
              width: 100%;
              padding: 10px;
              font-size: 1.1rem;
              border: 1px solid #ccc;
              border-radius: 8px;
              outline: none;
            }
            input:focus { border-color: #28a745; }
            button {
              background: #28a745;
              color: white;
              border: none;
              border-radius: 8px;
              padding: 14px;
              font-size: 1.1rem;
              cursor: pointer;
              width: 100%;
              transition: background 0.2s;
            }
            button:hover { background: #218838; }
            button:disabled { background: #ccc; cursor: not-allowed; }
            .status { margin-top: 15px; font-size: 1rem; }
            .error { color: #dc3545; }
            .loader { display: none; margin: 10px auto; border: 4px solid #f3f3f3; border-top: 4px solid #28a745; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @media (max-width: 600px) {
              .container { padding: 15px; }
              h1 { font-size: 1.3rem; }
              input, button { font-size: 1rem; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Payment Request</h1>
            <div class="balance">Balance: KES ${amount}</div>
            <div id="payment-form" data-phone="${sanitizedPhone}" data-token="${sanitizedToken}" data-api-url="${apiBaseUrl}" class="input-group">
              <label for="amount">Enter Amount (KES)</label>
              <input type="number" id="amount" value="${amount}" min="1" max="150000" step="0.01" required aria-describedby="amount-error">
              <div id="amount-error" class="error"></div>
            </div>
            <button id="pay">Pay Now</button>
            <div id="loader" class="loader"></div>
            <p id="status" class="status"></p>
          </div>
          <script src="/scripts/payment.js"></script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(`Error rendering pay page for token ${req.params.token}:`, err.message);
    res.status(500).send('An error occurred while loading the payment page');
  }
}



async function stkPush(req, res, next) {
  try {
    const { amount, phoneNumber, accountReference: token, transactionDesc } = req.body;

    const link = await prisma.paymentLink.findUnique({
      where: { token },
      select: { tenantId: true }
    });
    if (!link) {
      return res.status(400).json({ error: 'Invalid payment link token' });
    }
    const tenantId = link.tenantId;

    const { shortCode, passKey } = await getTenantSettingSTK(tenantId);
    console.log({ shortCode, passKey });

    if (!shortCode || !passKey) {
      return res.status(400).json({ error: 'MPESA configuration not found for this tenant' });
    }

    const accessToken = await getAccessToken(tenantId);

    console.log(`initiating STK Push for token ${token} with amount ${amount} to phone ${phoneNumber}`);

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

    console.log(`M-Pesa URL: ${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`);
    try {
      const { data } = await axios.post(
        `${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      await prisma.paymentLink.update({
        where: { token },
        data: {
          merchantRequestId: data.MerchantRequestID,
          checkoutRequestId: data.CheckoutRequestID
        }
      });

      res.json(data);
    } catch (axiosError) {
      console.error('Axios error details:', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
        url: `${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`
      });
      throw axiosError;
    }
  } catch (err) {
    console.error('STK Push error:', err.message);
    res.status(500).json({ error: 'Failed to initiate STK Push' });
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
