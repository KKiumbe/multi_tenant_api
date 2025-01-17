const { PrismaClient } = require('@prisma/client'); // Import Prisma Client
const prisma = new PrismaClient(); // Create an instance of Prisma Client

// Helper function to sanitize phone numbers
const sanitizePhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove all non-numeric characters
    let sanitized = phone.replace(/\D/g, '');

    // Normalize the phone number to start with +254
    if (sanitized.startsWith('0')) {
        sanitized = '+254' + sanitized.substring(1);
    } else if (sanitized.startsWith('254')) {
        sanitized = '+254' + sanitized.substring(3);
    } else if (!sanitized.startsWith('+254')) {
        sanitized = '+254' + sanitized;
    }

    return sanitized;
};

const SearchCustomers = async (req, res) => {
    const { phone, name } = req.query;
    const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user
    console.log("Tenant ID:", tenantId);
    console.log("Raw phone number:", phone);

    if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID is required' });
    }

    try {
        // If phone is provided, sanitize and search for an exact match
        if (phone) {
            const sanitizedPhone = sanitizePhoneNumber(phone);
            console.log("Sanitized phone number:", sanitizedPhone);

            const uniqueCustomer = await prisma.customer.findMany({
                where: {
                    phoneNumber: sanitizedPhone, // Exact match for phone
                    tenantId, // Filter by tenantId
                },
            });

            // Return the customer if found, otherwise return null
            return res.json(uniqueCustomer.length ? uniqueCustomer : { message: 'No customers found' });
        }

        // If name is provided, search by first or last name
        let query = {
            where: {
                tenantId, // Filter by tenantId
            },
        };

        if (name) {
            query.where.OR = [
                {
                    firstName: {
                        contains: name, // Pattern matching for first name
                        mode: 'insensitive', // Case insensitive
                    },
                },
                {
                    lastName: {
                        contains: name, // Pattern matching for last name
                        mode: 'insensitive', // Case insensitive
                    },
                },
            ];
        }

        // Fetch customers based on the query
        const customers = await prisma.customer.findMany(query);

        if (!customers.length) {
            return res.status(404).json({ message: "No customers found" });
        }

        res.json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ message: 'Error fetching customers' });
    }
};

module.exports = { SearchCustomers };
