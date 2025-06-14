const axios = require('axios');
const { getTenantSettingSTK } = require('./mpesaConfig');

async function getAccessToken(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const { apiKey, secretKey } = await getTenantSettingSTK(tenantId);
  console.log(`Tenant ${tenantId} credentials:`, { apiKey, secretKey });

  if (!apiKey || !secretKey) {
    throw new Error('Missing API Key or Secret Key for tenant');
  }

  const credentials = `${apiKey}:${secretKey}`;
  const basicAuth = Buffer.from(credentials).toString('base64');
  const url = `${process.env.MPESA_URL}/oauth/v1/generate?grant_type=client_credentials`;

  try {
    console.log(`Requesting token from: ${url}`);
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    if (!response.data.access_token) {
      throw new Error('No access token in M-Pesa response');
    }

    console.log('Access token:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('GetAccessToken error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw new Error(`Failed to get access token: ${error.message}`);
  }
}

module.exports = { getAccessToken };