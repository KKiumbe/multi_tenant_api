const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Save to uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Append timestamp to filename
  },
});

const upload = multer({ storage });

// Helper function to validate and transform customer data
const validateCustomerData = (data) => {
  const requiredFields = ['firstName', 'lastName', 'phoneNumber', 'monthlyCharge', 'garbageCollectionDay'];

  // Check for missing required fields
  for (const field of requiredFields) {
    if (!data[field]) {
      console.warn(`Missing required field: ${field} for customer ${data.firstName || 'Unknown'}`);
      return null;
    }
  }



  // Parse fields
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phoneNumber: data.phoneNumber,
    secondaryPhoneNumber: data.secondaryPhoneNumber || null,
    gender: data.gender || null,
    county: data.county || null,
    town: data.town || null,
    location: data.location || null,
    estateName: data.estateName || null,
    building: data.building || null,
    houseNumber: data.houseNumber || null,
    category: data.category || null,
    monthlyCharge: parseFloat(data.monthlyCharge),
    status: 'ACTIVE', // default status
    garbageCollectionDay: data.garbageCollectionDay,
    collected: data.collected ? data.collected.toLowerCase() === 'true' : false,
    closingBalance: parseFloat(data.closingBalance) || 0.0,
  };
};

// Controller function to upload and process CSV


const uploadCustomers = async (req, res) => {
  const { tenantId } = req.user; // Extract tenantId from the authenticated user

  console.log('Tenant ID from authenticated user:', tenantId);


  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required for uploading customers.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const customers = [];
  const existingPhoneNumbers = new Set();

  try {

    
    // Validate tenantId
    const tenantExists = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenantExists) {
      return res.status(404).json({ message: 'Invalid tenant ID. Tenant does not exist.' });
    }

    // Fetch existing customer data for this tenant to prevent duplicates
    const existingCustomers = await prisma.customer.findMany({
      where: { tenantId },
      select: { phoneNumber: true },
    });

    existingCustomers.forEach((customer) => {
      if (customer.phoneNumber) existingPhoneNumbers.add(customer.phoneNumber);
    });
  } catch (error) {
    console.error('Error validating tenant or fetching existing customers:', error);
    return res.status(500).json({ message: 'Error validating tenant or checking existing customers.' });
  }

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => {
      const customer = validateCustomerData(data);

      if (!customer) return; // Skip invalid data

      // Check for duplicate phone numbers within the tenant
      if (existingPhoneNumbers.has(customer.phoneNumber)) {
        console.warn(`Duplicate phone number found: ${customer.phoneNumber}. Skipping entry.`);
        return;
      }

      // Add tenantId to each customer
      customer.tenantId = tenantId;

      // Add to customers array if valid
      customers.push(customer);
      existingPhoneNumbers.add(customer.phoneNumber);
    })
    .on('end', async () => {
      try {
        if (customers.length > 0) {
          await prisma.customer.createMany({ data: customers });
          res.status(200).json({ message: 'Customers uploaded successfully', customers });
        } else {
          res.status(400).json({ message: 'No valid customers to upload' });
        }
      } catch (error) {
        console.error('Error saving customers:', error);
        res.status(500).json({ message: 'Error saving customers' });
      }
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).json({ message: 'Error processing file' });
    });
};




const updateCustomersClosingBalance = async (req, res) => {
  const { tenantId } = req.user; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required for updating balances.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const updates = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => {
      if (data.phoneNumber && data.closingBalance) {
        updates.push({
          phoneNumber: data.phoneNumber,
          closingBalance: parseFloat(data.closingBalance),
        });
      } else {
        console.warn('Invalid data row, missing phoneNumber or closingBalance:', data);
      }
    })
    .on('end', async () => {
      try {
        for (const update of updates) {
          await prisma.customer.updateMany({
            where: {
              phoneNumber: update.phoneNumber,
              tenantId, // Ensure the customer belongs to the authenticated tenant
            },
            data: { closingBalance: update.closingBalance },
          });
        }

        res.status(200).json({ message: 'Customers updated successfully', updates });
      } catch (error) {
        console.error('Error updating customers:', error);
        res.status(500).json({ message: 'Error updating customers' });
      }
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).json({ message: 'Error processing file' });
    });
};




 
// Export the upload middleware and controller function for use in other files
module.exports = {
  upload,
  uploadCustomers,updateCustomersClosingBalance
};
