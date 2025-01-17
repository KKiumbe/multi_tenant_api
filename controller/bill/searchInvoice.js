const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SearchInvoices = async (req, res) => {
  const { phone, name } = req.query;

  try {
    let query = {
      where: {},
      include: {
        customer: true, // To include customer information in the results
      },
    };

    // Search by phone number (through customer relation)
    if (phone) {
      query.where.customer = {
        phoneNumber: phone,
      };
    }

    // Search by customer name (first or last name)
    if (name) {
      query.where.customer = {
        OR: [
          {
            firstName: {
              contains: name,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: name,
              mode: 'insensitive',
            },
          },
        ],
      };
    }

    

    // Fetch invoices based on the built query
    const invoices = await prisma.invoice.findMany(query);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ message: 'Error fetching invoices' });
  }
};

module.exports = { SearchInvoices };
