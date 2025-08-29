// routes/reportRoutes.js
const express = require('express');
const { getAllActiveCustomersReport, generateGarbageCollectionReport } = require('../../controller/reports/allCustomers.js');
const { downloadInvoice } = require('../../controller/reports/invoicePDFGen.js');
const {getCurrentCustomersDebt, getCustomersWithHighDebt, getCustomersWithLowBalance, getCustomersWithArrearsReport} = require('../../controller/reports/debtReport.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { generateAgeAnalysisReport } = require('../../controller/reports/ageAnalysisReport.js');
const { generateDormantCustomersReport } = require('../../controller/reports/dormantCustomers.js');
const { generateMonthlyInvoiceReport } = require('../../controller/reports/monthlyInvoiceReport.js');
const { generatePaymentReportPDF, generateMpesaReport, generateReceiptReport, generateIncomeReport } = require('../../controller/reports/payment/paymentReport.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const { TenantStatus } = require('@prisma/client');
const router = express.Router();

// Define the route for the debt report

router.get('/reports/customers',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), getAllActiveCustomersReport); //done

router.get('/reports/dormant',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("customer", "read"), generateDormantCustomersReport); //done

router.get('/reports/customer-per-collection-day',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("customer", "read"), generateGarbageCollectionReport); //done

router.get('/reports/monthly-invoice',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), generateMonthlyInvoiceReport); //done

router.get('/reports/age-analysis',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), generateAgeAnalysisReport); //done
router.get('/reports/customers-debt-high',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), getCustomersWithHighDebt);
router.get('/reports/customers-debt-low',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), getCustomersWithLowBalance);
 router.post('/reports/customer-with-balance', verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), getCustomersWithArrearsReport)


router.get('/download-invoice/:invoiceId',verifyToken,  checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("invoices", "read"), downloadInvoice); 





router.get('/reports/payments',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("payments", "read"), generatePaymentReportPDF); //done


router.get('/reports/mpesa',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess("payments", "read"),  generateMpesaReport);

router.get('/reports/receipts',verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess("payments", "read"), generateReceiptReport);

router.get('/reports/income',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess("payments", "read"), generateIncomeReport);






  
module.exports = router;
