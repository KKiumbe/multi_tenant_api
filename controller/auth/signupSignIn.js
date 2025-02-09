const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role.js');
const { configureTenantSettings } = require('../smsConfig/config.js');
const prisma = new PrismaClient();
dotenv.config();



const register = async (req, res) => {
  const {
    firstName,
    lastName,
    phoneNumber,
    email,
    county,
    town,
    gender,
    password,
    tenantName,
  } = req.body;

  try {
    // Validate input fields
    if (!firstName || !lastName || !phoneNumber || !email || !password || !tenantName) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if phoneNumber already exists
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Phone number is already registered." });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Define the default role as 'ADMIN' for the first user
    const defaultRoles = ["ADMIN"]; // Use an array since `role` is an array field

    // Check if the roles exist in ROLE_PERMISSIONS
    const validRoles = Object.keys(ROLE_PERMISSIONS);
    const invalidRoles = defaultRoles.filter((role) => !validRoles.includes(role));

    if (invalidRoles.length > 0) {
      return res.status(500).json({
        message: `Default roles are not defined in ROLE_PERMISSIONS: ${invalidRoles.join(", ")}`,
      });
    }

    // Create a new user and tenant in a transaction
    const newUser = await prisma.$transaction(async (prisma) => {
      // Create the tenant (organization) with default values for plan and charge
      const newTenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          createdBy: phoneNumber, // This should be the user ID of the creator
          subscriptionPlan: "Default Plan",
          monthlyCharge: 0.0, // Can be updated later
        },
      });

      // Create the user and associate them with the tenant
      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          phoneNumber,
          email,
          county,
          town,
          gender,
          password: hashedPassword,
          role: { set: defaultRoles }, // Set roles array with the default role(s)
          tenantId: newTenant.id, // Link user to the created tenant
        },
      });

      

      return { user, tenantId: newTenant.id };
    });

    await configureTenantSettings(newUser.tenantId);

    res.status(201).json({
      message: "User and organization created successfully",
      user: newUser,
    });
  } catch (error) {
    console.error("Error registering user and organization:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



const signin = async (req, res) => {
  const { phoneNumber, password } = req.body;

  try {
    // Find the user by phone number
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: {
        tenant: true, // Include tenant details to confirm association, remove if unnecessary
      },
    });

    // Check if user exists
    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Compare the provided password with the hashed password in the database
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Generate a JWT token with the necessary claims
    const token = jwt.sign(
      { 
        id: user.id, 
        phoneNumber: user.phoneNumber, 
        role: user.role, 
        tenantId: user.tenantId 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' } // Token expires in 1 day
    );

    // Set the token in an HTTP-only cookie for security
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      maxAge: 24 * 60 * 60 * 1000, // Cookie expires in 1 day
    });

    // Exclude the password from the response and send user info
    const { password: userPassword, ...userInfo } = user;

    // Optionally, send back user-related info, depending on the application needs
    res.status(200).json({ message: 'Login successful', user: userInfo });

  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




module.exports = { register,signin}; // Ensure to export the functions
