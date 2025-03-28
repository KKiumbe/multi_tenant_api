const { PrismaClient, ModeOfPayment } = require('@prisma/client');
const { sendSMS } = require('../sms/sms');

const prisma = new PrismaClient();

function generateReceiptNumber() {
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  return `RCPT${randomDigits}`;
}

function generateTransactionId() {
  const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
  return `C${randomDigits}`;
}

const manualCashPayment = async (req, res) => {
  const { customerId, totalAmount, modeOfPayment, paidBy, paymentId } = req.body;
  const { tenantId } = req.user;

  // Validate required fields
  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
  }

  if (!customerId || !totalAmount || !modeOfPayment || !paidBy) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  if (!Object.values(ModeOfPayment).includes(modeOfPayment)) {
    return res.status(400).json({
      message: `Invalid mode of payment. Valid options are: ${Object.values(ModeOfPayment).join(', ')}`,
    });
  }

  try {
    // Fetch customer with closing balance
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { phoneNumber: true, firstName: true, closingBalance: true },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const transactionId = generateTransactionId();
    let availableFunds = totalAmount + (customer.closingBalance < 0 ? Math.abs(customer.closingBalance) : 0); // Include overpayment
    const receipts = [];
    let totalPaidToInvoices = 0;

    // Update or create payment record
    let updatedPayment;
    if (paymentId) {
      updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          amount: totalAmount,
          tenantId,
          modeOfPayment,
          transactionId: transactionId,
          receipted: true,
          createdAt: new Date(),
        },
      });
    } else {
      updatedPayment = await prisma.payment.create({
        data: {
          amount: totalAmount,
          tenantId,
          modeOfPayment,
          transactionId: transactionId,
          receipted: true,
          createdAt: new Date(),
        },
      });
    }

    // Fetch unpaid or partially paid invoices
    const invoices = await prisma.invoice.findMany({
      where: { customerId, status: { in: ['UNPAID', 'PPAID'] } },
      orderBy: { createdAt: 'asc' }, // Oldest first
    });

    if (invoices.length === 0) {
      // No invoices: Apply payment to closing balance
      const newClosingBalance = customer.closingBalance - totalAmount;

      await prisma.customer.update({
        where: { id: customerId },
        data: { closingBalance: newClosingBalance },
      });

      receipts.push({ invoiceId: null });

      const balanceMessage = newClosingBalance < 0
        ? `an overpayment of KES ${Math.abs(newClosingBalance)}`
        : `KES ${newClosingBalance}`;

      const text = `Dear ${customer.firstName}, payment of KES ${totalAmount} received successfully. ` +
        `Your balance is ${balanceMessage}.`;

      await sendSMS(tenantId, customer.phoneNumber, text);

      return res.status(201).json({
        message: 'Payment applied to closing balance successfully. SMS notification sent.',
        receipt: receipts,
        newClosingBalance,
      });
    }

    // Process invoices with available funds (payment + overpayment)
    const updatedInvoices = [];
    for (const invoice of invoices) {
      if (availableFunds <= 0) break;

      const invoiceDueAmount = invoice.invoiceAmount - invoice.amountPaid;
      const paymentForInvoice = Math.min(availableFunds, invoiceDueAmount);

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: invoice.amountPaid + paymentForInvoice,
          status: invoice.amountPaid + paymentForInvoice >= invoice.invoiceAmount ? 'PAID' : 'PPAID',
        },
      });

      updatedInvoices.push(updatedInvoice);
      receipts.push({ invoiceId: updatedInvoice.id });
      totalPaidToInvoices += paymentForInvoice;
      availableFunds -= paymentForInvoice;
    }

    // Calculate new closing balance: original balance - total payment + amount applied to invoices
    const newClosingBalance = customer.closingBalance - totalAmount + totalPaidToInvoices;

    // Update customer's closing balance
    await prisma.customer.update({
      where: { id: customerId },
      data: { closingBalance: newClosingBalance },
    });

    if (availableFunds > 0) {
      receipts.push({
        invoiceId: null,
        description: `Remaining KES ${availableFunds} applied to overpayment`,
      });
    }

    // Create receipt
    const receiptNumber = generateReceiptNumber();
    const receipt = await prisma.receipt.create({
      data: {
        customerId,
        tenantId,
        amount: totalAmount,
        modeOfPayment,
        receiptNumber,
        paymentId: updatedPayment.id,
        paidBy,
        createdAt: new Date(),
      },
    });

    // SMS Notification
    const balanceMessage = newClosingBalance < 0
      ? `an overpayment of KES ${Math.abs(newClosingBalance)}`
      : `KES ${newClosingBalance}`;
    const text = `Dear ${customer.firstName}, payment of KES ${totalAmount} received successfully. ` +
      `Your balance is ${balanceMessage}. Thank you.`;

    await sendSMS(tenantId, customer.phoneNumber, text);

    res.status(201).json({
      message: 'Payment and receipt created successfully, SMS notification sent.',
      receipt,
      updatedPayment,
      updatedInvoices,
      newClosingBalance,
      paymentId: updatedPayment.id,
    });
  } catch (error) {
    console.error('Error creating manual cash payment:', error);
    res.status(500).json({ error: 'Failed to create manual cash payment.', details: error.message });
  }
};

module.exports = { manualCashPayment };