// middleware/requireTenantStatus.js

const { TenantStatus } = require('@prisma/client');
const {prisma} = require('../globalPrismaClient.js');
/**
 * Blocks requests unless req.tenantStatus is in the allowed list.
 * Sends a specific message if the tenant subscription has expired.
 *
 * @param {TenantStatus[]} allowedStatuses
 */
function requireTenantStatus(allowedStatuses = []) {
  return (req, res, next) => {
    const status = req.tenantStatus;

    // If subscription expired, send specific message
    if (status === TenantStatus.EXPIRED) {
      return res
        .status(402)  // Payment Required
        .json({ error: 'This feature is disabled due to non payment of the service' });
    }

    // Otherwise, block any other disallowed statuses
    if (!allowedStatuses.includes(status)) {
      return res
        .status(402)  // or 403 Forbidden
        .json({ error: `Access denied: tenant status is '${status}'` });
    }

    // Tenant status is allowed
    next();
  };
}


async function checkTenantStatus(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'No tenant context available' });
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    req.tenantStatus = tenant.status;
    next();
  } catch (err) {
    console.error('Error verifying tenant status:', err);
    res.status(500).json({ error: 'Could not verify tenant status' });
  }
}

module.exports = {
    requireTenantStatus,
    checkTenantStatus
};






