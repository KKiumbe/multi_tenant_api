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
  const requiredFields = [
    'firstName',
    'lastName',
    'phoneNumber',
    'monthlyCharge',
    'garbageCollectionDay',
    'estateName',
    'building',
    'closingBalance'
  ];

  // Trim whitespace from all fields
  const trimmedData = {};
  for (const field in data) {
    trimmedData[field] = typeof data[field] === 'string' ? data[field].trim() : data[field];
  }

  // Check for missing or empty required fields
  for (const field of requiredFields) {
    if (!trimmedData[field] || trimmedData[field] === '') {
      console.warn(`Missing or empty required field: ${field} for customer ${trimmedData.firstName || 'Unknown'}`);
      return null;
    }
  }

  // Validate numeric fields
  const monthlyCharge = parseFloat(trimmedData.monthlyCharge);
  const closingBalance = parseFloat(trimmedData.closingBalance);
  if (isNaN(monthlyCharge)) {
    console.warn(`Invalid monthlyCharge: ${trimmedData.monthlyCharge} for customer ${trimmedData.firstName || 'Unknown'}`);
    return null;
  }
  if (isNaN(closingBalance)) {
    console.warn(`Invalid closingBalance: ${trimmedData.closingBalance} for customer ${trimmedData.firstName || 'Unknown'}`);
    return null;
  }

  // Standardize garbageCollectionDay to title case for consistency
  const garbageCollectionDay = trimmedData.garbageCollectionDay.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  // Parse fields
  return {
    firstName: trimmedData.firstName,
    lastName: trimmedData.lastName,
    email: trimmedData.email || null,
    phoneNumber: trimmedData.phoneNumber,
    secondaryPhoneNumber: trimmedData.secondaryPhoneNumber || null,
    gender: trimmedData.gender || null,
    county: trimmedData.county || null,
    town: trimmedData.town || null,
    location: trimmedData.location || null,
    estateName: trimmedData.estateName,
    building: trimmedData.building,
    houseNumber: trimmedData.houseNumber || null,
    category: trimmedData.category || null,
    monthlyCharge: monthlyCharge,
    status: 'ACTIVE', // default status
    garbageCollectionDay: garbageCollectionDay,
    collected: trimmedData.collected ? trimmedData.collected.toLowerCase() === 'true' : false,
    closingBalance: closingBalance,
  };
};

// Controller function to upload and process CSV (unchanged structure, using updated validateCustomerData)
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
  const requiredFields = [
    'firstName',
    'lastName',
    'phoneNumber',
    'monthlyCharge',
    'garbageCollectionDay',
    'estateName',
    'building',
    'closingBalance'
  ];

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

    // Validate CSV headers
    let headersValidated = false;
    let headers = [];

    const stream = fs.createReadStream(filePath).pipe(csv());

    stream
      .on('headers', (headerList) => {
        headers = headerList.map((header) => header.trim()); // Trim any whitespace from headers
        const missingFields = requiredFields.filter((field) => !headers.includes(field));

        if (missingFields.length > 0) {
          stream.destroy(); // Stop the stream
          fs.unlinkSync(filePath); // Delete the uploaded file
          return res.status(400).json({
            message: `CSV file is missing required fields: ${missingFields.join(', ')}. Required fields are: ${requiredFields.join(', ')}`,
          });
        }

        // Check for extra fields
        const extraFields = headers.filter((header) =>
          !requiredFields.includes(header) &&
          !['email', 'secondaryPhoneNumber', 'gender', 'county', 'town', 'location', 'houseNumber', 'category', 'collected'].includes(header)
        );
        if (extraFields.length > 0) {
          stream.destroy(); // Stop the stream
          fs.unlinkSync(filePath); // Delete the uploaded file
          return res.status(400).json({
            message: `CSV file contains invalid fields: ${extraFields.join(', ')}. Only allowed fields are: ${requiredFields.join(', ')} plus optional fields (email, secondaryPhoneNumber, gender, county, town, location, houseNumber, category, collected)`,
          });
        }

        headersValidated = true;
      })
      .on('data', (data) => {
        if (!headersValidated) return; // Skip data processing if headers are invalid

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
        if (!headersValidated) return; // If headers were invalid, the response was already sent

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
        } finally {
          // Clean up the uploaded file
          fs.unlinkSync(filePath);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        res.status(500).json({ message: 'Error processing file' });
      });
  } catch (error) {
    console.error('Error validating tenant or fetching existing customers:', error);
    res.status(500).json({ message: 'Error validating tenant or checking existing customers.' });
  }
};

// Controller function to update customers' closing balance (unchanged)
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
  const requiredFields = ['phoneNumber', 'closingBalance'];

  try {
    // Validate CSV headers for update
    let headersValidated = false;
    let headers = [];

    const stream = fs.createReadStream(filePath).pipe(csv());

    stream
      .on('headers', (headerList) => {
        headers = headerList.map((header) => header.trim());
        const missingFields = requiredFields.filter((field) => !headers.includes(field));

        if (missingFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file is missing required fields: ${missingFields.join(', ')}. Required fields are: ${requiredFields.join(', ')}`,
          });
        }

        // Check for extra fields
        const extraFields = headers.filter((header) => !requiredFields.includes(header));
        if (extraFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file contains invalid fields: ${extraFields.join(', ')}. Only allowed fields are: ${requiredFields.join(', ')}`,
          });
        }

        headersValidated = true;
      })
      .on('data', (data) => {
        if (!headersValidated) return;

        if (data.phoneNumber && data.closingBalance) {
          const closingBalance = parseFloat(data.closingBalance);
          if (isNaN(closingBalance)) {
            console.warn(`Invalid closingBalance: ${data.closingBalance} for phoneNumber: ${data.phoneNumber}`);
            return;
          }
          updates.push({
            phoneNumber: data.phoneNumber,
            closingBalance: closingBalance,
          });
        } else {
          console.warn('Invalid data row, missing phoneNumber or closingBalance:', data);
        }
      })
      .on('end', async () => {
        if (!headersValidated) return;

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
        } finally {
          fs.unlinkSync(filePath);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        res.status(500).json({ message: 'Error processing file' });
      });
  } catch (error) {
    console.error('Error in updateCustomersClosingBalance:', error);
    res.status(500).json({ message: 'Error processing update' });
  }
};

// Export the upload middleware and controller functions
module.exports = {
  upload,
  uploadCustomers,
  updateCustomersClosingBalance,
};