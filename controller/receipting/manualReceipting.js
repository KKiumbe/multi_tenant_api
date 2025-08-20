const { PrismaClient, ModeOfPayment } = require('@prisma/client');
const { sendSMS, getShortCode } = require('../sms/sms');
const { fetchTenant } = require('../tenants/tenantupdate');

const prisma = new PrismaClient();

function generateTransactionId() {
  const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
  return `C${randomDigits}`;
}

// Generate unique receipt number
async function generateUniqueReceiptNumber(tenantId) {
  let receiptNumber;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 5; // Reduced to prevent delays

  while (exists && attempts < maxAttempts) {
    const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
    receiptNumber = `RCPT${randomDigits}-${tenantId}`;
   
    exists = await prisma.receipt.findUnique({
      where: { receiptNumber },
    }) !== null;
   
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate unique receipt number after maximum attempts.');
  }

  return receiptNumber;
}

// Sanitize phone number
function sanitizePhoneNumber(phone) {
  if (typeof phone !== 'string') {
    console.error('Invalid phone number format:', phone);
    return '';
  }

  if (phone.startsWith('+254')) {
    return phone.slice(1);
  } else if (phone.startsWith('0')) {
    return `254${phone.slice(1)}`;
  } else if (phone.startsWith('254')) {
    return phone;
  } else {
    return `254${phone}`;
  }
}

// Process invoices and create a single receipt
async function settlePaymentInvoices(paymentAmount, customerId, paymentId, tenantId, paidBy, modeOfPayment, tx) {

  const invoices = await tx.invoice.findMany({
    where: {
      customerId,
      tenantId,
      status: { in: ['UNPAID', 'PPAID'] },
    },
    orderBy: { createdAt: 'asc' },
  });
 

  let remainingAmount = parseFloat(paymentAmount);
  const receiptEntries = [];
  let totalPaidToInvoices = 0;


  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { closingBalance: true, firstName: true, phoneNumber: true },
  });


  if (!customer) {
    throw new Error('Customer not found');
  }

  const currentBalance = customer.closingBalance || 0;

  for (const invoice of invoices) {
    if (remainingAmount <= 0) break;

    const invoiceDueAmount = invoice.invoiceAmount - invoice.amountPaid;
    const paymentForInvoice = Math.min(remainingAmount, invoiceDueAmount);

   
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: invoice.amountPaid + paymentForInvoice,
        status: invoice.amountPaid + paymentForInvoice >= invoice.invoiceAmount ? 'PAID' : 'PPAID',
        //closingBalance: invoice.closingBalance - paymentForInvoice,
      },
    });
   

    receiptEntries.push({
      invoiceId: updatedInvoice.id,
      amount: paymentForInvoice,
    });

    remainingAmount -= paymentForInvoice;
    totalPaidToInvoices += paymentForInvoice;
  }

  const newClosingBalance = currentBalance - paymentAmount;


  await tx.customer.update({
    where: { id: customerId },
    data: { closingBalance: newClosingBalance },
  });
 


  const receiptNumber = await generateUniqueReceiptNumber(tenantId);
 

  const receipt = await tx.receipt.create({
    data: {
      amount: paymentAmount,
      modeOfPayment,
      paidBy,
      transactionCode: generateTransactionId(),
      phoneNumber: customer.phoneNumber,
      paymentId,
      customerId,
      receiptInvoices: {
        create: receiptEntries.map((entry) => ({
          invoice: { connect: { id: entry.invoiceId } },
        })),
      },
      receiptNumber,
      createdAt: new Date(),
      tenantId,
    },
  });

  await tx.payment.update({
    where: { id: paymentId },
    data: { receiptId: receipt.id },
  });
 

  const receipts = [
    {
      id: receipt.id,
      receiptNumber,
      amount: paymentAmount,
      invoiceIds: receiptEntries.map((entry) => entry.invoiceId),
      remainingAmount: remainingAmount > 0 ? remainingAmount : null,
    },
  ];

  return { receipts, newClosingBalance, remainingAmount, customer };
}

const manualCashPayment = async (req, res) => {
  const { customerId, totalAmount, modeOfPayment, paidBy } = req.body;
  const { user: userId, tenantId } = req.user || {};

  // Validate authentication
  if (!userId || !tenantId) {
    return res.status(403).json({ message: 'Authentication required.' });
  }

  // Validate required fields
  if (!customerId || !totalAmount || !modeOfPayment || !paidBy) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  // Validate mode of payment
  if (!Object.values(ModeOfPayment).includes(modeOfPayment)) {
    return res.status(400).json({
      message: `Invalid mode of payment. Valid options are: ${Object.values(ModeOfPayment).join(', ')}`,
    });
  }

  // Validate totalAmount
  const paymentAmount = parseFloat(totalAmount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({ message: 'Invalid payment amount. Must be a positive number.' });
  }

  try {
    // Validate customer
  
    const customerCheck = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { phoneNumber: true, firstName: true, closingBalance: true },
    });
   

    if (!customerCheck) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    // Fetch paybill and tenant details
    let paybill, customerCarePhoneNumber;
    try {
    
      paybill = await getShortCode(tenantId);
      const tenant = await fetchTenant(tenantId);
      customerCarePhoneNumber = tenant.phoneNumber;
     
    } catch (error) {
      console.error('Error fetching paybill or tenant details:', error);
      return res.status(500).json({ message: 'Failed to fetch tenant details for SMS notification.' });
    }

    const transactionId = generateTransactionId();

    const result = await prisma.$transaction(
      async (tx) => {
        // Create new payment
       
        const newPayment = await tx.payment.create({
          data: {
            amount: paymentAmount,
            tenantId,
            modeOfPayment,
            firstName: paidBy,
            transactionId,
            receipted: true,
            createdAt: new Date(),
          },
        });
      

   
        const paymentCheck = await tx.payment.findUnique({
          where: { id: newPayment.id },
        });
      

        if (!paymentCheck) {
          throw new Error('Failed to create payment record.');
        }

    

        // Process invoices and create receipt
        const { receipts, newClosingBalance, remainingAmount, customer } = await settlePaymentInvoices(
          paymentAmount,
          customerId,
          newPayment.id,
          tenantId,
          paidBy,
          modeOfPayment,
          tx // Pass transaction context
        );

        // Log user activity
      
        await tx.userActivity.create({
          data: {
            userId,
            tenantId,
            customerId,
            action: 'PAYMENT_PROCESSED',
            details: {
              message: `Payment of KES ${paymentAmount} processed for customer ${customer.firstName}`,
              paymentInfo: {
                amount: paymentAmount,
                modeOfPayment,
                transactionId,
                paymentId: newPayment.id,
                receipt: {
                  receiptId: receipts[0].id,
                  receiptNumber: receipts[0].receiptNumber,
                  amount: receipts[0].amount,
                  invoiceIds: receipts[0].invoiceIds,
                  remainingAmount: receipts[0].remainingAmount,
                },
              },
            },
          },
        });
      

        return { updatedPayment: newPayment, receipts, newClosingBalance, remainingAmount, customer };
      },
      {
        maxWait: 5000,
        timeout: 20000, // Increased to 20 seconds
      }
    );

    // Send SMS notification
    const balanceMessage = result.newClosingBalance < 0
      ? `an overpayment of KES ${Math.abs(result.newClosingBalance)}`
      : `KES ${result.newClosingBalance}`;
    const text = `Dear ${result.customer.firstName}, payment of KES ${paymentAmount} received successfully. ` +
      `Your balance is ${balanceMessage}. To serve you better, use our paybill number ${paybill} acc number, your phone number;${result?.customer?.phoneNumber}. Inquiries? ${customerCarePhoneNumber}`;

   
    const sanitizedPhone = sanitizePhoneNumber(result.customer.phoneNumber);
    await sendSMS(tenantId, sanitizedPhone, text);
  

    res.status(201).json({
      message: 'Payment and receipt created successfully, SMS notification sent.',
      receipts: result.receipts,
      updatedPayment: result.updatedPayment,
      newClosingBalance: result.newClosingBalance,
      remainingAmount: result.remainingAmount,
      paymentId: result.updatedPayment.id,
    });
  } catch (error) {
    console.error('Error creating manual cash payment:', error);
    if (error.code === 'P2003') {
      return res.status(400).json({ message: 'Foreign key violation during receipt creation.', details: error.meta });
    }
    if (error.code === 'P2002' && error.meta?.target.includes('paymentId')) {
      return res.status(400).json({ message: 'A receipt already exists for this payment.' });
    }
    res.status(500).json({ error: 'Failed to create manual cash payment.', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { manualCashPayment, generateUniqueReceiptNumber, sanitizePhoneNumber };