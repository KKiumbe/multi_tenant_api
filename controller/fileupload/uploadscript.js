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

  // Set garbageCollectionDay to "MONDAY" if not provided or empty
  const garbageCollectionDay = trimmedData.garbageCollectionDay ? trimmedData.garbageCollectionDay.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'MONDAY';

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



const uploadCustomers = async (req, res) => {
  const { tenantId } = req.user;
  console.log('Tenant ID from authenticated user:', tenantId);

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required for uploading customers.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const customersToUpload = [];
  const existingPhoneNumbers = new Set();
  const skippedDuplicates = []; // Track duplicates
  const skippedMissingFields = []; // Track entries with missing fields
  const requiredFields = [
    'firstName',
    'lastName',
    'phoneNumber',
    'monthlyCharge',
    'estateName',
    'building',
    'closingBalance',
  ];

  try {
    // Validate tenantId
    const tenantExists = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenantExists) {
      return res.status(404).json({ message: 'Invalid tenant ID. Tenant does not exist.' });
    }

    // Fetch all existing phone numbers across all tenants
    const allCustomers = await prisma.customer.findMany({
      select: { phoneNumber: true },
    });

    allCustomers.forEach((customer) => {
      if (customer.phoneNumber) existingPhoneNumbers.add(customer.phoneNumber);
    });

    // Validate CSV headers
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

        const extraFields = headers.filter(
          (header) =>
            !requiredFields.includes(header) &&
            !['email', 'secondaryPhoneNumber', 'gender', 'county', 'town', 'location', 'houseNumber', 'category', 'collected', 'garbageCollectionDay'].includes(header)
        );
        if (extraFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file contains invalid fields: ${extraFields.join(', ')}. Only allowed fields are: ${requiredFields.join(', ')} plus optional fields (email, secondaryPhoneNumber, gender, county, town, location, houseNumber, category, collected, garbageCollectionDay)`,
          });
        }

        headersValidated = true;
      })
      .on('data', (data) => {
        if (!headersValidated) return;

        // Validate required fields
        const missingFields = requiredFields.filter((field) => !data[field] || data[field].trim() === '');
        if (missingFields.length > 0) {
          console.log(`Missing or empty required field(s): ${missingFields.join(', ')} for customer ${data.firstName || 'Unknown'}`);
          skippedMissingFields.push({
            customer: data.firstName || 'Unknown',
            phoneNumber: data.phoneNumber || 'N/A',
            missingFields,
          });
          return;
        }

        const customer = {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          phoneNumber: data.phoneNumber.trim(),
          monthlyCharge: parseFloat(data.monthlyCharge),
          estateName: data.estateName.trim(),
          building: data.building.trim(),
          closingBalance: parseFloat(data.closingBalance),
          tenantId,
          email: data.email ? data.email.trim() : null,
          secondaryPhoneNumber: data.secondaryPhoneNumber ? data.secondaryPhoneNumber.trim() : null,
          gender: data.gender ? data.gender.trim() : null,
          county: data.county ? data.county.trim() : null,
          town: data.town ? data.town.trim() : null,
          location: data.location ? data.location.trim() : null,
          houseNumber: data.houseNumber ? data.houseNumber.trim() : null,
          category: data.category ? data.category.trim() : null,
          collected: data.collected ? data.collected.trim() : null,
          garbageCollectionDay: data.garbageCollectionDay ? data.garbageCollectionDay.trim() : null,
          status: 'ACTIVE', // Default status
        };

        // Validate numerical fields
        if (isNaN(customer.monthlyCharge) || isNaN(customer.closingBalance)) {
          console.log(`Invalid numerical field for customer ${customer.firstName}`);
          skippedMissingFields.push({
            customer: customer.firstName,
            phoneNumber: customer.phoneNumber,
            missingFields: ['Invalid monthlyCharge or closingBalance'],
          });
          return;
        }

        // Check for duplicates across all tenants
        if (existingPhoneNumbers.has(customer.phoneNumber)) {
          console.warn(`Duplicate phone number found: ${customer.phoneNumber}. Skipping entry.`);
          skippedDuplicates.push({
            customer: customer.firstName,
            phoneNumber: customer.phoneNumber,
          });
          return;
        }

        customersToUpload.push(customer);
        existingPhoneNumbers.add(customer.phoneNumber);
      })
      .on('end', async () => {
        if (!headersValidated) return;

        try {
          if (customersToUpload.length > 0) {
            await prisma.customer.createMany({ data: customersToUpload });
            res.status(200).json({
              message: `${customersToUpload.length} customers uploaded successfully`,
              uploadedCount: customersToUpload.length,
              skippedDuplicates,
              skippedMissingFields,
            });
          } else {
            res.status(200).json({
              message: 'No new customers to upload',
              uploadedCount: 0,
              skippedDuplicates,
              skippedMissingFields,
            });
          }
        } catch (error) {
          console.error('Error saving customers:', error);
          res.status(500).json({
            message: 'Error saving customers',
            error: error.message,
            skippedDuplicates,
            skippedMissingFields,
          });
        } finally {
          fs.unlinkSync(filePath);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        res.status(500).json({ message: 'Error processing file', error: error.message });
      });
  } catch (error) {
    console.error('Error validating tenant or fetching existing customers:', error);
    res.status(500).json({ message: 'Error validating tenant or checking existing customers.' });
  }
};




const updateCustomersClosingBalance = async (req, res) => {
  const { tenantId } = req.user;

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
    const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenantExists) {
      fs.unlinkSync(filePath);
      return res.status(404).json({ message: 'Invalid tenant ID. Tenant does not exist.' });
    }

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
        const phoneNumber = data.phoneNumber?.trim();
        const closingBalance = parseFloat(data.closingBalance);
        if (!phoneNumber || isNaN(closingBalance)) {
          console.warn(`Invalid data: phoneNumber=${phoneNumber}, closingBalance=${data.closingBalance}`);
          return;
        }
        updates.push({ phoneNumber, closingBalance });
      })
      .on('end', async () => {
        if (!headersValidated) return;
        if (updates.length === 0) {
          fs.unlinkSync(filePath);
          return res.status(400).json({ message: 'No valid data found in the CSV file' });
        }
        try {
          const updatePromises = updates.map((update) =>
            prisma.customer.updateMany({
              where: { phoneNumber: update.phoneNumber, tenantId },
              data: { closingBalance: update.closingBalance },
            })
          );
          const results = await Promise.all(updatePromises);
          const updatedCount = results.reduce((sum, result) => sum + result.count, 0);
          if (updatedCount === 0) {
            res.status(404).json({ message: 'No customers found to update with the provided phone numbers' });
          } else {
            res.status(200).json({ message: `Successfully updated ${updatedCount} customer(s)`, updatedCount, updates });
          }
        } catch (error) {
          console.error('Error updating customers:', error);
          res.status(500).json({ message: 'Error updating customer balances' });
        } finally {
          fs.unlinkSync(filePath);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        fs.unlinkSync(filePath);
        res.status(500).json({ message: 'Error processing CSV file' });
      });
  } catch (error) {
    console.error('Error in updateCustomersClosingBalance:', error);
    fs.unlinkSync(filePath);
    res.status(500).json({ message: 'Server error during update process' });
  }
};

// New controller function to update customer details (estateName, building, houseNumber, category)
const updateCustomersDetails = async (req, res) => {
  const { tenantId } = req.user;

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required for updating customer details.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const updates = [];
  const requiredField = ['phoneNumber']; // Only phoneNumber is mandatory
  const allowedFields = ['phoneNumber', 'estateName', 'building', 'houseNumber', 'category'];

  try {
    const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenantExists) {
      fs.unlinkSync(filePath);
      return res.status(404).json({ message: 'Invalid tenant ID. Tenant does not exist.' });
    }

    let headersValidated = false;
    let headers = [];

    const stream = fs.createReadStream(filePath).pipe(csv());

    stream
      .on('headers', (headerList) => {
        headers = headerList.map((header) => header.trim());
        const missingFields = requiredField.filter((field) => !headers.includes(field));
        if (missingFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file is missing required field: ${missingFields.join(', ')}. Required field is: phoneNumber`,
          });
        }

        // Check for invalid fields
        const extraFields = headers.filter((header) => !allowedFields.includes(header));
        if (extraFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file contains invalid fields: ${extraFields.join(', ')}. Allowed fields are: ${allowedFields.join(', ')}`,
          });
        }

        headersValidated = true;
      })
      .on('data', (data) => {
        if (!headersValidated) return;

        const phoneNumber = data.phoneNumber?.trim();
        if (!phoneNumber) {
          console.warn(`Invalid data: Missing phoneNumber in row: ${JSON.stringify(data)}`);
          return;
        }

        // Build update object with only provided fields
        const updateData = { phoneNumber };
        if (data.estateName?.trim()) updateData.estateName = data.estateName.trim();
        if (data.building?.trim()) updateData.building = data.building.trim();
        if (data.houseNumber?.trim()) updateData.houseNumber = data.houseNumber.trim();
        if (data.category?.trim()) updateData.category = data.category.trim();

        updates.push(updateData);
      })
      .on('end', async () => {
        if (!headersValidated) return;
        if (updates.length === 0) {
          fs.unlinkSync(filePath);
          return res.status(400).json({ message: 'No valid data found in the CSV file' });
        }

        try {
          const updatePromises = updates.map((update) => {
            const dataToUpdate = {};
            if (update.estateName) dataToUpdate.estateName = update.estateName;
            if (update.building) dataToUpdate.building = update.building;
            if (update.houseNumber) dataToUpdate.houseNumber = update.houseNumber;
            if (update.category) dataToUpdate.category = update.category;

            return prisma.customer.updateMany({
              where: { phoneNumber: update.phoneNumber, tenantId },
              data: dataToUpdate,
            });
          });

          const results = await Promise.all(updatePromises);
          const updatedCount = results.reduce((sum, result) => sum + result.count, 0);

          if (updatedCount === 0) {
            res.status(404).json({ message: 'No customers found to update with the provided phone numbers' });
          } else {
            res.status(200).json({
              message: `Successfully updated ${updatedCount} customer(s)`,
              updatedCount,
              updates,
            });
          }
        } catch (error) {
          console.error('Error updating customer details:', error);
          res.status(500).json({ message: 'Error updating customer details' });
        } finally {
          fs.unlinkSync(filePath);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        fs.unlinkSync(filePath);
        res.status(500).json({ message: 'Error processing CSV file' });
      });
  } catch (error) {
    console.error('Error in updateCustomersDetails:', error);
    fs.unlinkSync(filePath);
    res.status(500).json({ message: 'Server error during update process' });
  }
};

// Export the upload middleware and controller functions
module.exports = {
  upload,
  uploadCustomers,
  updateCustomersClosingBalance,
  updateCustomersDetails,
};