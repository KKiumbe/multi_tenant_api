const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { fetchTenantDetails } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');

const prisma = new PrismaClient();



async function generateInvoicePDF(invoiceId) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true, items: true },
    });

    if (!invoice) throw new Error('Invoice not found');

    const tenant = await fetchTenantDetails(invoice.customer.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);
    
    if (!fs.existsSync(path.dirname(pdfPath))) {
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    }

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // **Use the reusable header function**
    await generatePDFHeader(doc, tenant);

    // **Continue with invoice details**
    doc.fontSize(20).font('Helvetica-Bold').text('Invoice', 250, 190);
    
    const invoiceDate = new Date(invoice.invoicePeriod);
    const options = { month: 'long', year: 'numeric' };
    const formattedPeriod = invoiceDate.toLocaleDateString('en-US', options);

    doc.fontSize(12)
      .text(`Invoice Period: ${formattedPeriod}`, 50, doc.y)
      .text(`Invoice Date: ${invoice.invoicePeriod.toDateString()}`, { align: 'left' })
      .text(`Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}`, { align: 'left' })
      .moveDown();

    // **Finalize the PDF**
  
    doc.end();
    
    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    throw error;
  }
}



// Function to download the invoice
async function downloadInvoice(req, res) {
  const { invoiceId } = req.params;

  try {
    await generateInvoicePDF(invoiceId);
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    res.download(pdfPath, `invoice-${invoiceId}.pdf`, (err) => {
      if (err) {
        console.error('Error downloading invoice:', err);
        res.status(500).send('Error downloading invoice');
      }

      // Delete file after download
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error('Error generating or downloading invoice:', error);
    res.status(500).json({ message: 'Error generating or downloading invoice' });
  }
}

module.exports = { generateInvoicePDF, downloadInvoice };
