const { PrismaClient } = require('@prisma/client');
const express = require('express');
const { updateTenantDetails, getTenantDetails, uploadLogo, updateTenantStatus, getAllTenants, getTenantStatus } = require('../../controller/tenants/tenantupdate.js');
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


router.get('/tenant/status', verifyToken, getTenantStatus  )



module.exports = router;

