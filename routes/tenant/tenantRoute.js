const { PrismaClient } = require('@prisma/client');
const express = require('express');
const { updateTenantDetails, getTenantDetails, uploadLogo, updateTenantStatus, getAllTenants } = require('../../controller/tenants/tenantupdate.js');
const verifyToken = require('../../middleware/verifyToken.js');
const upload = require('../../controller/tenants/logoUploadMiddleware.js');

const prisma = new PrismaClient();

const router = express.Router();

// Update Tenant Details


router.put('/tenants/:tenantId', verifyToken, updateTenantDetails);

router.get('/tenants/:tenantId',verifyToken, getTenantDetails);

router.put('/logo-upload/:tenantId', upload.single('logo'),uploadLogo );

router.get(
  '/tenants',

  getAllTenants
);

router.put(
  '/tenants/status/:tenantId',verifyToken,

 updateTenantStatus
);


router.get('/tenant-status', verifyToken, async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ status: tenant.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tenant status' });
  }
});



module.exports = router;

