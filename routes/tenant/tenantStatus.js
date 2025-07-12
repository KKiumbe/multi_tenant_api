




const express = require('express');
const { getTenantStatus } = require('../../controller/tenants/tenantupdate.js');
const verifyToken = require('../../middleware/verifyToken.js');


const router = express.Router();



router.get('/tenant/status', verifyToken , getTenantStatus);



module.exports = router;


