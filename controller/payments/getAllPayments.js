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
  try {
    const { transactionId } = req.query; 
    const tenantId = req.user?.tenantId; // Ensure the user is from the same organization

    if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const payment = await prisma.payment.findUnique({
        where: {
            transactionId,
            tenantId, // Ensuring the user is only accessing their own organization's data
        },
        include: {
            tenant: true,
            receipt: true,
        },
    });

    if (!payment) {
        return res.status(404).json({ error: 'Payment not found or not accessible' });
    }

    res.json(payment);
} catch (error) {
    console.error('Error searching payment:', error);
    res.status(500).json({ error: 'Internal server error' });
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





// Phone number sanitization function
const sanitizePhoneNumber = (phone) => {
  if (!phone) return null;
  let sanitized = phone.replace(/\D/g, '');
  if (sanitized.startsWith('254')) {
    sanitized = '0' + sanitized.substring(3);
  } else if (sanitized.startsWith('+254')) {
    sanitized = '0' + sanitized.substring(4);
  } else if (!sanitized.startsWith('0')) {
    return null;
  }
  return sanitized;
};

// Fetch all payments
const getAllPayments = async (req, res) => {
  const tenantId = req.user?.tenantId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { tenantId },
        skip,
        take: limit,
        include: {
          receipt: {
            include: {
              receiptInvoices: { include: { invoice: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where: { tenantId } }),
    ]);

    res.json({ payments, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};

// Search payments by phone number
const searchPaymentsByPhone = async (req, res) => {
  const { phone, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const sanitizedPhoneNumber = sanitizePhoneNumber(phone);
  if (!sanitizedPhoneNumber) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          OR: [
            {
              receipt: {
                customer: {
                  OR: [
                    { phoneNumber: { contains: sanitizedPhoneNumber } },
                    { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } },
                  ],
                },
              },
            },
          ],
        },
        skip,
        take: parseInt(limit),
        include: {
          receipt: {
            include: {
              receiptInvoices: { include: { invoice: true } },
            },
          },
        },
      }),
      prisma.payment.count({
        where: {
          tenantId,
          OR: [
            {
              receipt: {
                customer: {
                  OR: [
                    { phoneNumber: { contains: sanitizedPhoneNumber } },
                    { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } },
                  ],
                },
              },
            },
          ],
        },
      }),
    ]);

    res.json({ payments, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};

// Search payments by name
const searchPaymentsByName = async (req, res) => {
  const { name, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Name parameter is required' });
  }

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          OR: [
            { firstName: { contains: name, mode: 'insensitive' } },
            { receipt: { customer: { OR: [
              { firstName: { contains: name, mode: 'insensitive' } },
              { lastName: { contains: name, mode: 'insensitive' } }
            ]}}},
          ],
        },
        skip,
        take: parseInt(limit),
        include: {
          receipt: {
            include: {
              receiptInvoices: { include: { invoice: true } },
            },
          },
        },
      }),
      prisma.payment.count({
        where: {
          tenantId,
          OR: [
            { firstName: { contains: name, mode: 'insensitive' } },
            { receipt: { customer: { OR: [
              { firstName: { contains: name, mode: 'insensitive' } },
              { lastName: { contains: name, mode: 'insensitive' } }
            ]}}},
          ],
        },
      }),
    ]);

    res.json({ payments, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};




const getUnreceiptedPayments = async (req, res) => {
    const tenantId = req.user?.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
  
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized: Tenant ID not found" });
    }
  
    try {
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: {
            tenantId,
            receipted: false, // Only fetch payments where receipted is false
          },
          skip,
          take: limit,
          include: {
            receipt: {
              include: {
                receiptInvoices: { include: { invoice: true } },
              },
            },
          },
        }),
        prisma.payment.count({
          where: {
            tenantId,
            receipted: false, // Count only unreceipted payments
          },
        }),
      ]);
  
      res.json({ payments, total });
    } catch (error) {
      console.error("Error fetching unreceipted payments:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  };
  
;
  







// Export the controller functions
module.exports = { 
  fetchUnreceiptedPayments,
    fetchAllPayments, 
    fetchPaymentById, 
    fetchPaymentsByTransactionId ,getAllPayments,searchPaymentsByPhone,searchPaymentsByName,getUnreceiptedPayments
};
