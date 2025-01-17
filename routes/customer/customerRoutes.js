// routes/customerRoutes.js
const express = require('express');
const { createCustomer } = require('../../controller/customers/createCustomer.js');
const { getAllCustomers } = require('../../controller/customers/getAllCustomers.js');
const { editCustomer } = require('../../controller/customers/editCustomer.js');
const { SearchCustomers } = require('../../controller/customers/searchCustomers.js');
const checkAccess = require('../../middleware/roleVerify.js');
const verifyToken = require('../../middleware/verifyToken.js');
const { getCustomerDetails } = require('../../controller/customers/customerDetails.js');



const router = express.Router();

// Route to create a new customer
router.post(
    '/customers',verifyToken, checkAccess('customer','create'),
 
    createCustomer // Step 3: Proceed to the controller if authorized
);
router.get('/customers', verifyToken, checkAccess('customer','read') ,getAllCustomers);
router.put('/customers/:id',verifyToken,checkAccess('customer','update'), editCustomer);
router.get('/search-customers',verifyToken, SearchCustomers);
router.get('/customer-details/:id',verifyToken, getCustomerDetails);


module.exports = router;

