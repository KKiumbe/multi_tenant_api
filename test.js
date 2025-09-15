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
  apiKey: 'atsk_173e85657de7d18f5774e6c8243ef46bb3dc418895544937878ea3e957cb17a3d232743d', // replace with your LIVE API key
  username: 'sikika' // replace with your AT username
};

const at = AfricasTalking(credentials);
const voice = at.VOICE;

// --- 3. Outbound Call Function ---
// async function makeOutboundCall() {
//   try {
//     const options = {
//       callFrom: '+254711082608',   // MUST be your Africa's Talking Voice number
//       callTo: ['+254702550190']    // Number(s) to call
//     };

//     const response = await voice.call(options);
//     console.log('✅ Outbound Call Response:', response);
//   } catch (err) {
//     console.error('❌ Error making call:', err.response?.data || err.message);
//   }
// }

// --- 4. Voice Callback (AT will POST here after call connects) ---
app.post('/voice/callback', (req, res) => {
  console.log('📩 Incoming voice callback:', req.body);

  // Respond with Call Actions (JSON instead of XML)
  // const callActions = {
  //   callActions: [
    
  //     {
  //       actionType: "Dial",
  //       phoneNumbers: [
  //         "+254716177880",                       // direct phone
  //         "agent1.username@ke.africastalking.com", // SIP/AT agent
  //         "Username.JaneDoe"                       // AT user handle
  //       ]
  //     }
  //   ]
  // };

  // res.json(callActions); // ✅ send JSON call flow back to AT
});

// --- 5. Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📞 Voice app running on port ${PORT}`);

  // 👇 Automatically launch call after server starts
  // makeOutboundCall();
});
