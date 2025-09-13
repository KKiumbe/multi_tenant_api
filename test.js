// server.js

const express = require('express');
const bodyParser = require('body-parser');
const AfricasTalking = require('africastalking');

// --- 1. Setup Express ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true })); // AT sends POST x-www-form-urlencoded
app.use(bodyParser.json());

// --- 2. AT Credentials ---
const credentials = {
  apiKey: 'atsk_b0590b3b5142936537d9fdfb7d78de001a0ba156c40077e9e4357ba7002cca2023264fcf',   // replace with your Africa's Talking API key
  username: 'sandbox'           // use 'sandbox' for testing, change in production
};

const at = AfricasTalking(credentials);
const voice = at.VOICE;

// --- 3. Outbound Call Function ---
app.get('/make-call', async (req, res) => {
  try {
    const options = {
      callFrom: '+254711082608',   // your AT virtual number
      callTo: ['+254702550190']    // numbers to call
    };

    const response = await voice.call(options);
    console.log('Outbound Call Response:', response);
    res.json(response);

  } catch (err) {
    console.error('Error making call:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 4. Voice Callback (Africa's Talking will hit this endpoint) ---
app.post('/voice/callback', (req, res) => {
  console.log('Incoming voice request:', req.body);

  // Respond with AT-XML to control call flow
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
  console.log(`Voice app running on port ${PORT}`);
});
