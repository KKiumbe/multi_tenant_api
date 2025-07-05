const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

;

// PUT: Update a customer
const editCustomer = async (req, res) => {
  const customerId = req.params.id; // Keep as string for UUID
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    county,
    town,
    status,
    customerType,
    location,
    estateName,
    building,
    houseNumber,
    category,
    monthlyCharge,
    garbageCollectionDay,
    collected,
    closingBalance,
  } = req.body;

  // Extract user and tenantId from the authenticated user (req.user)
  const { user: userId, tenantId } = req.user || {};

  // Validate required fields
  if (!customerId) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    // Use a transaction to ensure atomicity
    const [updatedCustomer] = await prisma.$transaction(async (tx) => {
      // Find the customer and ensure it belongs to the tenant
      const customer = await tx.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
        },
      });

      if (!customer) {
        throw new Error('Customer not found or access denied');
      }

      // Create an object with only the provided fields
      const updateData = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (gender !== undefined) updateData.gender = gender;
      if (county !== undefined) updateData.county = county;
      if (town !== undefined) updateData.town = town;
      if (status !== undefined) updateData.status = status;
      if (customerType !== undefined) updateData.customerType = customerType;
      if (location !== undefined) updateData.location = location;
      if (estateName !== undefined) updateData.estateName = estateName;
      if (building !== undefined) updateData.building = building;
      if (houseNumber !== undefined) updateData.houseNumber = houseNumber;
      if (category !== undefined) updateData.category = category;
      if (monthlyCharge !== undefined) updateData.monthlyCharge = monthlyCharge;
      if (garbageCollectionDay !== undefined)
        updateData.garbageCollectionDay = garbageCollectionDay;
      if (collected !== undefined) updateData.collected = collected;
      if (closingBalance !== undefined) updateData.closingBalance = closingBalance;

      // Ensure at least one field is provided for update
      if (Object.keys(updateData).length === 0) {
        throw new Error('At least one field must be provided for update');
      }

      // Log changed fields (only for fields that exist in the schema)
      const changedFields = Object.keys(updateData).map((key) => ({
        field: key,
        oldValue: customer[key] ?? null, // Use null if field is undefined
        newValue: updateData[key],
      }));

      // Update the customer
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: updateData,
      });

      // Log the user activity
      await tx.userActivity.create({
        data: {
          user: { connect: { id: userId } },
          tenant: { connect: { id: tenantId } },
          customer: { connect: { id: customerId } },
          action: `UPDATED ${customer.firstName} ${customer.lastName} details `,
          details: { changedFields },
        },
      });

      return [updatedCustomer];
    });

    // Return the updated customer data
    res.status(200).json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);

    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      // Unique constraint violation (e.g., duplicate email)
      return res.status(409).json({ message: 'Email or phone number already exists' });
    }
    if (error.message === 'Customer not found or access denied') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'At least one field must be provided for update') {
      return res.status(400).json({ message: error.message });
    }

    // Generic error
    res.status(500).json({ message: 'Error updating customer' });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { editCustomer };