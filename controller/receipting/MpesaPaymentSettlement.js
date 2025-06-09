const { PrismaClient, ModeOfPayment } = require('@prisma/client');
const axios = require('axios');
const { sendSMS, getShortCode } = require('../sms/sms');
const { fetchTenant } = require('../tenants/tenantupdate');

const prisma = new PrismaClient();

function generateTransactionId() {
  const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
  return `C${randomDigits}`;
}

async function generateReceiptNumber(tenantId) {
  let receiptNumber;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 5;

  while (exists && attempts < maxAttempts) {
    const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
    receiptNumber = `RCPT${randomDigits}-${tenantId}`;
    console.time('checkReceiptNumber');
    exists = await prisma.receipt.findUnique({
      where: { receiptNumber },
    }) !== null;
    console.timeEnd('checkReceiptNumber');
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate unique receipt number after maximum attempts.');
  }

  return receiptNumber;
}

const MpesaPaymentSettlement = async (req, res) => {
  const { customerId, modeOfPayment, paidBy, paymentId } = req.body;
  const { user: userId, tenantId } = req.user || {};

  // Validate authentication
  if (!userId || !tenantId) {
    return res.status(403).json({ message: 'Authentication required.' });
  }

  // Validate required fields
  if (!customerId || !modeOfPayment || !paidBy || !paymentId) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  // Validate mode of payment
  if (!Object.values(ModeOfPayment).includes(modeOfPayment)) {
    return res.status(400).json({
      message: `Invalid mode of payment. Valid options are: ${Object.values(ModeOfPayment).join(', ')}`,
    });
  }


  

  try {
    // Retrieve customer data


    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        amount: true,
        receipted: true,
        tenantId: true,
        transactionId: true,
        ref: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const incomingRef = payment.ref?.trim();
    console.log(`this is the payment ref ${JSON.stringify(payment)}`);
    console.time('checkCustomer');
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, closingBalance: true, phoneNumber: true, firstName: true, tenantId: true },
    });
    console.timeEnd('checkCustomer');

    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Customer not found or does not belong to this tenant.' });
    }

    // Validate payment belongs to tenant and is not already receipted
    if (payment.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Payment not found or does not belong to this tenant.' });
    }

    if (payment.receipted) {
      return res.status(400).json({ message: 'Payment with this ID has already been receipted.' });
    }

    const totalAmount = payment.amount;

    // Fetch paybill and tenant details
    let paybill, customerCarePhoneNumber;
    try {
      console.time('fetchPaybillAndTenant');
      paybill = await getShortCode(tenantId);
      const tenant = await fetchTenant(tenantId);
      customerCarePhoneNumber = tenant.phoneNumber;
      console.timeEnd('fetchPaybillAndTenant');
    } catch (error) {
      console.error('Error fetching paybill or tenant details:', error);
      return res.status(500).json({ message: 'Failed to fetch tenant details for SMS notification.' });
    }

    const result = await prisma.$transaction(
      async (tx) => {

        if (incomingRef) {
  console.time('saveRef');

  // 1) Read the current array
  const existing = await tx.customer.findUnique({
    where: { id: customerId },
    select: { possibleRefs: true },
  });
  const refs = existing?.possibleRefs ?? [];

  // 2) Only push if it’s not already in there
  if (!refs.includes(incomingRef)) {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        possibleRefs: { push: incomingRef },
      },
    });
  }

  console.timeEnd('saveRef');
}



        // Mark payment as receipted
        console.time('updatePayment');
        await tx.payment.update({
          where: { id: paymentId },
          data: { receipted: true },
        });
        console.timeEnd('updatePayment');

        // Get unpaid or partially paid invoices
        console.time('fetchInvoices');
        const invoices = await tx.invoice.findMany({
          where: {
            customerId,
            tenantId,
            status: { in: ['UNPAID', 'PPAID'] },
          },
          orderBy: { createdAt: 'asc' },
        });
        console.timeEnd('fetchInvoices');

        let remainingAmount = parseFloat(totalAmount);
        const receiptEntries = [];
        const updatedInvoices = [];

        // Process invoices
        for (const invoice of invoices) {
          if (remainingAmount <= 0) break;

          const invoiceDue = invoice.invoiceAmount - invoice.amountPaid;
          const paymentForInvoice = Math.min(remainingAmount, invoiceDue);

          const newAmountPaid = invoice.amountPaid + paymentForInvoice;
          const newStatus = newAmountPaid >= invoice.invoiceAmount ? 'PAID' : 'PPAID';
          const newInvoiceClosingBalance = invoice.closingBalance - paymentForInvoice;

          console.time('updateInvoice');
          const updatedInvoice = await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid: newAmountPaid,
              status: newStatus,
              //closingBalance: newInvoiceClosingBalance,
            },
          });
          console.timeEnd('updateInvoice');

          updatedInvoices.push(updatedInvoice);
          receiptEntries.push({
            invoiceId: updatedInvoice.id,
            amount: paymentForInvoice,
          });

          remainingAmount -= paymentForInvoice;
        }

        // Calculate new customer closing balance
        const finalClosingBalance = customer.closingBalance - totalAmount;

        console.time('updateCustomer');
        await tx.customer.update({
          where: { id: customerId },
          data: { closingBalance: finalClosingBalance },
        });
        console.timeEnd('updateCustomer');

        // Create single receipt
        console.time('generateReceiptNumber');
        const receiptNumber = await generateReceiptNumber(tenantId);
        console.timeEnd('generateReceiptNumber');

        console.time('createReceipt');
        const receipt = await tx.receipt.create({
          data: {
            customerId,
            amount: totalAmount,
            modeOfPayment,
            receiptNumber,
            paymentId,
            paidBy,
            phoneNumber: customer.phoneNumber,
            transactionCode: generateTransactionId(),
            createdAt: new Date(),
            tenantId,
           
            receiptInvoices: {
              create: receiptEntries.map((entry) => ({
                invoice: { connect: { id: entry.invoiceId } },
              })),
            },
          },
        });
        console.timeEnd('createReceipt');

        // Update payment with receiptId
        console.time('updatePaymentReceiptId');
        await tx.payment.update({
          where: { id: paymentId },
          data: { receiptId: receipt.id },
        });
        console.timeEnd('updatePaymentReceiptId');

        // Log user activity
        console.time('createUserActivity');
        await tx.userActivity.create({
          data: {
            userId,
            tenantId,
            customerId,
            action: 'PAYMENT_PROCESSED',
            details: {
              message: `Payment of KES ${totalAmount} processed for customer ${customer.firstName}`,
              paymentInfo: {
                amount: totalAmount,
                modeOfPayment,
                transactionId: payment.transactionId || 'N/A',
                paymentId,
                receipt: {
                  receiptId: receipt.id,
                  receiptNumber,
                  amount: totalAmount,
                  invoiceIds: receiptEntries.map((entry) => entry.invoiceId),
                  remainingAmount: remainingAmount > 0 ? remainingAmount : null,
                },
              },
            },
          },
        });
        console.timeEnd('createUserActivity');

        return {
          receipt,
          updatedInvoices,
          newClosingBalance: finalClosingBalance,
          remainingAmount,
        };
      },
      {
        maxWait: 5000,
        timeout: 20000,
      }
    );

    // Send confirmation SMS
    const balanceMessage =
      result.newClosingBalance < 0
        ? `Your closing balance is an overpayment of KES ${Math.abs(result.newClosingBalance)}`
        : `Your closing balance is KES ${result.newClosingBalance}`;
    const message = `Dear ${customer.firstName}, payment of KES ${totalAmount} for garbage collection services received successfully. ${balanceMessage}. Always use paybill no: ${paybill}, acc no: your phone number; ${customer.phoneNumber}, inquiries? ${customerCarePhoneNumber} Thank you!`;

    console.time('sendSMS');
    await sendSMS(tenantId, customer.phoneNumber, message);
    console.timeEnd('sendSMS');

    res.status(201).json({
      message: 'Payment processed successfully, SMS notification sent.',
      receipts: [{
        id: result.receipt.id,
        receiptNumber: result.receipt.receiptNumber,
        amount: result.receipt.amount,
        invoiceIds: result.updatedInvoices.map((invoice) => invoice.id),
        remainingAmount: result.remainingAmount > 0 ? result.remainingAmount : null,
      }],
      updatedInvoices: result.updatedInvoices,
      newClosingBalance: result.newClosingBalance,
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    if (error.code === 'P2002' && error.meta?.target.includes('paymentId')) {
      return res.status(400).json({ message: 'A receipt already exists for this payment.' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ message: 'Foreign key violation during receipt creation.', details: error.meta });
    }
    res.status(500).json({ error: 'Failed to process payment.', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { MpesaPaymentSettlement };