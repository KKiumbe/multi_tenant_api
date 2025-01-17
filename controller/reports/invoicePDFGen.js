const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateInvoicePDF(invoiceId) {
  try {
    // Fetch invoice and related data from the database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!invoice) throw new Error('Invoice not found');

    // Calculate balances
    const closingBalance = invoice.customer.closingBalance; // directly from customer
    const invoiceAmount = invoice.invoiceAmount; // invoice amount from the invoice
    const openingBalance = closingBalance - invoiceAmount; // opening balance calculation

    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    // Ensure the invoices directory exists
    if (!fs.existsSync(path.dirname(pdfPath))) {
      fs.mkdirSync(path.dirname(pdfPath));
    }

    // Pipe the PDF to a writable stream
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Company Details with Logo
    const logoPath = path.join(__dirname, '..', 'assets', 'icon.png'); // Ensure this path is correct
    doc.image(logoPath, 50, 45, { width: 100 })
      .fontSize(20)
      .text('TAQA MALI', 160, 50)
      .fontSize(10)
      .text('KISERIAN.NGONG.RONGAI.MATASIA', 160, 80)
      .text('For inquiries Call: 0726594923', 160, 110)
      .text('Email: ngugisj@gmail.com', 160, 125)
      .moveDown();

    // Divider line
    doc.moveTo(50, 150).lineTo(550, 150).stroke();

    // Title for the invoice
    doc.fontSize(18).text('Invoice', { align: 'center' });
    doc.moveDown();

    // Format the invoice period
    const invoiceDate = new Date(invoice.invoicePeriod);
    const options = { month: 'long', year: 'numeric' };
    const formattedPeriod = invoiceDate.toLocaleDateString('en-US', options);

    // Invoice Details
    doc.fontSize(12)
      .text(`Invoice Period: ${formattedPeriod}`, { align: 'left' })
      .text(`Invoice Date: ${invoice.invoicePeriod.toDateString()}`, { align: 'left' })
      .text(`Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}`, { align: 'left' })
      .moveDown();

    // Format the opening balance and closing balance
    const formattedOpeningBalance = openingBalance < 0
      ? `Overpayment: KSH${Math.abs(openingBalance).toFixed(2)}`
      : `Previous Arrears (Opening Balance): KSH${openingBalance.toFixed(2)}`;
    const formattedClosingBalance = closingBalance < 0
      ? `Overpayment: KSH${Math.abs(closingBalance).toFixed(2)}`
      : `Closing Balance: KSH${closingBalance.toFixed(2)}`;

    // Add opening balance
    doc.text(formattedOpeningBalance, { align: 'left' }).moveDown();

    // Add table headers for invoice items
    doc.text('Description', 50, doc.y, { width: 150, continued: true })
      .text('Quantity', 250, doc.y, { width: 50, continued: true })
      .text('Amount', 330, doc.y, { width: 100, continued: true })
      .moveDown();

    // Add horizontal line below headers
    doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke();
    doc.moveDown();

    // Add each invoice item
    invoice.items.forEach(item => {
      doc.text(item.description, 50, doc.y, { width: 150, continued: true })
        .text(item.quantity.toString(), 270, doc.y, { width: 50, continued: true })
        .text(`KSH${item.amount.toFixed(2)}`, 360, doc.y, { width: 100, continued: true })
        .moveDown();
    });

    // Calculate and add the total amount
    const totalAmount = invoice.items.reduce((total, item) => total + item.amount * item.quantity, 0);
    doc.moveDown();
    doc.fontSize(12).text(`Total: KSH${totalAmount.toFixed(2)}`, 50, doc.y, { width: 150 });

    // Add the closing balance at the end in bold
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text(formattedClosingBalance, { align: 'left' });

    // Finalize PDF
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

// Function to generate and download the invoice
async function downloadInvoice(req, res) {
  const { invoiceId } = req.params;

  try {
    // Generate the PDF file for the given invoice ID
    await generateInvoicePDF(invoiceId);

    // Define the path where the PDF is stored
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    // Send the PDF as a download
    res.download(pdfPath, `invoice-${invoiceId}.pdf`, (err) => {
      if (err) {
        console.error('Error downloading invoice:', err);
        res.status(500).send('Error downloading invoice');
      }

      // Optionally delete the file after download
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error('Error generating or downloading invoice:', error);
    res.status(500).json({ message: 'Error generating or downloading invoice' });
  }
}

module.exports = { generateInvoicePDF, downloadInvoice };
