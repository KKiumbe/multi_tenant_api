const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { sendBills, sendToAll, sendBill, sendBillPerDay, sendToGroup, sendToOne, sendUnpaidCustomers, sendLowBalanceCustomers, sendHighBalanceCustomers, sendCustomersAboveBalance, sendBillsEstate, sendToEstate } = require('../../controller/sms/sms.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { updateSMSConfig, createSMSConfig } = require('../../controller/smsConfig/smsConfig.js');
const { updateSmsDeliveryStatus, getSmsMessages } = require('../../controller/bulkSMS/deliveryStatus.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const {TenantStatus} =require('@prisma/client');





const router = express.Router();

// SMS Routes
router.post('/send-bills', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendBills);//done

router.post('/send-bills-per-estate', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendBillsEstate);//done
router.post('/send-to-all', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendToAll);//done
router.post('/send-to-estate', verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendToEstate);//done

router.post('/send-bill', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendBill);//done
router.post('/send-bill-perday', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendBillPerDay); //done
router.post('/send-to-group', verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'),sendToGroup); //done
router.post('/send-sms', verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendToOne ); //done

router.put('/sms-config-update',verifyToken,checkAccess('sms', 'update'), updateSMSConfig);  //done
router.post('/sms-config',verifyToken, checkAccess('sms', 'create'), createSMSConfig);  //done

router.post('/send-sms-unpaid' ,verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'), sendUnpaidCustomers); //done

router.post('/send-sms-low-balance',verifyToken, checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]),checkAccess('sms', 'create'), sendLowBalanceCustomers); //done

router.post('/send-sms-high-balance',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'),sendHighBalanceCustomers); //done


router.post('/send-sms-custom-balance',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('sms', 'create'),sendCustomersAboveBalance);

router.get('/sms-delivery-report' ,verifyToken,checkAccess('sms', 'read'), updateSmsDeliveryStatus);
router.get('/sms-history',verifyToken,checkAccess('sms', 'read'), getSmsMessages);
//router.post('/auto-sms' , sendSMS)

module.exports = router;