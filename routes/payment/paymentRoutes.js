const express = require('express');
const { fetchAllPayments, fetchPaymentById, fetchPaymentsByTransactionId, getAllPayments, searchPaymentsByName, searchPaymentsByPhone, getUnreceiptedPayments, searchTransactionById, filterPaymentsByMode } = require('../../controller/payments/getAllPayments.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const { TenantStatus } = require('@prisma/client');

const router = express.Router();


router.get('/payments',verifyToken, checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('payments','read'), getAllPayments);
router.get('/payments/unreceipted',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('payments','read'), getUnreceiptedPayments);
router.get('/payments/search-by-name',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('payments','read'), searchPaymentsByName);
router.get('/payments/search-by-phone',verifyToken, checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('payments','read'), searchPaymentsByPhone);

router.get('/searchTransactionById', verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('payments','read'), searchTransactionById);
router.get('/filterPaymentsByMode',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('payments','read'), filterPaymentsByMode);
router.get('/payments/:paymentId', verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('payments','read'), fetchPaymentById);
router.get('/payments-search', verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('payments','read'), fetchPaymentsByTransactionId);


module.exports = router;