const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

const ROLE_PERMISSIONS = require('../../DatabaseConfig/role.js');
const { configureTenantSettings } = require('../smsConfig/config.js');
const {prisma} = require('../../globalPrismaClient.js')
dotenv.config();

const ACTION_TYPES = {
  LOGIN: 'LOGIN',
  CREATED_USER: 'CREATED_USER',
  CREATED_TENANT: 'CREATED_TENANT',
};

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
    // Enhanced input validation
    if (!firstName || !lastName || !phoneNumber || !email || !password || !tenantName) {
      return res.status(400).json({ message: 'All fields (firstName, lastName, phoneNumber, email, password, tenantName) are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (phoneNumber.length < 9 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Phone number must be numeric and at least 9 digits' });
    }

    // Check for existing user by phoneNumber or email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phoneNumber }, { email }],
      },
    });

    if (existingUser) {
      const conflictField = existingUser.phoneNumber === phoneNumber ? 'Phone number' : 'Email';
      return res.status(400).json({ message: `${conflictField} is already registered` });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Define default roles
    const defaultRoles = ['ADMIN'];

    // Validate roles against ROLE_PERMISSIONS
    const validRoles = Object.keys(ROLE_PERMISSIONS);
    const invalidRoles = defaultRoles.filter((role) => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return res.status(500).json({
        message: `Invalid roles: ${invalidRoles.join(', ')}. Must be defined in ROLE_PERMISSIONS`,
      });
    }

    // Transaction to create tenant and user
    const { user, tenant } = await prisma.$transaction(async (tx) => {
      const tenantCount = await tx.tenant.count();

      // Create tenant first
      const newTenant = await tx.tenant.create({
        data: {
          name: tenantName,
          subscriptionPlan: 'Default Plan',
          monthlyCharge: 0.0,
          createdBy: firstName, // Set to null initially
          status: 'ACTIVE',
        },
      });

      // Create user with tenantId
      const newUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          phoneNumber,
          email,
          county: county || null,
          town: town || null,
          gender: gender || null,
          password: hashedPassword,
          role: defaultRoles,
          tenantId: newTenant.id, // Use newTenant.id after initialization
          lastLogin: new Date(),
          loginCount: 1,
          status: 'ACTIVE',
        },
      });

      // Update tenant with createdBy
      await tx.tenant.update({
        where: { id: newTenant.id },
        data: { createdBy: newUser.id.toString() }, // String since schema expects String
      });

      // Log user creation in UserActivity
      await tx.userActivity.create({
        data: {
          userId: newUser.id,
          tenantId: newTenant.id,
          action: ACTION_TYPES.CREATED_USER,
          details: {
            message: `User ${newUser.email} created`,
            userId: newUser.id,
            tenantId: newTenant.id,
          },
          timestamp: new Date(),
        },
      });

      // Log tenant creation in UserActivity
      await tx.userActivity.create({
        data: {
          userId: newUser.id,
          tenantId: newTenant.id,
          action: ACTION_TYPES.CREATED_TENANT,
          details: {
            message: `Tenant ${tenantName} created by user ${newUser.email}`,
            tenantId: newTenant.id,
          },
          timestamp: new Date(),
        },
      });

      return { user: newUser, tenant: newTenant };
    });

    // Configure tenant settings
    try {
      await configureTenantSettings(tenant.id);
    } catch (configError) {
      console.warn(`Failed to configure tenant settings for tenant ${tenant.id}:`, configError);
    }

    // Success response
    res.status(201).json({
      message: 'User and organization created successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        tenantId: tenant.id,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    });
  } catch (error) {
    console.error('Error registering user and organization:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Email, phone number, or tenant number already exists' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

const signin = async (req, res) => {
  const { phoneNumber, password } = req.body;

  // Validate input
  if (!phoneNumber || !password) {
    return res.status(400).json({ message: 'Phone number and password are required' });
  }

  try {
    // Use a transaction for atomic updates
    const [userInfo] = await prisma.$transaction(async (tx) => {
      // Find the user by phone number
      const user = await tx.user.findUnique({
        where: { phoneNumber },
        include: {
          tenant: true, // Include tenant details to confirm association
        },
      });

      // Check if user exists
      if (!user) {
        throw new Error('Invalid phone number or password');
      }

      // Compare the provided password with the hashed password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid phone number or password');
      }

      // Update last login and login count
      await tx.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          loginCount: { increment: 1 },
        },
      });

      // Log the login action in userActivity
      await tx.userActivity.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          action: ACTION_TYPES.LOGIN,
          details: { message: 'User logged in successfully' },
        },
      });

      // Exclude password from the user object
      const { password: userPassword, ...userInfo } = user;
      return [userInfo];
    });

    // Generate a JWT token
    const token = jwt.sign(
      {
        id: userInfo.id,
        phoneNumber: userInfo.phoneNumber,
        role: userInfo.role,
        tenantId: userInfo.tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Set the token in an HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    // Send response
    res.status(200).json({ message: 'Login successful', user: userInfo });
  } catch (error) {
    console.error('Error logging in:', error);

    // Handle specific errors
    if (error.message === 'Invalid phone number or password') {
      return res.status(401).json({ message: error.message });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Conflict with existing data' });
    }

    // Generic error
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { register, signin };