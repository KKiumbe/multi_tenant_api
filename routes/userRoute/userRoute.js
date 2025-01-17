// routes/customerRoutes.js
const express = require('express');
const { register, signin } = require('../../controller/auth/signupSignIn.js');
const { registerUser } = require('../../controller/users/register.js');
const authenticateAdmin = require('../../middleware/authenticateAdmin.js');



const router = express.Router();

// Route to create a new customer
router.post('/signup', register);
router.post('/signin', signin);
router.post('/adduser',authenticateAdmin, registerUser)


module.exports = router;
