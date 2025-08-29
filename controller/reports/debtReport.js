const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
const fsPromises = require('fs').promises;


const { join } = require('path');



async function getCustomersWithHighDebt(req, res) {
  const tenantId = req.user?.tenantId;
  try {
    // Fetch customers with unpaid invoices and high debt
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId: tenantId,
        invoices: {
          some: { status: 'UNPAID' },
        },
      },
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
       
        monthlyCharge: true,
        closingBalance: true,
        garbageCollectionDay: true,
      },
    });

    // Filter customers with high debt (closingBalance > 2 * monthlyCharge)
    const filteredCustomers = customers.filter(
      (customer) => customer.closingBalance > 2 * customer.monthlyCharge
    );

    if (filteredCustomers.length === 0) {
      return res.status(404).json({ message: "No customers with high debt found." });
    }

    // Fetch tenant details
    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant details not found." });
    }

    // Create PDF report
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, 'highdebtcustomersreport.pdf');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="highdebtcustomersreport.pdf"');

    doc.pipe(res);

    // Generate PDF header
    generatePDFHeader(doc, tenant);

    // Header with reduced font size
    doc.font('Helvetica').fontSize(12).text('Customers with High Debt Report', { align: 'center' });
    doc.moveDown(1);

    // Table Header with reduced font size
    const columnWidths = [100, 120, 100, 120, 100, 100];
    const startX = 50;

    // Function to draw table rows
    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(8); // Header font size
      } else {
        doc.font('Helvetica').fontSize(8); // Content font size
      }

      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Draw table header
    drawTableRow(doc.y, ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Closing Balance'], true);
    let rowY = doc.y + 30;

    // Draw table rows for filtered customers
    filteredCustomers.forEach((customer) => {
      if (rowY > 700) { // Avoid page overflow
        doc.addPage();
        rowY = 50;
        drawTableRow(rowY, ['First Name', 'Last Name', 'Phone',  'Monthly Charge', 'Closing Balance'], true);
        rowY += 30;
      }

      drawTableRow(rowY, [
        customer.firstName,
        customer.lastName,
        customer.phoneNumber || 'N/A',
      
        `$${customer.monthlyCharge.toFixed(2)}`,
        `$${customer.closingBalance.toFixed(2)}`,
      ]);

      rowY += 30;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating high debt customer report:', error);
    res.status(500).json({ error: 'Error generating report' });
  }
}







// Controller function for low balance report


async function getCustomersWithLowBalance(req, res) {
  const tenantId = req.user?.tenantId;
  try {
    // Fetch customers with unpaid invoices and low balance
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId: tenantId,
        invoices: {
          some: { status: 'UNPAID' },
        },
      },
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
      
        monthlyCharge: true,
        closingBalance: true,
        garbageCollectionDay: true,
      },
    });

    // Filter customers with low balance (closingBalance <= monthlyCharge)
    const filteredCustomers = customers.filter(
      (customer) => customer.closingBalance <= customer.monthlyCharge
    );

    if (filteredCustomers.length === 0) {
      return res.status(404).json({ message: "No customers with low balance found." });
    }

    // Fetch tenant details
    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant details not found." });
    }

    // Create PDF report
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, 'lowbalancecustomersreport.pdf');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lowbalancecustomersreport.pdf"');

    doc.pipe(res);

    // Generate PDF header
    generatePDFHeader(doc, tenant);

    // Header with reduced font size
    doc.font('Helvetica').fontSize(12).text('Customers with Low Balance Report', { align: 'center' });
    doc.moveDown(1);

    // Table Header with reduced font size
    const columnWidths = [100, 120, 100, 120, 100, 100];
    const startX = 50;

    // Function to draw table rows
    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(8); // Header font size
      } else {
        doc.font('Helvetica').fontSize(8); // Content font size
      }

      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Draw table header
    drawTableRow(doc.y, ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Closing Balance'], true);
    let rowY = doc.y + 30;

    // Draw table rows for filtered customers
    filteredCustomers.forEach((customer) => {
      if (rowY > 700) { // Avoid page overflow
        doc.addPage();
        rowY = 50;
        drawTableRow(rowY, ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Closing Balance'], true);
        rowY += 30;
      }

      drawTableRow(rowY, [
        customer.firstName,
        customer.lastName,
        customer.phoneNumber || 'N/A',
      
        `$${customer.monthlyCharge.toFixed(2)}`,
        `$${customer.closingBalance.toFixed(2)}`,
      ]);

      rowY += 30;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating low balance customer report:', error);
    res.status(500).json({ error: 'Error generating report' });
  }
}







async function getCustomersWithArrearsReport(req, res) {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }

  try {

    // Fetch tenant details
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, logoUrl: true },
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant details not found.' });
    }

    // Fetch customers with any unpaid invoices
    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        invoices: {
          some: {
            status: 'UNPAID',
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        estateName: true,
        houseNumber: true,
        closingBalance: true,
        _count: {
          select: {
            invoices: {
              where: {
                status: 'UNPAID',
              },
            },
          },
        },
      },
      orderBy: [
        {
          invoices: {
            _count: 'desc',
          },
        },
        { lastName: 'asc' },
      ],
    });

    // Group customers by number of unpaid invoices
    const groupedCustomers = {
      '6+': customers.filter(customer => customer._count.invoices >= 6),
      '5': customers.filter(customer => customer._count.invoices === 5),
      '4': customers.filter(customer => customer._count.invoices === 4),
      '3': customers.filter(customer => customer._count.invoices === 3),
      '2': customers.filter(customer => customer._count.invoices === 2),
      '1': customers.filter(customer => customer._count.invoices === 1),
    };


    // Generate PDF
    const reportsDir = join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });
    const filePath = join(reportsDir, `arrears-report_${tenantId}_${new Date().toISOString().slice(0, 10)}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="arrears-report_${tenantId}.pdf"`);
    doc.pipe(res);


    function generatePDFHeader(doc, tenant) {
      doc.fontSize(16).font('Helvetica-Bold').text(`${tenant.name} - Customers with Arrears Report`, { align: 'center' });
      if (tenant.logoUrl) {
        // Check if the logo file exists before attempting to include it
        try {
          fs.accessSync(tenant.logoUrl, fs.constants.F_OK);
          doc.image(tenant.logoUrl, 50, 50, { width: 100 }).catch((err) => {
            console.error('Error adding logo to PDF:', err.message);
          });
        } catch (err) {
          console.warn(`Logo file not found at ${tenant.logoUrl}, skipping image.`);
        }
      }
      doc.moveDown(2);
    }



    // Draw Table Row
    function drawTableRow(doc, y, values, columnWidths, startX, isHeader = false, isBold = false) {
      doc.font(isHeader || isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      values.forEach((value, i) => {
        doc.text(value || '-', startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: columnWidths[i],
          align: i === 0 ? 'left' : 'left',
        });
      });
      if (isHeader) {
        doc.moveTo(startX, y + 25).lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), y + 25).stroke();
      }
    }

    generatePDFHeader(doc, tenant);
    doc.font('Helvetica').fontSize(12).text(
      `Customers with Arrears Report - ${new Date().toISOString().slice(0, 10)}`,
      { align: 'center' }
    );
    doc.moveDown(1);

    const columnWidths = [120, 70, 50, 100, 70, 70];
    const startX = 50;

    // Check if report is empty
    if (customers.length === 0) {
      doc.font('Helvetica').fontSize(10).text(
        'No customers with unpaid invoices found.',
        startX,
        doc.y,
        { align: 'center' }
      );
      doc.end();
      return;
    }

    // Draw table header
    drawTableRow(
      doc,
      doc.y,
      ['Customer Name', 'EstateName', 'House Number', 'Phone Number', 'Unpaid Months', 'Arrears'],
      columnWidths,
      startX,
      true
    );
    let rowY = doc.y + 30;

    // Iterate through groups in order: 6+, 5, 4, 3, 2, 1
    const groups = ['6+', '5', '4', '3', '2', '1'];
    for (const group of groups) {
      const groupCustomers = groupedCustomers[group];
      if (groupCustomers.length > 0) {
        // Add group header
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          drawTableRow(
            doc,
            doc.y,
            ['Customer Name', 'Estate Name', 'House Number', 'Phone Number', 'Unpaid Months', 'Total Arrears'],
            columnWidths,
            startX,
            true
          );
          rowY = doc.y + 30;
        }
        doc.font('Helvetica-Bold').fontSize(12).text(
          `Customers with ${group} Unpaid ${group === '6+' ? 'or More ' : ''}Months`,
          startX,
          rowY
        );
        rowY += 20;

        // Draw customers in the group
        for (const customer of groupCustomers) {
          if (rowY > 700) {
            doc.addPage();
            rowY = 50;
            drawTableRow(
              doc,
              doc.y,
              ['Customer Name', 'Estate Name', 'House Number', 'Phone Number', 'Unpaid Months', 'Total Arrears'],
              columnWidths,
              startX,
              true
            );
            rowY = doc.y + 30;
          }
          const customerName = `${customer.firstName} ${customer.lastName}`.trim();
          drawTableRow(
            doc,
            rowY,
            [
              customerName,
              customer.estateName || '-',
              customer.houseNumber || '-',
              customer.phoneNumber || '-',
              customer._count.invoices.toString(),
              `KES ${customer.closingBalance.toFixed(2)}`,
            ],
            columnWidths,
            startX
          );
          rowY += 20;
        }
        rowY += 10; // Add spacing between groups
      }
    }

    // Footer
    doc.fontSize(8).text(`Generated on ${new Date().toISOString().slice(0, 10)}`, startX, 750, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating customers with arrears report:', error);
    res.status(500).json({ error: 'Error generating report', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}





module.exports = {
  getCustomersWithHighDebt,
  getCustomersWithLowBalance,getCustomersWithArrearsReport
  
};
