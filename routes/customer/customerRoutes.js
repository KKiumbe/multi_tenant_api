// routes/customerRoutes.js
const express = require('express');
const { createCustomer } = require('../../controller/customers/createCustomer.js');
const { getAllCustomers, deleteAllCustomers } = require('../../controller/customers/getAllCustomers.js');
const { editCustomer } = require('../../controller/customers/editCustomer.js');
const { SearchCustomers, SearchCustomersByPhoneNumber, SearchCustomersByName } = require('../../controller/customers/searchCustomers.js');
const checkAccess = require('../../middleware/roleVerify.js');
const verifyToken = require('../../middleware/verifyToken.js');
const { getCustomerDetails, deleteCustomer } = require('../../controller/customers/customerDetails.js');
const { clearCustomerData } = require('../../controller/customers/delete/delete.js');
const { getCustomerActivity } = require('../../controller/customers/activities.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const {TenantStatus} = require('@prisma/client');



const router = express.Router();

// Route to create a new customer
router.post(
    '/customers',verifyToken,  checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('customer','create'),
 
    createCustomer // Step 3: Proceed to the controller if authorized
);
router.get('/customers', verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('customer','read') ,getAllCustomers);
router.put('/customers/:id',verifyToken,  checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('customer','update'), editCustomer);
router.get('/search-customers',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), SearchCustomers);
router.delete('/customers/:id',verifyToken, checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('customer','delete'), deleteCustomer);

router.get('/search-customer-by-phone',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),  checkAccess('customer','read'), SearchCustomersByPhoneNumber);

router.get('/search-customer-by-name',verifyToken, checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('customer','read'), SearchCustomersByName
);
router.get('/customer-details/:id',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]),  checkAccess('customer','read'), getCustomerDetails);

router.get('/customer-activity/:id',verifyToken,checkTenantStatus,requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('customer','read'), getCustomerActivity);
 

//DELETE ALL CUSTOMERS

router.delete('/customers',verifyToken, checkAccess('customer','delete'), deleteAllCustomers);

module.exports = router;

