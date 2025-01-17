const express = require('express');
const { fetchAllPayments, fetchPaymentById, fetchPaymentsByTransactionId } = require('../../controller/payments/getAllPayments.js');

const router = express.Router();

router.get('/payments', fetchAllPayments);
router.get('/payments/:paymentId', fetchPaymentById);
router.get('/payments-search', fetchPaymentsByTransactionId);


module.exports = router;