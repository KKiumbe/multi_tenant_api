const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
const { getSMSConfigForTenant } = require('../smsConfig/getSMSConfig.js');





async function generateInvoicePDF(invoiceId) {
  try {
    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new Error('invoiceId must be a valid string');
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: {
          select: {
            closingBalance: true,
            firstName: true,
            lastName: true,
            tenantId: true,
            phoneNumber: true
          }
        },
        items: true
      }
    });
    
    console.log(`invoice data ${invoice}`);
    if (!invoice) throw new Error('Invoice not found');

    const tenant = await fetchTenant(invoice.customer.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const mpeaConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId: invoice.customer.tenantId },
    });

    const smsConfig = await getSMSConfigForTenant(invoice.customer.tenantId);

    const openingBalance = invoice.customer.closingBalance - invoice.invoiceAmount;
    const closingBalance = invoice.customer.closingBalance;

    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);
    if (!fs.existsSync(path.dirname(pdfPath))) {
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    }

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Header
    await generatePDFHeader(doc, tenant);

    // Invoice title
    doc.fontSize(20).font('Helvetica-Bold').text('Invoice', { align: 'center' });

    // Invoice details
    const invoiceDate = new Date(invoice.invoicePeriod);
    const options = { month: 'long', year: 'numeric' };
    const formattedPeriod = invoiceDate.toLocaleDateString('en-US', options);

    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
      .text(`Invoice Period: ${formattedPeriod} `, 50, doc.y)
      .text(`Invoice Date: ${invoiceDate.toDateString()}`,50, doc.y)
      .text(`Invoice Number: ${invoice.invoiceNumber.slice(0,10)}`,50, doc.y)
      .moveDown(0.5)
      doc.font('Helvetica-Bold')
      .text(`Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}`,50, doc.y)
      .moveDown(0.5)
      doc.font('Helvetica-Bold')
      .text(`Opening Balance: Ksh ${openingBalance} `,50, doc.y);

    doc.moveDown(0.5);

    // Items table
    if (invoice.items && invoice.items.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Items');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica-Bold')
        .text('Description', 50, 330)
        .text('Quantity', 300, 330)
        .text('Unit Price', 380, 330)
        .text('Total', 460, 330);

      doc.moveDown(0.5);
      let totalAmount = 0;
      invoice.items.forEach((item) => {
        const itemTotal = (item.quantity || 0) * (item.amount || 0);
        totalAmount += itemTotal;

        doc.font('Helvetica')
          .text(item.description || 'N/A', 50, doc.y)
          .text(item.quantity?.toString() || '0', 310, 350)
          .text(`Ksh ${(item.amount || 0).toFixed(2)}`,390 , 350)
          .text(`Ksh ${itemTotal.toFixed(2)}`, 455, 350);

        doc.moveDown(0.5);
      });

      doc.moveDown();
      doc.font('Helvetica-Bold')
        .text(`Items Total: Ksh ${totalAmount.toFixed(2)}`,455, doc.y);
    } else {
      doc.text('No items found for this invoice.');
    }

    doc.moveDown();

    // Compute opening and closing balance
    


    doc.fontSize(12).font('Helvetica-Bold')
      
      .text(`Invoice Amount: Ksh${invoice.invoiceAmount.toFixed(2)}`,50, doc.y)
      .text(`Closing Balance (Total To Pay): Ksh${closingBalance.toFixed(2)}`,50, doc.y);

    doc.moveDown(2);

    // Payment instructions
    doc.fontSize(14).font('Helvetica-Bold').text('Payment Instructions');
    doc.fontSize(10).font('Helvetica')
      .text('Please make your payment using the following details:',50, doc.y)
      .moveDown(0.5)
      .text(`Payment Method: MPesa`,50, doc.y)
        doc.font('Helvetica-Bold')
      
       .text(`Paybill Number: ${mpeaConfig?.shortCode || 'Not Available'}`,50, doc.y)
         doc.font('Helvetica')
      .text(`Account Number: ${invoice.customer.phoneNumber}`,50, doc.y)
      .text(`Amount to Pay: Ksh${closingBalance.toFixed(2)}`,50, doc.y)
      .moveDown(0.5)
      .text('Steps:',50, doc.y)
      .text('1. Go to MPesa on your phone.',50, doc.y)
      .text('2. Select Lipa na MPesa > Paybill.',50, doc.y)
      .text(`3. Enter Paybill Number: ${mpeaConfig?.shortCode || 'Not Available'}`,50, doc.y)
      .text(`4. Enter Account Number: ${invoice.customer.phoneNumber}`,50, doc.y)
      .text(`5. Enter Amount: Ksh${closingBalance.toFixed(2)}`,50, doc.y)
      .text('6. Confirm the transaction.',50, doc.y);

    doc.moveDown(0.5);
    doc.text(`For assistance, contact Customer Support: ${smsConfig?.customerSupportPhoneNumber || 'Not Available'}`,10, doc.y);

    // Finish PDF
    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log('✅ PDF generated:', pdfPath);
        resolve(pdfPath);
      });
      writeStream.on('error', (err) => reject(new Error(`PDF write failed: ${err.message}`)));
    });

  } catch (error) {
    console.error('❌ Error generating invoice PDF:', error);
    throw error;
  }
}







async function downloadInvoice(req, res) {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return res.status(400).json({ message: 'invoiceId is required' });
  }

  try {
    await generateInvoicePDF(invoiceId);
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found at ${pdfPath}`);
    }

    res.download(pdfPath, `invoice-${invoiceId}.pdf`, (err) => {
      if (err) {
        console.error('Error downloading invoice:', err);
        return res.status(500).send('Error downloading invoice');
      }

      // Delete file after download
      try {
        fs.unlinkSync(pdfPath);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });
  } catch (error) {
    console.error('Error generating or downloading invoice:', error);
    res.status(500).json({ message: error.message || 'Error generating or downloading invoice' });
  }
}

module.exports = { generateInvoicePDF, downloadInvoice };
