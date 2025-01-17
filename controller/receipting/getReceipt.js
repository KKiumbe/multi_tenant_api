const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Controller function to fetch all receipts
const getReceipts = async (req, res) => {

    const {tenantId} = req.user; // Extract tenantId from authenticated user

    // Validate required fields
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
    }
    try {
        // Fetch all receipts with their associated payment, customer (with closing balance), and invoice details
        const receipts = await prisma.receipt.findMany({
            where:{tenantId},
            include: {
                payment: true, // Include payment details
                customer: {    // Include customer details, including closingBalance
                    select: {
                        firstName: true,    // Replace 'name' with valid fields like 'firstName' and 'lastName'
                        lastName: true,
                        phoneNumber: true,
                        closingBalance: true, // Fetch the closing balance from the customer collection
                    },
                },
                receiptInvoices: {
                    include: {
                        invoice: true, // Include invoice details for each receipt
                    },
                },
            },
            orderBy: {
                id: 'desc', // Order receipts by ID in descending order
            },
        });

        // Check if receipts were found
        if (!receipts.length) {
            return res.status(404).json({ message: 'No receipts found.' });
        }

        // Format the receipts to include createdAt timestamp and customer closingBalance
        const formattedReceipts = receipts.map((receipt) => ({
            ...receipt,
            createdAt: receipt.createdAt.toISOString(), // Format createdAt for better readability
            customer: {
                ...receipt.customer,
                closingBalance: receipt.customer?.closingBalance || 0, // Include customer closingBalance (default to 0 if not found)
            },
        }));

        res.status(200).json(formattedReceipts);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ error: 'Failed to fetch receipts.' });
    }
};

// Controller function to fetch a receipt by its ID
const getReceiptById = async (req, res) => {
    const { id } = req.params; // Extract receipt ID from the route parameters
    const {tenantId} = req.user; // Extract tenantId from authenticated user

    // Validate required fields
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
    }
    try {
        // Fetch the receipt with the specified ID, including related payment, customer (with closing balance), and invoice details
        const receipt = await prisma.receipt.findUnique({
            where: {
                id: id, tenantId // Match the receipt by ID
            },
            include: {
                payment: true, // Include payment details
                customer: {    // Include customer details, including closingBalance
                    select: {
                        firstName: true,    // Replace 'name' with valid fields like 'firstName' and 'lastName'
                        lastName: true,
                        phoneNumber: true,
                        closingBalance: true, // Fetch the closing balance from the customer collection
                    },
                },
                receiptInvoices: {
                    include: {
                        invoice: true, // Include invoice details for each receipt
                    },
                },
            },
        });

        // Check if the receipt was found
        if (!receipt) {
            return res.status(404).json({ message: `Receipt with ID ${id} not found.` });
        }

        // Format the receipt to include createdAt timestamp and customer closingBalance
        const formattedReceipt = {
            ...receipt,
            createdAt: receipt.createdAt.toISOString(), // Format createdAt for better readability
            customer: {
                ...receipt.customer,
                closingBalance: receipt.customer?.closingBalance || 0, // Include customer closingBalance (default to 0 if not found)
            },
        };

        res.status(200).json(formattedReceipt);
    } catch (error) {
        console.error('Error fetching receipt:', error);
        res.status(500).json({ error: 'Failed to fetch the receipt.' });
    }
};

module.exports = {
    getReceipts,
    getReceiptById,
};
