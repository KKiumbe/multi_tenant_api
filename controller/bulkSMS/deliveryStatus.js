const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
require('dotenv').config();

const ENDPOINT = 'https://quicksms.advantasms.com/api/services/getdlr/'


// Function to update SMS delivery status
async function updateSmsDeliveryStatus(req, res) {
  const { clientsmsid } = req.body;  // Get clientsmsid from the request body

  if (!clientsmsid) {
    return res.status(400).json({ success: false, message: 'clientsmsid is required' });
  }



  console.log(ENDPOINT);

  try {
    // Send POST request to update the delivery status
    const response = await axios.post(ENDPOINT, {
      apikey: process.env.SMS_API_KEY,
      partnerID: process.env.PARTNER_ID,
      messageID: clientsmsid,
    });

    // Check the response from the API and log it
    if (response.status === 200) {
      console.log(`Updated delivery status for SMS ID ${clientsmsid}`);
      return res.status(200).json({
        success: true,
        message: `Successfully updated delivery status for SMS ID ${clientsmsid}`,
      });
    } else {
      return res.status(response.status).json({
        success: false,
        message: `Failed to update delivery status for SMS ID ${clientsmsid}`,
      });
    }
  } catch (error) {
    console.error('Error updating SMS delivery status:', error);

    // Return error response
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve SMS delivery status',
      error: error.message,
    });
  }
}







// Function to retrieve SMS messages from the database
const getSmsMessages = async (req, res) => {
  try {
    // Fetch the first 100 SMS messages from the database, ordered by the creation date in descending order
    const smsMessages = await prisma.sMS.findMany({
      orderBy: {
        createdAt: 'desc', // Sort by latest first
      },
      take: 100, // Limit to 100 records
    });

    // Send a successful response with the fetched data
    res.status(200).json({ success: true, data: smsMessages });
  } catch (error) {
    console.error('Error fetching SMS messages:', error);
    res.status(500).json({ success: false, message: 'Server error while retrieving SMS messages' });
  }
};

  
  // Export the functions
  module.exports = {
    getSmsMessages,
    updateSmsDeliveryStatus,  // Make sure this function is defined if you're exporting it
  };
  