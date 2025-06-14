// controller/mpesa/token.js
const axios = require('axios');

async function getAccessToken() {
  // 👉 Hard-coded for testing only
  const consumerKey    = '708fTsZI64G7WLMBDBZ74r7hBBMoNEbyxptPlTPywUwoEvvx';
  const consumerSecret = 'EPfcU4oQoMGy56qAjrDk6j0ABi7vJzsWCXFGXbIz0d8aSh88t1GwApsBBi2usQjs';

  const credentials = `${consumerKey}:${consumerSecret}`;
  const basicAuth   = Buffer.from(credentials).toString('base64');
  const url         = `${process.env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;

  console.log('▶️ Requesting token from:', url);
  const resp = await axios.get(url, {
    headers: { Authorization: `Basic ${basicAuth}` }
  });

  if (!resp.data.access_token) {
    throw new Error('No access token returned');
  }

  console.log('✅ Got access token:', resp.data.access_token);
  return resp.data.access_token;
}

module.exports = { getAccessToken };
