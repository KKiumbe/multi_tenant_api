const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();



// Example additional function
async function getCustomerCount() {
  try {
    const count = await prisma.customer.count();
    console.log(`Found ${count} customers.`);
    return count;
  } catch (error) {
    console.error('Error counting customers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
 
  getCustomerCount,
};