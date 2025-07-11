// middleware/requireTenantStatus.js

const { PrismaClient,TenantStatus } = require('@prisma/client');
const prisma = new PrismaClient();
/**
 * Blocks requests unless req.tenantStatus is in the allowed list.
 * Sends a specific message if the tenant subscription has expired.
 *
 * @param {TenantStatus[]} allowedStatuses
 */



function requireTenantStatus(allowedStatuses = []) {
  return (req, res, next) => {
    const status = req.tenantStatus;

    // Detect if the request expects an HTML response
    const isBrowserRequest = req.accepts('html') && !req.xhr; // Check for HTML and non-AJAX request

    if (status === TenantStatus.EXPIRED) {
      if (isBrowserRequest) {
        // Render an HTML page for browser users
        return res.status(402).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Required</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #d32f2f; }
              p { font-size: 18px; }
              a { color: #1976d2; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <h1>Feature Disabled</h1>
            <p>This feature is disabled due to non-payment of the service.</p>
            <p>Please <a href="/billing">update your payment details</a> to restore access.</p>
          </body>
          </html>
        `);
      }
      // For API requests, return JSON
      return res.status(402).json({ error: 'This feature is disabled due to non payment of the service' });
    }

    // Block other disallowed statuses
    if (!allowedStatuses.includes(status)) {
      if (isBrowserRequest) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access Denied</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #d32f2f; }
              p { font-size: 18px; }
              a { color: #1976d2; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <h1>Access Denied</h1>
            <p>Your account status ('${status}') does not allow access to this feature.</p>
            <p>Please <a href="/support">contact support</a> for assistance.</p>
          </body>
          </html>
        `);
      }
      return res.status(403).json({ error: `Access denied: tenant status is '${status}'` });
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






