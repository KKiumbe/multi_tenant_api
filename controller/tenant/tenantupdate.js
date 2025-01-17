const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Update Tenant Details
 */
const updateTenantDetails = async (req, res) => {
  const { tenantId } = req.params; // Tenant ID from the route parameter
  const {
    name,
    subscriptionPlan,
    monthlyCharge,
    numberOfBags,
    status,
    
  } = req.body; // Fields to update

  console.log(`User object: ${JSON.stringify(req.user)}`);
  const { role, tenantId: userTenantId, user: userId } = req.user;

  const tenantIdInt = parseInt(tenantId, 10);
  // Validate input
  if (!name && !subscriptionPlan && !monthlyCharge && !numberOfBags && !status) {
    return res.status(400).json({ error: 'No valid fields provided for update.' });
  }

  try {
    // Fetch the tenant to ensure it exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdInt },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

    // Ensure the user belongs to the same tenant or has the necessary permissions
    if (userTenantId !== tenantIdInt && !role.includes('SUPER_ADMIN')) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to update this tenant.' });
    }

    // Prepare data for update
    const updateData = {};
    if (name) updateData.name = name;
    if (subscriptionPlan) updateData.subscriptionPlan = subscriptionPlan;
    if (monthlyCharge !== undefined) updateData.monthlyCharge = parseFloat(monthlyCharge);
    if (numberOfBags !== undefined) updateData.numberOfBags = parseInt(numberOfBags, 10);
    if (status) updateData.status = status;

    // Update the tenant
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantIdInt },
      data: updateData,
    });

    // Log the changes in the audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_TENANT',
        resource: 'TENANT',
        description: `Updated tenant details for tenant ID ${tenantIdInt}`,
        tenant: {
          connect: { id: tenantIdInt }, // Connect the tenant relation
        },
        user: {
          connect: { id: userId }, // Connect the user relation
        },
        details: {
          updatedFields: Object.keys(updateData), // Log the fields updated
        },
      },
    });

    res.status(200).json({
      message: 'Tenant details updated successfully.',
      updatedTenant,
    });
  } catch (error) {
    console.error('Error updating tenant details:', error);
    res.status(500).json({ error: 'Failed to update tenant details.', details: error.message });
  }
};

module.exports = {
  updateTenantDetails,
};
