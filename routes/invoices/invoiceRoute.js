const express = require('express');

const { getAllInvoices, generateInvoices, cancelInvoiceById, createInvoice, getInvoiceDetails, generateInvoicesByDay, generateInvoicesPerTenant, searchInvoices, generateInvoicesForAll, cancelCustomerInvoice } = require('../../controller/bill/billGenerator.js');
const { SearchInvoices, searchInvoicesByPhone, searchInvoicesByName } = require('../../controller/bill/searchInvoice.js');
const { addSmsJob } = require('../../controller/bulkSMS/sendSMSJob.js');
const { cancelSystemGenInvoices } = require('../../controller/bill/cancelJob.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const { TenantStatus } = require('@prisma/client');

const router = express.Router();




router.get('/invoices/all',verifyToken,checkAccess('invoices', 'read'), getAllInvoices );
router.patch('/invoice/cancel/:id', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('invoices', 'update'), cancelCustomerInvoice );

router.get('/invoices/search-by-phone',verifyToken,checkAccess('invoices', 'read'), searchInvoicesByPhone);

router.get('/invoices/search-by-name',verifyToken, checkAccess('invoices', 'read'),searchInvoicesByName);
router.get('/invoices/:id/',verifyToken,checkAccess('invoices', 'read'), getInvoiceDetails);
router.put('/invoices/cancel/:invoiceId', verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('invoices', 'update'), cancelInvoiceById);

// Route to create a manual invoice
router.post('/invoices', verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('invoices', 'create'),createInvoice);

router.post('/send-bulk-sms', addSmsJob);


// Route to generate invoices for all active customers for a specified month
router.post('/invoices/generate', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('invoices', 'create'),generateInvoices);

router.post('/invoices-generate-day',checkAccess('invoices', 'create'),generateInvoicesByDay)


router.post('/invoices-generate-tenant',generateInvoicesPerTenant)


router.post('/generate-invoices-for-all',verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('invoices', 'create'),generateInvoicesForAll)



// Route to cancel system-generated invoices for a specific customer and month
router.patch('/invoices/cancel',verifyToken, checkAccess('invoices', 'update'),cancelSystemGenInvoices);


module.exports = router;
