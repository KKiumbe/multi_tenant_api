const express = require('express');
const { getReceipts, getReceiptById, searchReceiptsByPhone, searchReceiptsByName } = require('../../controller/receipting/getReceipt.js');
const { MpesaPaymentSettlement } = require('../../controller/receipting/MpesaPaymentSettlement.js');
const { manualCashPayment } = require('../../controller/receipting/manualReceipting.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const { TenantStatus } = require('@prisma/client');

const router = express.Router();

router.post('/manual-receipt',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('receipts', 'create'), MpesaPaymentSettlement);
router.post('/manual-cash-payment',verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('receipts', 'create'), manualCashPayment);

router.get('/receipts',verifyToken,checkAccess('receipts', 'read'), getReceipts );

router.get('/receipts/:id',verifyToken, checkAccess('receipts', 'read'), getReceiptById);

router.get('/search-by-phone',verifyToken,checkAccess('receipts', 'read'), searchReceiptsByPhone );

router.get('/search-by-name',verifyToken, checkAccess('receipts', 'read'), searchReceiptsByName );



module.exports = router;


