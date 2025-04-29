const express = require('express');
const { getCollections, markCustomerAsCollected, filterCustomersByDay } = require('../../controller/collection/collection.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');


const router = express.Router();

// 1. Load all customers with their collection status by collection day
router.get('/collections',verifyToken,checkAccess('customer', 'read'), getCollections);

// 2. Mark customer as collected
router.patch('/collections/:customerId',verifyToken, checkAccess('customer', 'read'), markCustomerAsCollected);

// 3. Filter customers by collection day
router.get('/collections/filter',verifyToken, checkAccess('customer', 'read'), filterCustomersByDay);

module.exports = router;
