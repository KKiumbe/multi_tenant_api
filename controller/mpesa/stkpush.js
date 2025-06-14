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

    // Fetch payment link with customer and tenant details
    const link = await prisma.paymentLink.findUnique({
      where: { token },
      include: {
        customer: {
          select: {
            id: true,
            phoneNumber: true,
            closingBalance: true,
            firstName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!link || link.expiresAt < new Date()) {
      return res.status(404).send('Payment link expired or invalid');
    }

    // Validate customer and tenant data
    if (!link.customer || !link.customer.phoneNumber || !link.customer.id) {
      return res.status(400).send('Invalid customer data');
    }
    if (!link.tenant || !link.tenant.name) {
      return res.status(400).send('Invalid tenant data');
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
    const sanitizedFirstName = sanitizeHtml(link.customer.firstName || 'Customer');
    const sanitizedTenantName = sanitizeHtml(link.tenant.name);

    // Render full-screen mobile payment prompt
    res.set('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <meta name="description" content="Pay your ${sanitizedTenantName} bill for garbage collection.">
          <meta name="theme-color" content="#28a745">
          <title>Pay ${sanitizedTenantName}</title>
          <link rel="icon" href="/favicon.ico" type="image/x-icon">
          <style>
            :root {
              --primary: #28a745;
              --primary-dark: #218838;
              --danger: #dc3545;
              --danger-dark: #c82333;
              --text: #333;
              --text-light: #666;
              --bg: #f5f5f5;
              --card-bg: #fff;
              --border: #ccc;
            }
            @media (prefers-color-scheme: dark) {
              :root {
                --text: #ddd;
                --text-light: #aaa;
                --bg: #1a1a1a;
                --card-bg: #2a2a2a;
                --border: #444;
              }
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              height: 100vh;
              width: 100vw;
              overflow: hidden;
              font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
              background: var(--bg);
              color: var(--text);
              -webkit-font-smoothing: antialiased;
              touch-action: none;
            }
            .container {
              height: 100vh;
              width: 100vw;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: var(--card-bg);
              padding: 24px;
              border-radius: 0;
              box-shadow: none;
            }
            .header {
              flex: 0;
              text-align: center;
            }
            .logo {
              width: 56px;
              height: 56px;
              margin-bottom: 12px;
            }
            h1 {
              font-size: 1.5rem;
              font-weight: 600;
              margin-bottom: 8px;
            }
            .message {
              font-size: 1rem;
              color: var(--primary);
              font-style: italic;
              margin-bottom: 12px;
            }
            .content {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              text-align: center;
            }
            .balance {
              font-size: 1rem;
              color: var(--text-light);
              margin-bottom: 24px;
            }
            .input-group {
              margin-bottom: 24px;
              text-align: left;
            }
            label {
              font-size: 1rem;
              font-weight: 500;
              display: block;
              margin-bottom: 8px;
            }
            input {
              width: 100%;
              padding: 16px;
              font-size: 1.25rem;
              border: 1px solid var(--border);
              border-radius: 8px;
              background: var(--card-bg);
              color: var(--text);
              outline: none;
              transition: border-color 0.2s, box-shadow 0.2s;
            }
            input:focus {
              border-color: var(--primary);
              box-shadow: 0 0 0 3px rgba(40,167,69,0.1);
            }
            .error {
              font-size: 0.875rem;
              color: var(--danger);
              margin-top: 8px;
              display: none;
            }
            .error.show {
              display: block;
            }
            .footer {
              flex: 0;
            }
            .button-group {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
            }
            button {
              background: var(--primary);
              color: #fff;
              border: none;
              border-radius: 8px;
              padding: 18px;
              font-size: 1.125rem;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s, transform 0.1s;
              touch-action: manipulation;
            }
            button:hover {
              background: var(--primary-dark);
            }
            button:active {
              transform: scale(0.98);
            }
            button:disabled {
              background: #ccc;
              cursor: not-allowed;
            }
            .cancel-btn {
              background: var(--danger);
            }
            .cancel-btn:hover {
              background: var(--danger-dark);
            }
            .status {
              margin-top: 16px;
              font-size: 1rem;
              min-height: 1.5rem;
              color: var(--text-light);
            }
            .success {
              color: var(--primary);
            }
            .error {
              color: var(--danger);
            }
            .loader {
              display: none;
              margin: 16px auto;
              border: 4px solid #e0e0e0;
              border-top: 4px solid var(--primary);
              border-radius: 50%;
              width: 32px;
              height: 32px;
              animation: spin 1s linear infinite;
            }
            .loader.show {
              display: block;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @media (max-height: 600px) {
              .container {
                padding: 16px;
              }
              h1 {
                font-size: 1.25rem;
              }
              .message, .balance {
                font-size: 0.875rem;
              }
              input {
                padding: 12px;
                font-size: 1rem;
              }
              button {
                padding: 14px;
                font-size: 1rem;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              
              <h1>Pay are about to pay ${sanitizedTenantName}</h1>
              <div class="message">Paying for garbage collection helps make our world cleaner and greener!</div>
            </div>
            <div class="content">
              <div class="balance">Balance: KES ${amount}</div>
              <form id="payment-form" data-phone="${sanitizedPhone}" data-token="${sanitizedToken}" data-api-url="${apiBaseUrl}" data-first-name="${sanitizedFirstName}" class="input-group" novalidate>
                <label for="amount">Amount (KES)</label>
                <input type="number" id="amount" value="${amount}" min="1" max="150000" step="0.01" required aria-describedby="amount-error" inputmode="decimal">
                <div id="amount-error" class="error" role="alert"></div>
              </form>
              <div id="loader" class="loader"></div>
              <p id="status" class="status" role="status"></p>
            </div>
            <div class="footer">
              <div class="button-group">
                <button id="pay" type="submit" form="payment-form">Pay Now</button>
                <button id="cancel" class="cancel-btn" type="button">Cancel</button>
              </div>
            </div>
          </div>
          <script defer src="/scripts/payment.js"></script>
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

    // Validate amount
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    const integerAmount = Math.floor(parsedAmount);
    if (integerAmount < 1) {
      return res.status(400).json({ error: 'Amount must be at least 1' });
    }

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

    console.log(`initiating STK Push for token ${token} with amount ${integerAmount} to phone ${phoneNumber}`);

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0,14);
    const password = Buffer.from(shortCode + passKey + timestamp).toString('base64');
    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: integerAmount, // Use integer amount
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


async function stkCallback(req, res) {
  // Acknowledge immediately to M-Pesa
  res.status(200).end();

  try {
    console.log('STK Callback Request Body:', JSON.stringify(req.body, null, 2));
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

    // Find payment link with customer details to get phone number
    const link = await prisma.paymentLink.findUnique({
      where: { checkoutRequestId },
      include: {
        customer: {
          select: {
            phoneNumber: true,
            firstName: true,
          },
        },
        tenant: {
          select: {
            mpesaConfig: {
              select: {
                shortCode: true,
              },
            },
          },
        },
      },
    });
    if (!link) {
      console.error(`No payment link found for CheckoutRequestID ${checkoutRequestId}`);
      return;
    }

    if (!link.customer || !link.customer.phoneNumber) {
      console.error(`No customer or phone number found for CheckoutRequestID ${checkoutRequestId}`);
      return;
    }

    // Extract shortCode from MPESAConfig
    const shortCode = link.tenant?.mpesaConfig?.shortCode;
    if (!shortCode) {
      console.error(`No shortCode found for tenantId ${link.tenantId}`);
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
    const callbackPhone = items.find(i => i.Name === 'PhoneNumber')?.Value;
    const transactionDate = items.find(i => i.Name === 'TransactionDate')?.Value;

    // Log raw metadata for debugging
    console.log('Callback Metadata:', { amount, receipt, callbackPhone, transactionDate });

    if (!amount || !receipt || !callbackPhone || !transactionDate) {
      console.error('Missing required callback metadata:', { amount, receipt, callbackPhone, transactionDate });
      return;
    }

    // Check for duplicate transaction
    const existingTransaction = await prisma.mPESATransactions.findUnique({
      where: { TransID: receipt },
    });
    if (existingTransaction) {
      console.log(`Duplicate transaction ${receipt}. Skipping.`);
      return;
    }

    const localPhone = String(callbackPhone).startsWith('254') && String(callbackPhone).length === 12
      ? '0' + String(callbackPhone).slice(3)
      : String(callbackPhone);

    const now = new Date();
    const transTime = now.toISOString().replace('T', ' ').substring(0, 19); // "YYYY-MM-DD HH:mm:ss"

    // Store transaction in mPESATransactions
    await prisma.mPESATransactions.create({
      data: {
        BillRefNumber: localPhone,
        TransAmount: amount,
        FirstName: link.customer.firstName || 'Unknown',
        MSISDN: String(callbackPhone), // Convert to string
        TransID: receipt,
        TransTime: new Date(transTime), // Ensure TransTime is a Date object
        processed: false,
        tenantId: link.tenantId,
        ShortCode: shortCode,
      },
    });

    // Call settleInvoice with the link object
    await settleInvoice();


    console.log(`STK Callback processed for CheckoutRequestID ${checkoutRequestId}`);
  } catch (err) {
    console.error('STK Callback error:', err.message);
  }
}


async function checkPaymentStatus(req, res) {
  try {
    const { checkoutRequestId } = req.params;

    // Find the payment link to get tenantId and customerId
    const link = await prisma.paymentLink.findUnique({
      where: { checkoutRequestId },
      select: { tenantId: true, customerId: true },
    });

    if (!link) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Check if a transaction exists for this tenantId
    const transaction = await prisma.mPESATransactions.findFirst({
      where: {
        tenantId: link.tenantId,
      },
      include: {
        tenant: {
          select: {
            mpesaConfig: {
              select: { shortCode: true },
            },
          },
        },
      },
    });

    if (transaction && transaction.processed) {
      return res.json({ status: 'completed' });
    } else if (transaction) {
      return res.json({ status: 'pending' });
    } else {
      return res.json({ error: 'No transaction found', status: 'failed' });
    }
  } catch (err) {
    console.error(`Error checking payment status for ${req.params.checkoutRequestId}:`, err.message);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
}






module.exports = {
  generatePaymentLink,
  renderPayPage,
  stkPush,
  stkCallback,checkPaymentStatus
}
