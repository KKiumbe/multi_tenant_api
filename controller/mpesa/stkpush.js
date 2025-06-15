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

    if (!link.customer || !link.customer.phoneNumber || !link.customer.id) {
      return res.status(400).send('Invalid customer data');
    }

    if (!link.tenant || !link.tenant.name) {
      return res.status(400).send('Invalid tenant data');
    }

    const defaultAmount = link.customer.closingBalance || 0;
    const amount = Number(defaultAmount).toFixed(2);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).send('Invalid balance');
    }

    const apiBaseUrl = process.env.APP_URL || 'http://localhost:5000';

    const sanitizeHtml = require('sanitize-html');
    const sanitizedPhone = sanitizeHtml(link.customer.phoneNumber);
    const sanitizedToken = sanitizeHtml(link.token);
    const sanitizedFirstName = sanitizeHtml(link.customer.firstName || 'Customer');
    const sanitizedTenantName = sanitizeHtml(link.tenant.name);

    res.set('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <meta name="theme-color" content="#28a745" />
          <title>Pay ${sanitizedTenantName}</title>
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
              height: 100%;
              width: 100%;
              background: var(--bg);
              color: var(--text);
              font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
              font-size: 18px;
              display: flex;
              justify-content: center;
              align-items: center;
              overflow: hidden;
            }
            .card {
              width: 96vw;
              max-width: 550px;
              max-height: 92vh;
              background: var(--card-bg);
              border-radius: 24px;
              box-shadow: 0 6px 20px rgba(0,0,0,0.1);
              padding: 28px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow-y: auto;
            }
            .header {
              text-align: center;
              margin-bottom: 16px;
            }
            h1 {
              font-size: 2rem;
              font-weight: 700;
              margin-bottom: 10px;
            }
            .message {
              font-size: 1rem;
              color: var(--primary);
              font-style: italic;
              margin-bottom: 12px;
            }
            .balance {
              font-size: 1rem;
              color: var(--text-light);
              margin-bottom: 10px;
              text-align: center;
            }
            .hint {
              font-size: 0.95rem;
              color: var(--text-light);
              margin-top: 4px;
              text-align: center;
              display: block;
            }
            .input-group {
              margin-bottom: 16px;
            }
            label {
              font-size: 1rem;
              font-weight: 600;
              display: block;
              margin-bottom: 6px;
            }
            input {
              width: 100%;
              padding: 14px;
              font-size: 1.25rem;
              border: 1px solid var(--border);
              border-radius: 10px;
              background: var(--card-bg);
              color: var(--text);
              outline: none;
            }
            input:focus {
              border-color: var(--primary);
              box-shadow: 0 0 0 3px rgba(40,167,69,0.1);
            }
            .error {
              font-size: 0.875rem;
              color: var(--danger);
              margin-top: 6px;
              display: none;
            }
            .error.show {
              display: block;
            }
            .button-group {
              display: flex;
              flex-direction: column;
              gap: 12px;
              margin-top: 12px;
            }
            button {
              background: var(--primary);
              color: white;
              border: none;
              border-radius: 10px;
              padding: 16px;
              font-size: 1.125rem;
              font-weight: 600;
              cursor: pointer;
            }
            button:hover {
              background: var(--primary-dark);
            }
            button:active {
              transform: scale(0.98);
            }
            button.cancel-btn {
              background: var(--danger);
            }
            button.cancel-btn:hover {
              background: var(--danger-dark);
            }
            .status {
              margin-top: 12px;
              font-size: 1rem;
              min-height: 1.25rem;
              color: var(--text-light);
              text-align: center;
            }
            .success {
              color: var(--primary);
            }
            .error {
              color: var(--danger);
            }
            .loader {
              display: none;
              margin: 12px auto;
              border: 3px solid #e0e0e0;
              border-top: 3px solid var(--primary);
              border-radius: 50%;
              width: 30px;
              height: 30px;
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
              html, body {
                font-size: 16px;
              }
              .card {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Pay ${sanitizedTenantName}</h1>
              <div class="message">Paying for garbage collection helps make our world cleaner and greener!</div>
            </div>
            <div class="content">
              <div class="balance">
                Balance: KES ${amount}
                <span class="hint">Don’t have the full amount? You can edit the amount to pay.</span>
              </div>
              <form id="payment-form" data-phone="${sanitizedPhone}" data-token="${sanitizedToken}" data-api-url="${apiBaseUrl}" data-first-name="${sanitizedFirstName}" class="input-group" novalidate>
                <label for="amount">Amount (KES)</label>
                <input type="number" id="amount" value="${amount}" min="1" max="150000" step="0.01" required aria-describedby="amount-error" inputmode="decimal" />
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
     
       const response = await axios.post(
        `${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      console.log('STK Push HTTP status:',   response.status);
      console.log('STK Push response headers:', response.headers);
      console.log('STK Push response body:',    JSON.stringify(response.data, null, 2));

      const data = response.data;

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

  await prisma.paymentLink.update({
  where: { checkoutRequestId },
  data: {
    expiresAt: new Date(),
    paid:      true
  }
});

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
  const { checkoutRequestId } = req.params;

  const link = await prisma.paymentLink.findUnique({
    where: { checkoutRequestId },
    select: { paid: true }
  });

  if (!link) {
    return res.status(404).json({ error: 'Payment link not found' });
  }

  if (link.paid) {
    return res.json({ status: 'completed' });
  } else if (link.expiresAt < new Date()) {
    return res.json({ status: 'failed' });
  } else {
    return res.json({ status: 'pending' });
  }
}







module.exports = {
  generatePaymentLink,
  renderPayPage,
  stkPush,
  stkCallback,checkPaymentStatus
}
