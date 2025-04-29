const express = require('express');
const { getReceipts, getReceiptById, searchReceiptsByPhone, searchReceiptsByName } = require('../../controller/receipting/getReceipt.js');
const { MpesaPaymentSettlement } = require('../../controller/receipting/MpesaPaymentSettlement.js');
const { manualCashPayment } = require('../../controller/receipting/manualReceipting.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');

const router = express.Router();

router.post('/manual-receipt',verifyToken,checkAccess('receipts', 'create'), MpesaPaymentSettlement);
router.post('/manual-cash-payment',verifyToken,checkAccess('receipts', 'create'), manualCashPayment);

router.get('/receipts',verifyToken,checkAccess('receipts', 'read'), getReceipts );

router.get('/receipts/:id',verifyToken, checkAccess('receipts', 'read'), getReceiptById);

router.get('/search-by-phone',verifyToken,checkAccess('receipts', 'read'), searchReceiptsByPhone );

router.get('/search-by-name',verifyToken, checkAccess('receipts', 'read'), searchReceiptsByName );



module.exports = router;


