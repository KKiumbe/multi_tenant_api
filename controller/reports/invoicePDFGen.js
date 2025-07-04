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
        customer: true,
        items: true
      },
    });

    if (!invoice) throw new Error('Invoice not found');

    const tenant = await fetchTenant(invoice.customer.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const mpeaConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId: invoice.customer.tenantId },
    });

    const smsConfig = await getSMSConfigForTenant(invoice.customer.tenantId);

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
      .text(`Invoice Period: ${formattedPeriod}`)
      .text(`Invoice Date: ${invoiceDate.toDateString()}`)
      .text(`Invoice Number: ${invoice.invoiceNumber}`)
      .text(`Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}`);

    doc.moveDown();

    // Items table
    if (invoice.items && invoice.items.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Items');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica-Bold')
        .text('Description', 50, doc.y)
        .text('Quantity', 300, doc.y)
        .text('Unit Price', 380, doc.y)
        .text('Total', 460, doc.y);

      doc.moveDown(0.5);
      let totalAmount = 0;
      invoice.items.forEach((item) => {
        const itemTotal = (item.quantity || 0) * (item.amount || 0);
        totalAmount += itemTotal;

        doc.font('Helvetica')
          .text(item.description || 'N/A', 50, doc.y)
          .text(item.quantity?.toString() || '0', 300, doc.y)
          .text(`$${(item.amount || 0).toFixed(2)}`, 380, doc.y)
          .text(`$${itemTotal.toFixed(2)}`, 460, doc.y);

        doc.moveDown(0.5);
      });

      doc.moveDown();
      doc.font('Helvetica-Bold')
        .text(`Items Total: $${totalAmount.toFixed(2)}`, { align: 'right' });
    } else {
      doc.text('No items found for this invoice.');
    }

    doc.moveDown();

    // Compute opening and closing balance
    const closingBalance = invoice.customer.closingBalance || 0;
    const openingBalance = closingBalance - invoice.invoiceAmount;

    doc.fontSize(12).font('Helvetica-Bold')
      .text(`Opening Balance: $${openingBalance.toFixed(2)}`)
      .text(`Invoice Amount: $${invoice.invoiceAmount.toFixed(2)}`)
      .text(`Closing Balance (Total To Pay): $${closingBalance.toFixed(2)}`);

    doc.moveDown(2);

    // Payment instructions
    doc.fontSize(14).font('Helvetica-Bold').text('Payment Instructions');
    doc.fontSize(10).font('Helvetica')
      .text('Please make your payment using the following details:')
      .moveDown(0.5)
      .text(`Payment Method: MPesa`)
      .text(`Paybill Number: ${mpeaConfig?.shortCode || 'Not Available'}`)
      .text(`Account Number: ${invoice.customer.phoneNumber}`)
      .text(`Amount to Pay: $${closingBalance.toFixed(2)}`)
      .moveDown(0.5)
      .text('Steps:')
      .text('1. Go to MPesa on your phone.')
      .text('2. Select Lipa na MPesa > Paybill.')
      .text(`3. Enter Paybill Number: ${mpeaConfig?.shortCode || 'Not Available'}`)
      .text(`4. Enter Account Number: ${invoice.customer.phoneNumber}`)
      .text(`5. Enter Amount: $${closingBalance.toFixed(2)}`)
      .text('6. Confirm the transaction.');

    doc.moveDown(0.5);
    doc.text(`For assistance, contact Customer Support: ${smsConfig?.customerSupportPhoneNumber || 'Not Available'}`);

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
