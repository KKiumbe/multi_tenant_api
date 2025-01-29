const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

async function generatePDFHeader(doc, tenant) {
  // Construct the logo file path
  const logoPath = path.join(__dirname, '..', '/../uploads', path.basename(tenant.logoUrl));

  // Add logo if it exists
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 60, 60, { width: 100 });
  } else {
    console.warn('⚠️ Logo file not found:', logoPath);
  }

  // Add tenant's details
  doc.fontSize(20)
    .font('Helvetica-Bold')
    .text(tenant?.name, { align: 'center' })
    .moveDown();

  doc.fontSize(10)
    .font('Helvetica')
    .text(tenant?.street, 160, 80)
    .text(`Phone: ${tenant?.phoneNumber}`, 160, 110)
    .text(`Email: ${tenant?.email}`, 160, 125)
    .text(`County: ${tenant?.county}`, 450, 70)
    .text(`Town: ${tenant?.town}`, 450, 90)
    .text(`Address: ${tenant?.address}`, 450, 110)
    .text(`Street: ${tenant?.street}`, 450, 125)
    .text(`Building: ${tenant?.building}`, 450, 140)
    .moveDown();

  // Divider line
  doc.moveTo(50, 170).lineTo(550, 170).stroke();
  doc.moveDown();
}

module.exports = { generatePDFHeader };
