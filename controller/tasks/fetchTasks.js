const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Fetch tasks for the authenticated user
 */
const fetchMyTasks = async (req, res) => {
  const { id: userId, tenantId } = req.user; // Extract user ID and tenant ID from the request

  try {
    // Fetch tasks assigned to the user
    const assignedTasks = await prisma.task.findMany({
      where: {
        tenantId, // Ensure tasks belong to the same tenant
        taskAssignees: {
          some: {
            assigneeId: userId, // Check if the user is an assignee
          },
        },
      },
      include: {
        taskAssignees: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    // Fetch tasks created by the user
    const createdTasks = await prisma.task.findMany({
      where: {
        tenantId, // Ensure tasks belong to the same tenant
        createdBy: userId,
      },
      include: {
        taskAssignees: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      assignedToMe: assignedTasks,
      assignedByMe: createdTasks,
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks." });
  }
};

/**
 * Fetch detailed information for a specific task
 */




const fetchTaskDetails = async (req, res) => {
  const { taskId } = req.params; // Task ID from route parameters
  const { tenantId } = req.user; // Ensure the user’s tenant is used for filtering

  try {
    // Convert taskId to an integer
    const taskIdInt = parseInt(taskId, 10);

    if (isNaN(taskIdInt)) {
      return res.status(400).json({ message: "Invalid task ID format." });
    }

    // Fetch the task details
    const task = await prisma.task.findFirst({
      where: {
        id: taskIdInt, // Use the converted integer taskId
        tenantId, // Ensure the task belongs to the same tenant
      },
      include: {
        taskAssignees: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
        trashBagIssuances: {
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                trashBagsIssued: true, // Include the trashBagsIssued field
              },
            },
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found or does not belong to this tenant." });
    }

    // Format the response
    const response = {
      taskDetails: {
        taskId: task.id,
        type: task.type,
        status: task.status,
        declaredBags: task.declaredBags,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      assignees: task.taskAssignees.map((assignee) => ({
        assigneeId: assignee.assignee.id,
        name: `${assignee.assignee.firstName} ${assignee.assignee.lastName}`,
        phoneNumber: assignee.assignee.phoneNumber,
      })),
      customers: task.trashBagIssuances.map((issuance) => ({
        customerId: issuance.customer.id,
        name: `${issuance.customer.firstName} ${issuance.customer.lastName}`,
        phoneNumber: issuance.customer.phoneNumber,
        trashBagsIssued: issuance.customer.trashBagsIssued, // Include the trashBagsIssued state
        bagsIssued: issuance.bagsIssued, // Include bagsIssued status
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching task details:", error);
    res.status(500).json({
      message: "Failed to fetch task details.",
      error: error.message,
    });
  }
};





module.exports = {
  fetchMyTasks,
  fetchTaskDetails,
};
