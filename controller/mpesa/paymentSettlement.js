const { PrismaClient } = require('@prisma/client');
const { sendSMS } = require('../sms/sms');

const prisma = new PrismaClient();

async function generateUniqueReceiptNumber(paymentId) {
    let receiptNumber;
    let exists = true;

    // Fetch the tenant ID using the payment ID
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { tenantId: true }, // Get the tenant ID associated with the payment
    });

    if (!payment || !payment.tenantId) {
        throw new Error('Unable to fetch tenant ID for the payment.');
    }

    const tenantId = payment.tenantId; // Extract tenant ID

    while (exists) {
        const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
        receiptNumber = `RCPT${randomDigits}-${tenantId}`; // Append the tenant ID
        exists = await prisma.receipt.findUnique({
            where: { receiptNumber },
        }) !== null;
    }

    return receiptNumber;
}


async function settleInvoice() {
    try {
        // Fetch unprocessed Mpesa transactions and include tenantId
        const mpesaTransactions = await prisma.mPESATransactions.findMany({
            where: { processed: false },
            include: {
                mpesaConfig: {
                    select: { tenantId: true },
                },
            },
        });

        if (mpesaTransactions.length === 0) {
            console.log("No unprocessed Mpesa transactions found.");
            return;
        }

        for (const transaction of mpesaTransactions) {
            const {
                BillRefNumber,
                TransAmount,
                id,
                FirstName,
                MSISDN: phone,
                TransID: MpesaCode,
                TransTime,
                mpesaConfig: { tenantId }, // Extract tenantId from the related config
            } = transaction;

            console.log(`Processing transaction: ${id} for tenant: ${tenantId}, amount: ${TransAmount}`);
            const paymentAmount = parseFloat(TransAmount);

            if (isNaN(paymentAmount) || paymentAmount <= 0) {
                console.log(`Invalid payment amount for transaction ${id}. Skipping.`);
                continue;
            }

            const existingPayment = await prisma.payment.findUnique({
                where: { transactionId: MpesaCode },
            });

            if (existingPayment) {
                console.log(`Mpesa transaction ${MpesaCode} already exists in payment table. Skipping.`);
                continue;
            }

            // Fetch the customer within the same tenant
            const customer = await prisma.customer.findFirst({
                where: {
                    phoneNumber: BillRefNumber,
                    tenantId: tenantId, // Ensure the customer belongs to the same tenant
                },
                select: { id: true, closingBalance: true, phoneNumber: true, firstName: true },
            });

            if (!customer) {
                console.log(`No customer found with BillRefNumber ${BillRefNumber} for tenant ${tenantId}.`);
                await prisma.payment.create({
                    data: {
                        amount: paymentAmount,
                        modeOfPayment: 'MPESA',
                        transactionId: MpesaCode,
                        firstName: FirstName,
                        receipted: false,
                        createdAt: TransTime,
                        ref: BillRefNumber,
                        tenantId, // Associate payment with tenant
                    },
                });
                continue;
            }

            const payment = await prisma.payment.create({
                data: {
                    amount: paymentAmount,
                    modeOfPayment: 'MPESA',
                    transactionId: MpesaCode,
                    firstName: FirstName,
                    receipted: false,
                    createdAt: TransTime,
                    receiptId: null,
                    ref: BillRefNumber,
                    tenantId, // Associate payment with tenant
                },
            });

            const receiptNumber = await generateUniqueReceiptNumber(payment.id);
            const { receipts, newClosingBalance } = await processInvoices(paymentAmount, customer.id, payment.id, tenantId);


            const validReceipts = receipts.filter((receipt) => receipt.invoiceId);

            if (validReceipts.length > 0) {




            try {
                const receiptData = await prisma.receipt.create({
                  data: {
                    amount: paymentAmount,
                    modeOfPayment: 'MPESA',
                    paidBy: FirstName,
                    transactionCode: MpesaCode,
                    phoneNumber: phone,
                    paymentId: payment.id,
                    customerId: customer.id,
                    receiptInvoices: {
                      create: validReceipts.map((receipt) => ({
                        invoice: { connect: { id: receipt.invoiceId } },
                      })),
                    },
                    receiptNumber,
                    createdAt: new Date(),
                    tenantId,
                  },
                });
                console.log(`Receipt created successfully for transaction ${MpesaCode}`);
              } catch (error) {
                console.error(`Failed to create receipt for transaction ${MpesaCode}:`, error.message);
              }
            }





            await prisma.payment.update({
                where: { id: payment.id },
                data: { receipted: true },
            });

            await prisma.mPESATransactions.update({
                where: { id },
                data: { processed: true },
            });

            const finalClosingBalance = newClosingBalance;
            const formattedBalanceMessage = finalClosingBalance < 0
                ? `Your Current balance is an overpayment of KES ${Math.abs(finalClosingBalance)}`
                : `Your Current balance is KES ${finalClosingBalance}`;

            const message = `Dear ${customer.firstName}, payment of KES ${paymentAmount} received successfully. ${formattedBalanceMessage}. Help us server you better by using Paybill No :4107197 , your phone number as the account number.Customer support number: 0726594923`;

            await sendSMS(tenantId, customer.phoneNumber,message);
            console.log(`Processed payment and created receipt for transaction ${MpesaCode}.`);
        }
    } catch (error) {
        console.error('Error processing Mpesa transactions in settleInvoice:', error);
    }
}







async function processInvoices(paymentAmount, customerId, paymentId) {
    // Fetch unpaid and partially paid invoices
    const invoices = await prisma.invoice.findMany({
        where: {
            customerId,
            status: {
                in: ['UNPAID', 'PPAID'], // Only unpaid or partially paid invoices
            },
        },
        orderBy: { createdAt: 'asc' }, // Process oldest invoices first
    });

    let remainingAmount = paymentAmount;
    const receipts = [];
    let totalPaidToInvoices = 0;

    // Mark the payment as receipted
    await prisma.payment.update({
        where: { id: paymentId },
        data: { receipted: true },
    });

    // Case 1: No unpaid or partially paid invoices
    if (invoices.length === 0) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { closingBalance: true },
        });

        const newClosingBalance = customer.closingBalance - paymentAmount;

        // Update the customer's closing balance
        await prisma.customer.update({
            where: { id: customerId },
            data: { closingBalance: newClosingBalance },
        });

        // Generate a receipt for closing balance adjustment
        receipts.push({
            invoiceId: null, // Indicates adjustment to closing balance
        });

        remainingAmount = 0;

        return { receipts, remainingAmount, newClosingBalance };
    }

    // Case 2: Apply payment across invoices
    for (const invoice of invoices) {
        if (remainingAmount <= 0) break;

        const invoiceDueAmount = invoice.invoiceAmount - invoice.amountPaid;
        const paymentForInvoice = Math.min(remainingAmount, invoiceDueAmount);

        // Update the invoice with the paid amount
        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                amountPaid: invoice.amountPaid + paymentForInvoice,
                status: invoice.amountPaid + paymentForInvoice >= invoice.invoiceAmount ? 'PAID' : 'PPAID', // Update status
            },
        });

        receipts.push({ invoiceId: updatedInvoice.id });
        remainingAmount -= paymentForInvoice;
        totalPaidToInvoices += paymentForInvoice;
    }

    // Fetch the customer's closing balance after invoice processing
    const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { closingBalance: true },
    });

    // Always adjust the closing balance based on the initial amount paid
    const newClosingBalance = customer.closingBalance - paymentAmount;

    // Case 3: Apply remaining payment to closing balance (if applicable)
    if (remainingAmount > 0) {
        // Update the customer's closing balance
        await prisma.customer.update({
            where: { id: customerId },
            data: { closingBalance: newClosingBalance },
        });

        // Generate a receipt for closing balance adjustment
        receipts.push({
            invoiceId: null, // Indicates adjustment to closing balance
        });

        remainingAmount = 0;
    }

    return { receipts, remainingAmount, newClosingBalance };
}



async function processInvoices(paymentAmount, customerId, paymentId, tenantId) {
    // Fetch unpaid and partially paid invoices for the tenant
    const invoices = await prisma.invoice.findMany({
        where: {
            customerId,
            tenantId, // Ensure invoices belong to the tenant
            status: {
                in: ['UNPAID', 'PPAID'], // Only unpaid or partially paid invoices
            },
        },
        orderBy: { createdAt: 'asc' }, // Process oldest invoices first
    });

    let remainingAmount = paymentAmount;
    const receipts = [];
    let totalPaidToInvoices = 0;

    // Mark the payment as receipted
    await prisma.payment.update({
        where: { id: paymentId },
        data: { receipted: true },
    });

    // Case 1: No unpaid or partially paid invoices
    if (invoices.length === 0) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { closingBalance: true },
        });

        const newClosingBalance = customer.closingBalance - paymentAmount;

        // Update the customer's closing balance
        await prisma.customer.update({
            where: { id: customerId },
            data: { closingBalance: newClosingBalance },
        });

        // Generate a receipt for closing balance adjustment
        receipts.push({
            invoiceId: null, // Indicates adjustment to closing balance
        });

        remainingAmount = 0;

        return { receipts, remainingAmount, newClosingBalance };
    }

    // Case 2: Apply payment across invoices
    for (const invoice of invoices) {
        if (remainingAmount <= 0) break;

        const invoiceDueAmount = invoice.invoiceAmount - invoice.amountPaid;
        const paymentForInvoice = Math.min(remainingAmount, invoiceDueAmount);

        // Update the invoice with the paid amount
        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                amountPaid: invoice.amountPaid + paymentForInvoice,
                status: invoice.amountPaid + paymentForInvoice >= invoice.invoiceAmount ? 'PAID' : 'PPAID', // Update status
            },
        });

        receipts.push({ invoiceId: updatedInvoice.id });
        remainingAmount -= paymentForInvoice;
        totalPaidToInvoices += paymentForInvoice;
    }

    // Fetch the customer's closing balance after invoice processing
    const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { closingBalance: true },
    });

    // Always adjust the closing balance based on the initial amount paid
    const newClosingBalance = customer.closingBalance - paymentAmount;

    // Case 3: Apply remaining payment to closing balance (if applicable)
    if (remainingAmount > 0) {
        // Update the customer's closing balance
        await prisma.customer.update({
            where: { id: customerId },
            data: { closingBalance: newClosingBalance },
        });

        // Generate a receipt for closing balance adjustment
        receipts.push({
            invoiceId: null, // Indicates adjustment to closing balance
        });

        remainingAmount = 0;
    }

    return { receipts, remainingAmount, newClosingBalance };
}






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

module.exports = { settleInvoice };
