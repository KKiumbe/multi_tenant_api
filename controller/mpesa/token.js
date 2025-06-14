// controller/mpesa/token.js
const axios = require('axios');
const { getTenantSettingSTK } = require('./mpesaConfig');

async function getAccessToken(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  // --- don’t catch here, so you see the real error ---
  const { apiKey, secretKey } = await getTenantSettingSTK(tenantId);

  const credentials = `${apiKey}:${secretKey}`;
  const basicAuth   = Buffer.from(credentials).toString('base64');
  const url         = `${process.env.MPESA_URL}/oauth/v1/generate?grant_type=client_credentials`;

  const response = await axios.get(url, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!response.data.access_token) {
    throw new Error('Failed to get access token from MPESA');
  }

  return response.data.access_token;
}

module.exports = { getAccessToken };
