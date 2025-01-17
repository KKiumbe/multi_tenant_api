// routes/reportRoutes.js
const express = require('express');
const { getAllActiveCustomersReport } = require('../../controller/reports/allCustomers.js');
const { downloadInvoice } = require('../../controller/reports/invoicePDFGen.js');
const {getCurrentCustomersDebt, getCustomersWithHighDebt, getCustomersWithLowBalance} = require('../../controller/reports/debtReport.js')
const router = express.Router();

// Define the route for the debt report
router.get('/reports/customers-debt', getCurrentCustomersDebt);
router.get('/reports/customers', getAllActiveCustomersReport);
router.get('/reports/customers-debt-high', getCustomersWithHighDebt);
router.get('/reports/customers-debt-low', getCustomersWithLowBalance);



router.get('/download-invoice/:invoiceId', downloadInvoice);




module.exports = router;
