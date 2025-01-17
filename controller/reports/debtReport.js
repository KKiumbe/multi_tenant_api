const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Helper function to generate PDF report for each category
async function generateReport(customers, title, fileName, res) {
  const groupedByCollectionDay = customers.reduce((acc, customer) => {
    const day = customer.garbageCollectionDay;
    if (!acc[day]) {
      acc[day] = { count: 0, customers: [], totalClosingBalance: 0, monthlyTotal: 0 };
    }
    acc[day].count += 1;
    acc[day].customers.push(customer);
    acc[day].totalClosingBalance += customer.closingBalance;
    acc[day].monthlyTotal += customer.monthlyCharge;
    return acc;
  }, {});

  const filePath = path.join(__dirname, '..', 'reports', `${fileName}.pdf`);
  await generatePDF(groupedByCollectionDay, filePath, title);

  res.download(filePath, `${fileName}.pdf`, (err) => {
    if (err) {
      console.error('File download error:', err);
      res.status(500).send('Error generating report');
    }
    fs.unlinkSync(filePath);
  });
}

// Function to generate a PDF document
function generatePDF(groupedByCollectionDay, filePath, reportTitle) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const logoPath = path.join(__dirname, '..', 'assets', 'icon.png');
    doc.image(logoPath, 50, 45, { width: 100 })
      .fontSize(20).text('TAQa MALI ', 160, 50)
      .fontSize(10).text('KISERIAN, NGONG, RONGAI, MATASIA,', 160, 80)
      .fontSize(10).text('For all inquiries, Call 0726594923', 160, 110).moveDown();

    doc.moveTo(50, 120).lineTo(550, 120).stroke();
    doc.fontSize(18).text(reportTitle, { align: 'center' }).moveDown();

    for (const [day, { count, customers, totalClosingBalance, monthlyTotal }] of Object.entries(groupedByCollectionDay)) {
      doc.fontSize(12).text(`Collection Day: ${day} (Total Customers: ${count})`, { underline: true }).moveDown();
      doc.fontSize(10).text('Name', 50, doc.y, { continued: true })
        .text('PhoneNumber', 150, doc.y, { continued: true })
        .text('Balance', 300, doc.y, { continued: true })
        .text('MonthlyCharge', 410, doc.y).moveDown();
      doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke().moveDown();

      customers.forEach((customer) => {
        doc.fontSize(10).fillColor('#333')
          .text(`${customer.firstName} ${customer.lastName}`, 50, doc.y, { continued: true })
          .text(customer.phoneNumber, 150, doc.y, { continued: true })
          .text(customer.closingBalance.toFixed(2), 300, doc.y, { continued: true })
          .text(customer.monthlyCharge.toFixed(2), 410, doc.y).moveDown();
      });

      doc.moveDown().fontSize(12)
        .text(`Total Closing Balance for this Collection Day: ${totalClosingBalance.toFixed(2)}`, 50, doc.y)
        .moveDown()
        .text(`Total Monthly Charges for this Collection Day: ${monthlyTotal.toFixed(2)}`, 50, doc.y)
        .moveDown().moveDown();
    }

    doc.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

// Controller function for high debt report
async function getCustomersWithHighDebt(req, res) {
  const customers = await prisma.customer.findMany({
    where: { status: 'ACTIVE', invoices: { some: { status: 'UNPAID' } } },
    select: {
      firstName: true, lastName: true, phoneNumber: true, email: true, monthlyCharge: true, closingBalance: true, garbageCollectionDay: true
    }
  });
  const filteredCustomers = customers.filter(c => c.closingBalance > 2 * c.monthlyCharge);
  if (!filteredCustomers.length) return res.status(404).json({ message: "No customers with high debt found." });
  await generateReport(filteredCustomers, 'High Debt Report', 'high-debt-report', res);
}

// Controller function for low balance report
async function getCustomersWithLowBalance(req, res) {
  const customers = await prisma.customer.findMany({
    where: { status: 'ACTIVE', invoices: { some: { status: 'UNPAID' } } },
    select: {
      firstName: true, lastName: true, phoneNumber: true, email: true, monthlyCharge: true, closingBalance: true, garbageCollectionDay: true
    }
  });
  const filteredCustomers = customers.filter(c => c.closingBalance <= c.monthlyCharge);
  if (!filteredCustomers.length) return res.status(404).json({ message: "No customers with low balance found." });
  await generateReport(filteredCustomers, 'Low Balance Report', 'low-balance-report', res);
}

// Controller function for current balance report
async function getCurrentCustomersDebt(req, res) {
  const customers = await prisma.customer.findMany({
    where: { status: 'ACTIVE', invoices: { some: { status: 'UNPAID' } } },
    select: {
      firstName: true, lastName: true, phoneNumber: true, email: true, monthlyCharge: true, closingBalance: true, garbageCollectionDay: true
    }
  });

  //  customer.closingBalance >= customer.monthlyCharge * 0.15 
  const filteredCustomers = customers.filter(c => c.closingBalance >= c.monthlyCharge * 0.15);
  if (!filteredCustomers.length) return res.status(404).json({ message: "No current balance customers found." });
  await generateReport(filteredCustomers, 'Current Balance Report', 'current-balance-report', res);
}

module.exports = {
  getCustomersWithHighDebt,
  getCustomersWithLowBalance,
  getCurrentCustomersDebt
};
