const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Controller function to get all active customers grouped by collection day
async function getAllActiveCustomersReport(req, res) {
  try {
    // Fetch active customers
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE', // Only active customers
      },
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
        email: true,
        monthlyCharge: true,
        closingBalance: true, // Include closing balance for total debt
        garbageCollectionDay: true // Include collection day for grouping
      }
    });

    if (!customers.length) {
      return res.status(404).json({ message: "No active customers found." });
    }

    // Group customers by garbage collection day and calculate totals
    const groupedByCollectionDay = customers.reduce((acc, customer) => {
      const day = customer.garbageCollectionDay;
      if (!acc[day]) {
        acc[day] = { count: 0, customers: [], totalClosingBalance: 0, monthlyTotal: 0 }; // Initialize totals
      }
      acc[day].count += 1;
      acc[day].customers.push(customer);
      acc[day].totalClosingBalance += customer.closingBalance; // Accumulate the total closing balance
      acc[day].monthlyTotal += customer.monthlyCharge; // Accumulate the monthly charges
      return acc;
    }, {});

    // Generate the PDF report
    const filePath = path.join(__dirname, '..', 'reports', 'active-customers-weekly-report.pdf');
    await generatePDF(groupedByCollectionDay, filePath);

    // Send the file as a downloadable response
    res.download(filePath, 'active-customers-weekly-report.pdf', (err) => {
      if (err) {
        console.error('File download error:', err);
        res.status(500).send('Error generating report');
      }
      // Optionally delete the file after sending
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error('Error fetching active customer report:', error);
    res.status(500).send('Error generating report');
  }
}

// Helper function to generate the PDF report
function generatePDF(groupedByCollectionDay, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Load the company logo
    const logoPath = path.join(__dirname, '..', 'assets', 'icon.png');

    // Add the Company Logo and Name at the top
    doc.image(logoPath, 50, 45, { width: 100 }) // Adjust position and size as needed
      .fontSize(20)
      .text('TAQa MALI ', 160, 50) // Position name next to logo
      .fontSize(10)
      .text('KISERIAN, NGONG, RONGAI, MATASIA,', 160, 80)
      .fontSize(10)
      .text('For all the inquiries, Call 0726594923, We help you Conserve and Protect the environment', 160, 110)
      .moveDown();

    // Add a straight divider line after the header
    doc.moveTo(50, 120).lineTo(550, 120).stroke();

    // Title for the report
    doc.fontSize(18).text('Weekly Active Customers Report', { align: 'center' });
    doc.moveDown();

    // Define fixed column widths
    const nameColumnWidth = 150;
    const phoneColumnWidth = 100;
    const balanceColumnWidth = 100;
    const monthlyChargeColumnWidth = 100;

    // Loop through each collection day group
    for (const [day, { count, customers, totalClosingBalance, monthlyTotal }] of Object.entries(groupedByCollectionDay)) {
      doc.fontSize(16).text(`Collection Day: ${day} (Total Customers: ${count})`, { underline: true });
      doc.moveDown();

      // Add header for the table with fixed column widths
      doc.fontSize(10).text('Name', 50, doc.y, { continued: true });
      doc.text('Phone', 50 + nameColumnWidth, doc.y, { continued: true });
      doc.text('Balance', 50 + nameColumnWidth + phoneColumnWidth, doc.y, { continued: true });
      doc.text('Monthly Charge', 50 + nameColumnWidth + phoneColumnWidth + balanceColumnWidth, doc.y);
      doc.moveDown();

      // Add a horizontal line below the header
      doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke();
      doc.moveDown();

      // Loop over customers in this collection day group
      customers.forEach((customer) => {
        const fullName = `${customer.firstName} ${customer.lastName}`;
        const nameWidth = doc.widthOfString(fullName);
        const maxWidth = nameColumnWidth; // Maximum width for the name column

        // Split name into two lines if it exceeds maxWidth
        if (nameWidth > maxWidth) {
          const names = fullName.split(' ');
          let line1 = '';
          let line2 = '';

          // Build the first line up to the maximum width
          for (const name of names) {
            if (doc.widthOfString(line1 + name + ' ') < maxWidth) {
              line1 += name + ' ';
            } else {
              line2 += name + ' ';
            }
          }

          // Write the first line of the name
          doc.fontSize(10)
            .fillColor('#333')
            .text(line1.trim(), 50, doc.y, { continued: true });

          // Adjust Y position for the second line
          doc.moveDown(); // Move down for the next line
          // Write the second line of the name at the start of the line
          doc.text(line2.trim(), 50, doc.y, { continued: true });
          doc.moveDown(); // Add space after multi-line name
        } else {
          // Include customer details in a tabular format if within width
          doc.fontSize(10)
            .fillColor('#333')
            .text(fullName, 50, doc.y, { continued: true });
        }

        // Write other customer details with fixed widths
        doc.text(customer.phoneNumber, 50 + nameColumnWidth, doc.y, { continued: true });
        doc.text(customer.closingBalance.toFixed(2), 50 + nameColumnWidth + phoneColumnWidth, doc.y, { continued: true });
        doc.text(customer.monthlyCharge.toFixed(2), 50 + nameColumnWidth + phoneColumnWidth + balanceColumnWidth, doc.y);
        doc.moveDown(); // Add spacing between customers
      });

      // Add total closing balance and monthly total for the collection day
      doc.moveDown();
      doc.fontSize(12).text(`Total Closing Balance for this Collection Day: ${totalClosingBalance.toFixed(2)}`, 50, doc.y);
      doc.moveDown();
      doc.fontSize(12).text(`Total Monthly Charges for this Collection Day: ${monthlyTotal.toFixed(2)}`, 50, doc.y);
      doc.moveDown(); // Add space after the totals

      // Add a space between collection days
      doc.moveDown();
    }

    doc.end();

    // Resolve or reject the promise based on stream events
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

module.exports = {
  getAllActiveCustomersReport,
};
