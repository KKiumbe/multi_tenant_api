const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Controller to fetch all payments with associated invoices and customer details
const fetchAllPayments = async (req, res) => {
    try {
        const payments = await prisma.payment.findMany({
            include: {
                receipt: {
                    include: {
                        receiptInvoices: {
                            include: {
                                invoice: true, // Include associated invoices
                            },
                        },
                    },
                }
            },
            orderBy: {
                id: 'desc' // Order payments by ID in descending order
            },
        });

        res.status(200).json(payments); // Respond with the payments data
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



// Controller to fetch payments by Mpesa transaction ID
const fetchPaymentsByTransactionId = async (req, res) => {
    const { transactionId } = req.query; // Get the transaction ID from query parameters

    if (!transactionId) {
        return res.status(400).json({ message: 'Transaction ID is required' });
    }

    try {
        const payments = await prisma.payment.findUnique({
            where: {
                TransactionId: transactionId, // Search by transactionId as a string
            },
            include: {
                receipt: {
                    include: {
                        receiptInvoices: {
                            include: {
                                invoice: true, // Include associated invoices
                            },
                        },
                    },
                },
            },
        });

        if (payments.length === 0) {
            return res.status(404).json({ message: 'No payments found for this transaction ID' });
        }

        res.status(200).json(payments); // Respond with the found payments
    } catch (error) {
        console.error('Error fetching payments by transaction ID:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};




// Controller to fetch a payment by ID with associated invoices and customer details
const fetchPaymentById = async (req, res) => {
    const { paymentId } = req.params; // Get the payment ID from request parameters

    try {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId }, // Treat paymentId as a string
            include: {
                receipt: {
                    include: {
                        receiptInvoices: {
                            include: {
                                invoice: true, // Include associated invoices
                            },
                        },
                    },
                },
            },
        });

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' }); // Handle case where payment is not found
        }

        res.status(200).json(payment); // Respond with the payment data
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Export the controller functions
module.exports = { 
    fetchAllPayments, 
    fetchPaymentById, 
    fetchPaymentsByTransactionId 
};
