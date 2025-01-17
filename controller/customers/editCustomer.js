const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// PUT: Update a customer
const editCustomer = async (req, res) => {
  const customerId = parseInt(req.params.id, 10);
 // Get the customer ID from the URL
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    county,
    town,
    status,
    location,
    estateName, // Optional field for estate name
    building, // Optional field for building name
    houseNumber, // Optional field for house number
    category,
    monthlyCharge,
    garbageCollectionDay,
    collected,
    closingBalance,
  } = req.body;

  // Extract tenantId from the authenticated user (req.user)
  const tenantId = req.user?.tenantId;

  // Check if the customer ID and tenant ID are provided
  if (!customerId) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  try {
    // Ensure the customer belongs to the tenant before updating
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId, // Ensure the customer belongs to the correct tenant
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or access denied' });
    }

    // Update the customer
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName,
        lastName,
        email,
        phoneNumber,
        gender,
        county,
        town,
        status,
        location,
        estateName,
        building,
        houseNumber,
        category,
        monthlyCharge,
        garbageCollectionDay,
        collected,
        closingBalance,
      },
    });

    // Return the updated customer data
    res.status(200).json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Error updating customer' });
  }
};

module.exports = { editCustomer };
