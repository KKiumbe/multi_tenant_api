const express = require('express');

const { getAllInvoices, generateInvoices, cancelInvoiceById, createInvoice, getInvoiceDetails, generateInvoicesByDay } = require('../../controller/bill/billGenerator.js');
const { SearchInvoices } = require('../../controller/bill/searchInvoice.js');
const { addSmsJob } = require('../../controller/bulkSMS/sendSMSJob.js');
const { cancelSystemGenInvoices } = require('../../controller/bill/cancelJob.js');
const verifyToken = require('../../middleware/verifyToken.js');

const router = express.Router();




router.get('/invoices/all',verifyToken, getAllInvoices );

router.get('/invoices/search',verifyToken, SearchInvoices)
router.get('/invoices/:id/',verifyToken, getInvoiceDetails)
router.put('/invoices/cancel/:invoiceId/', verifyToken, cancelInvoiceById);

// Route to create a manual invoice
router.post('/invoices', verifyToken,createInvoice);

router.post('/send-bulk-sms', addSmsJob);


// Route to generate invoices for all active customers for a specified month
router.post('/invoices/generate', verifyToken,generateInvoices);

router.post('/invoices-generate-day',generateInvoicesByDay)



// Route to cancel system-generated invoices for a specific customer and month
router.patch('/invoices/cancel', cancelSystemGenInvoices);


module.exports = router;
