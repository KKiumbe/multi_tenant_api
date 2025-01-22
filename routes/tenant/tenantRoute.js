const express = require('express');
const { updateTenantDetails, getTenantDetails } = require('../../controller/tenant/tenantupdate.js');
const verifyToken = require('../../middleware/verifyToken.js');
const { upload } = require('../../controller/fileupload/uploadscript.js');

const router = express.Router();

// Update Tenant Details


router.put('/tenants/:tenantId', upload.single('logo'), verifyToken, updateTenantDetails);

router.get('/tenants/:tenantId',verifyToken, getTenantDetails);

module.exports = router;

