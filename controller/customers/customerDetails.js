const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getCustomerDetails = async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user; // Get tenantId from the authenticated user

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId, // Ensure the customer belongs to the tenant
      },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: true, // Include invoice items
          },
        },
        receipts: {
          orderBy: { createdAt: 'desc' },
          include: {
            payment: true, // Include linked payment details
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or does not belong to this tenant' });
    }

    res.status(200).json(customer);
  } catch (error) {
    console.error('Error retrieving customer details:', error);
    
    // If it's a Prisma-specific error, return a more detailed response
    if (error instanceof PrismaClientKnownRequestError) {
      return res.status(400).json({ message: 'Invalid request', error: error.message });
    }

    res.status(500).json({ message: 'Error retrieving customer details' });
  }
};

module.exports = {
  getCustomerDetails,
};
