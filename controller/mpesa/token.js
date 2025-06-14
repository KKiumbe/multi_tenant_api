const axios = require('axios');
const { getTenantSettingSTK } = require('./mpesaConfig');

async function getAccessToken(tenantId) {
  if (!tenantId) throw new Error('Tenant ID is required');

  const { apiKey, secretKey } = await getTenantSettingSTK(tenantId);
  const credentials = `${apiKey}:${secretKey}`;
  const basicAuth   = Buffer.from(credentials).toString('base64');

  // <-- include grant_type here
  const url = `${process.env.MPESA_URL}/oauth/v1/generate?grant_type=client_credentials`;

  try {
    console.log(`Requesting token from: ${url}`);
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    if (!response.data.access_token) {
      throw new Error('No access token in M-Pesa response');
    }
    return response.data.access_token;

  } catch (error) {
    console.error('GetAccessToken error:', {
      status: error.response?.status,
      data:   error.response?.data,
      message:error.message,
    });
    throw new Error(`Failed to get access token: ${error.message}`);
  }
}

module.exports = { getAccessToken };
