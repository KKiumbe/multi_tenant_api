const express = require('express');
//const mongoose = require('mongoose');

const { PrismaClient } = require('@prisma/client'); // Prisma Client import

const cors = require('cors');
const helmet = require('helmet'); // Import Helmet
require('dotenv').config();
const bodyParser = require('body-parser');
const path = require('path');
const customerRoutes = require('./routes/customer/customerRoutes.js');
const userRoutes = require('./routes/userRoute/userRoute.js');
const invoiceRoutes = require('./routes/invoices/invoiceRoute.js');
const mpesaRoute = require('./routes/mpesa/mpesaRoute.js');
const collectionRoute = require('./routes/collection/collectionRoute.js');
const SMSRoute = require('./routes/sms/sendSms.js');
const receiptRoute = require('./routes/receipt/receiptingRoute.js');
const paymentRoute = require('./routes/payment/paymentRoutes.js');
const statsRoute = require('./routes/stats/statsRoute.js');

const uploadcustomers = require('./routes/fileUpload/uploadRoute.js');
const smsBalanceRoute = require('./routes/sms/balance.js')
const reportsReoute  = require('./routes/reportRoutes/reportRoute.js')
const userManagementRoute = require('./routes/rolesRoute/rolesRoute.js')

const tenantRoute = require('./routes/tenant/tenantRoute.js')

const mpesaSettings = require('./routes/mpesa/mpesaConfig.js')

const taskRoute = require('./routes/tasks/tasks.js')
const cookieParser = require('cookie-parser');

const prisma = new PrismaClient(); // Prisma Client instance

const app = express();
const PORT = process.env.PORT || 5000;



app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cookieParser());

app.use(bodyParser.json());
app.use(express.json());

app.use(helmet());

app.use(cors({
  origin: "*", // Allow only your frontend
  credentials: true, // Allow credentials
  //methods: ['GET', 'POST', 'PUT', 'DELETE']

}));




async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL database');
  } catch (error) {
    console.error('Error connecting to the database:', error);
  }
}

connectDatabase();



app.get('/test',(req,res)=>{
  res.sendFile(path.join(__dirname, '/uploads/1737629268458.png  '))
})
// Use customer routes
app.use('/api', customerRoutes); //done
app.use('/api', userRoutes);
app.use('/api', SMSRoute);
app.use('/api', invoiceRoutes);
app.use('/api', mpesaRoute);
app.use('/api', collectionRoute);
app.use('/api', receiptRoute);
app.use('/api', paymentRoute);
app.use('/api', statsRoute); //done

app.use('/api', uploadcustomers); 
 
 app.use('/api', smsBalanceRoute); 
app.use('/api', reportsReoute); 
app.use('/api', userManagementRoute); 

app.use('/api', mpesaSettings); 

app.use('/api', tenantRoute); 

app.use('/api', taskRoute);

// Start the HTTP server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

// Set server timeout
const timeoutDuration = 80000; // Set timeout duration in milliseconds (e.g., 60000 ms = 60 seconds)
server.setTimeout(timeoutDuration, () => {
  console.log(`Server timed out after ${timeoutDuration / 9000} seconds.`);
});
