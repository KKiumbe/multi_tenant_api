const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const path = require('path');

// Set up storage engine for multer to save the uploaded file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/'); // Save files in the 'uploads' directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Use timestamp as filename
  },
});

const upload = multer({ storage });


module.exports = upload;

/**
 * Update Tenant Details (Supports Partial Updates)
 */




// Update Tenant Details (Supports Partial Updates)
const updateTenantDetails = async (req, res) => {
  const { tenantId } = req.params; // Tenant ID from the route parameter
  const updateData = req.body; // Dynamic update fields

  const { role, tenantId: userTenantId, user: userId } = req.user;
  const tenantIdInt = parseInt(tenantId, 10);

  if (Object.keys(updateData).length === 0 && !req.file) {
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

    // Ensure the user belongs to the same tenant or has SUPER_ADMIN privileges
    if (userTenantId !== tenantIdInt) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to update this tenant.' });
    }

    // Handle logo upload if a logo file is provided
    if (req.file) {
      const logoUrl = `/uploads/${req.file.filename}`; // You might want to use a full URL or cloud storage URL
      updateData.logo = logoUrl; // Save the logo URL to the tenant data
    }

    // Ensure proper data types for numeric values
    if (updateData.monthlyCharge !== undefined) {
      updateData.monthlyCharge = parseFloat(updateData.monthlyCharge);
    }
    if (updateData.numberOfBags !== undefined) {
      updateData.numberOfBags = parseInt(updateData.numberOfBags, 10);
    }

    // Update the tenant details
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
          connect: { id: tenantIdInt },
        },
        user: {
          connect: { id: userId },
        },
        details: {
          updatedFields: Object.keys(updateData),
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











const getTenantDetails = async (req, res) => {
  const { tenantId } = req.params; // Extract tenantId from route params
  const tenantIdInt = parseInt(tenantId, 10);

  console.log(`User object: ${JSON.stringify(req.user)}`);
  const { role, tenantId: userTenantId } = req.user;

  try {
    // Fetch the tenant with relationships
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdInt },
      select: {
        name: true,
        createdBy: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
        numberOfBags: true,
        createdAt: true,
        updatedAt: true,
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
        county: true,
        town: true,
        adress: true,
        building: true,
        street: true,
        website: true,
        logoUrl: true,
        allowedUsers: true,// Include trash bag issuance
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

    // Ensure user belongs to the same tenant or is a SUPER_ADMIN
    if (userTenantId !== tenantIdInt) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view this tenant.' });
    }

    res.status(200).json({ tenant });
  } catch (error) {
    console.error('Error fetching tenant details:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant details.', details: error.message });
  }
};




module.exports = {
  updateTenantDetails,getTenantDetails
};
