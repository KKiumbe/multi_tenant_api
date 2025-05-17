// routes/customerRoutes.js
const express = require('express');
const { register, signin } = require('../../controller/auth/signupSignIn.js');
const { registerUser } = require('../../controller/users/register.js');
const authenticateAdmin = require('../../middleware/authenticateAdmin.js');
const { requestOTP, verifyOTP, resetPassword } = require('../../controller/auth/resetPassword.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { checkTenantStatus, requireTenantStatus } = require('../../middleware/requireTenantStatus.js');
const { TenantStatus } = require('@prisma/client');

// requestOTP,
//   verifyOTP,
//   resetPassword,

const router = express.Router();

// Route to create a new customer
router.post('/signup', register);
router.post('/signin', signin);
router.post('/adduser',verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess('user','create'), registerUser)

router.post('/request-otp', requestOTP); // No auth required
router.post('/verify-otp', verifyOTP);   // No auth required
router.post('/reset-password', resetPassword);


module.exports = router;
