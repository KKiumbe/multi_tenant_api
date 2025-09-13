// server.js

const express = require('express');
const bodyParser = require('body-parser');
const AfricasTalking = require('africastalking');

// --- 1. Setup Express ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(bodyParser.json());

// --- 2. AT Credentials ---
const credentials = {
  apiKey: 'atsk_173e85657de7d18f5774e6c8243ef46bb3dc418895544937878ea3e957cb17a3d232743d', // replace with your API key
  username: 'sikika' 
};

const at = AfricasTalking(credentials);
const voice = at.VOICE;

// --- 3. Outbound Call Function ---
async function makeOutboundCall() {
  try {
    const options = {
      callFrom: '+254711082608',   // your AT virtual number
      callTo: ['+254702550190']    // numbers to call
    };

    const response = await voice.call(options);
    console.log('✅ Outbound Call Response:', response);
  } catch (err) {
    console.error('❌ Error making call:', err);
  }
}

// --- 4. Voice Callback ---
app.post('/voice/callback', (req, res) => {
  console.log('Incoming voice request:', req.body);

  const xmlResponse = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Welcome to our call center. Please hold while we connect you.</Say>
      <Dial phoneNumbers="+2547XXXXXXXX" />
    </Response>
  `;

  res.type('text/xml');
  res.send(xmlResponse);
});

// --- 5. Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📞 Voice app running on port ${PORT}`);

  // 👇 Automatically launch call after server starts
  makeOutboundCall();
});
