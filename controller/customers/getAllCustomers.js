// Import Prisma Client
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); 

// Get all customers for the authenticated tenant
const getAllCustomers = async (req, res) => {
    try {
        // Assuming tenantId is provided in req.user by the authentication middleware
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID is required' });
        }

        // Fetch customers for the specific tenant
        const customers = await prisma.customer.findMany({
            where: { tenantId }, // Filter customers by tenantId
        });

        res.status(200).json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Export the function
module.exports = { getAllCustomers };
