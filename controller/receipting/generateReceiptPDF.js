const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { fetchTenant } = require('../tenants/tenantupdate.js');
const { getSMSConfigForTenant } = require('../smsConfig/getSMSConfig.js');
const { generatePDFHeader } = require('../reports/header.js');

async function generateReceiptPDF(receipt) {
  try {
    if (!receipt) throw new Error('Receipt data is required');

    const tenant = await fetchTenant(receipt.tenantId);
    const smsConfig = await getSMSConfigForTenant(receipt.tenantId);

    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, 'receipts', `receipt-${receipt.id}.pdf`);
    if (!fs.existsSync(path.dirname(pdfPath))) {
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    }

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    await generatePDFHeader(doc, tenant);

    doc.fontSize(20).font('Helvetica-Bold').text('Payment Receipt', 50, doc.y);
    doc.moveDown();

    // Receipt Metadata
    doc.fontSize(12).font('Helvetica')
      .text(`Receipt Number: ${receipt.receiptNumber.slice(0, 6)}`)
      .text(`Date: ${new Date(receipt.createdAt).toDateString()}`)
      .text(`Mode of Payment: ${receipt.modeOfPayment}`)
      .text(`Transaction Code: ${receipt.transactionCode || 'N/A'}`)
      .text(`Amount Paid: Ksh ${receipt.amount.toFixed(2)}`)
      .moveDown();

    // Customer Info
    doc.font('Helvetica-Bold').text('Customer Details:');
    doc.font('Helvetica')
      .text(`Name: ${receipt.customer?.firstName} ${receipt.customer?.lastName || ''}`)
      .text(`Phone: ${receipt.phoneNumber || receipt.customer?.phoneNumber || 'N/A'}`)
      .moveDown();

    // Paid Invoices
    if (receipt.receiptInvoices?.length) {
      doc.font('Helvetica-Bold').fontSize(14).text('Invoice(s) Paid');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10)
        .text('Invoice Number', 50, 380)
        .text('Invoice Period', 200, 380)
        .text('Amount Paid', 350, 380)
        .text('Status', 450, 380);
      doc.moveDown(0.5);

      receipt.receiptInvoices.forEach(({ invoice }) => {
        const formattedPeriod = new Date(invoice.invoicePeriod).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        });

        doc.font('Helvetica').fontSize(10)
          .text(invoice.invoiceNumber.slice(0, 6), 50, doc.y)
          .text(formattedPeriod, 200, doc.y)
          .text(`Ksh ${invoice.amountPaid?.toFixed(2) || '0.00'}`, 350, doc.y)
          .text(invoice.status, 450, doc.y);
        doc.moveDown(0.5);

        // List Invoice Items with Description and Amount
        if (invoice.items?.length) {
          doc.moveDown(0.5);
          doc.font('Helvetica-Bold').fontSize(10).text(`Items -${invoice.invoiceNumber.slice(0, 6)}:`, 60, doc.y);
          doc.font('Helvetica-Bold').fontSize(9)
            .text('Description', 70, doc.y)
            .text('Amount', 350, doc.y);
          doc.moveDown(0.5);

          invoice.items.forEach((item) => {
            doc.font('Helvetica').fontSize(9)
              .text(item.description.slice(0, 40), 70, doc.y) // Allow longer descriptions
              .text(`Ksh ${item.amount.toFixed(2)}`, 350, doc.y);
            doc.moveDown(0.5);
          });
        } else {
          doc.font('Helvetica').fontSize(9).text('No items found for this invoice.', 70, doc.y);
          doc.moveDown(0.5);
        }
      });
    } else {
      doc.font('Helvetica').text('No linked invoices found.', { align: 'left' });
    }

    // Closing balance
    doc.moveDown();
    doc.font('Helvetica-Bold').text(`Customer Closing Balance: Ksh ${receipt.customer?.closingBalance?.toFixed(2) || 0}`);

    // Thank you and support
    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Oblique').text('Thank you for your payment.',50, doc.y);
    doc.fontSize(10).text(
      `For assistance, contact support: ${smsConfig?.customerSupportPhoneNumber || 'N/A'}`,
      50, doc.y
      
    );

    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log(`✅ Receipt PDF generated: ${pdfPath}`);
        resolve(pdfPath);
      });
      writeStream.on('error', (err) => reject(err));
    });
  } catch (error) {
    console.error('❌ Error generating receipt PDF:', error);
    throw error;
  }
}

module.exports = { generateReceiptPDF };