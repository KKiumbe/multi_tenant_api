const {prisma} = require('../../globalPrismaClient.js')

// GET: Fetch activity history for a specific customer, including actions and details
const getCustomerActivity = async (req, res) => {
  const { id: customerId } = req.params; // Customer ID from URL
  const userId = req.user?.user; // User ID from JWT middleware
  const tenantId = req.user?.tenantId; // Tenant ID from JWT middleware
  const { limit = 50, offset = 0 } = req.query; // Pagination params

  // Validate inputs
  if (!customerId) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }
  if (!userId || !tenantId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify the current user exists
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });

    if (!currentUser || currentUser.tenantId !== tenantId) {
      return res.status(401).json({ message: 'Invalid user or tenant access' });
    }

    // Verify the customer exists and belongs to the user's tenant
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or access denied' });
    }

    // Fetch UserActivity records
    const activities = await prisma.userActivity.findMany({
      where: {
        customerId,
        tenantId, // Scope to tenant
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc', // Newest first for date-by-date display
      },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });

    // Format response
    const formattedActivities = activities.map((activity) => ({
      id: activity.id,
      action: activity.action, // e.g., UPDATED_CUSTOMER, ADDED_CUSTOMER
      details: activity.details || {}, // e.g., changedFields, message
      timestamp: activity.timestamp,
      date: activity.timestamp.toISOString().split('T')[0], // e.g., 2025-04-29
      user: {
        id: activity.user.id,
        name: `${activity.user.firstName} ${activity.user.lastName}`,
        email: activity.user.email,
      },
    }));

    // Get total count for pagination
    const totalCount = await prisma.userActivity.count({
      where: {
        customerId,
        tenantId,
      },
    });

    // Return the activities
    res.status(200).json({
      message: 'Customer activity fetched successfully',
      customerId,
      activities: formattedActivities,
      total: totalCount,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (error) {
    console.error('Error fetching customer activity:', error);

    // Handle specific errors
    if (error.name === 'PrismaClientValidationError') {
      return res.status(500).json({ message: 'Schema validation error. Please ensure the Prisma client is up to date.' });
    }
    res.status(500).json({ message: 'Error fetching customer activity' });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { getCustomerActivity };