
const axios = require('axios');
const { getTenantSettings } = require("./mpesaConfig");

async function getAccessToken(tenantId) {

if (!tenantId) {
    throw new Error('Tenant ID is required to fetch M-Pesa access token');
  }
  

const settings = await getTenantSettings(tenantId);

    if (!settings.success) throw new Error(settings.message || 'Failed to fetch M-Pesa config');

    const { mpesaConfig } = settings;

  const auth = Buffer.from(`${mpesaConfig.apiKey}:${mpesaConfig.secretKey}`).toString('base64');
  const url = `${process.env.MPESA_BASE_URL}/oauth/v1/generate`;
  const response = await axios.get(url, { headers: { Authorization: `Basic ${auth}` } });
  return response.data.access_token;
}

module.exports = {
  getAccessToken,
};