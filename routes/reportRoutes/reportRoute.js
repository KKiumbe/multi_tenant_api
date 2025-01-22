// routes/reportRoutes.js
const express = require('express');
const { getAllActiveCustomersReport } = require('../../controller/reports/allCustomers.js');
const { downloadInvoice } = require('../../controller/reports/invoicePDFGen.js');
const {getCurrentCustomersDebt, getCustomersWithHighDebt, getCustomersWithLowBalance} = require('../../controller/reports/debtReport.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const router = express.Router();

// Define the route for the debt report
router.get('/reports/customers-debt', verifyToken, checkAccess("invoices", "read"), getCurrentCustomersDebt);
router.get('/reports/customers',verifyToken, checkAccess("invoices", "read"), getAllActiveCustomersReport);
router.get('/reports/customers-debt-high',verifyToken, checkAccess("invoices", "read"), getCustomersWithHighDebt);
router.get('/reports/customers-debt-low',verifyToken, checkAccess("invoices", "read"), getCustomersWithLowBalance);



router.get('/download-invoice/:invoiceId',verifyToken, checkAccess("invoices", "read"), downloadInvoice);




module.exports = router;
