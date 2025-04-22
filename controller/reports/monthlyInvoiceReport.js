const pdfMake = require("pdfmake/build/pdfmake");
const pdfFonts = require("pdfmake/build/vfs_fonts");
const PDFDocument = require("pdfkit");

const { fetchTenantDetails, fetchTenant } = require("../tenants/tenantupdate.js");
const { PrismaClient } = require("@prisma/client");
const { generatePDFHeader } = require("./header.js");

const prisma = new PrismaClient();



const generateMonthlyInvoiceReport = async (req, res) => {
  const startTime = Date.now();
  console.log('generateMonthlyInvoiceReport - Start:', new Date().toISOString());

  try {
    // Validate and get tenant information
    const { tenantId } = req.user;
    console.log('generateMonthlyInvoiceReport - tenantId:', tenantId);
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    console.log('generateMonthlyInvoiceReport - tenant:', tenant);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Get month and year from query parameters
    const { month, year } = req.query;
    console.log('generateMonthlyInvoiceReport - month:', month, 'year:', year);
    if (!month) throw new Error("Month is required in query parameters");

    // Validate month (1-12)
    const monthInt = parseInt(month, 10);
    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      throw new Error("Month must be an integer between 1 (January) and 12 (December)");
    }

    // Use current year if not provided, validate year if provided
    const selectedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    if (year && (isNaN(selectedYear) || selectedYear < 2025 || selectedYear > 2100)) {
      throw new Error("Year must be an integer between 2025 and 2100");
    }

    // Calculate date range for the specified month
    const firstDayOfMonth = new Date(selectedYear, monthInt - 1, 1);
    const lastDayOfMonth = new Date(selectedYear, monthInt, 0);

    // Fetch invoices for the specified month
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        invoicePeriod: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
      select: {
        invoicePeriod: true,
        invoiceNumber: true,
        invoiceAmount: true,
        closingBalance: true,
        status: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { invoicePeriod: 'asc' },
    });

    console.log('generateMonthlyInvoiceReport - invoices found:', invoices.length);
    console.log('generateMonthlyInvoiceReport - Query time:', `${Date.now() - startTime}ms`);
    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No invoices found for ${firstDayOfMonth.toLocaleString("en-US", { month: "long" })} ${selectedYear}`,
      });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="monthly-invoice-report-${monthInt}-${selectedYear}.pdf"`
    );
    doc.pipe(res);

    // Add header (assuming generatePDFHeader is defined)
    generatePDFHeader(doc, tenant);

    // Report title
    const monthName = firstDayOfMonth.toLocaleString("en-US", { month: "long" });
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(`Monthly Invoice Report for ${monthName} ${selectedYear}`, { align: "center" })
      .moveDown();

    // Table Configuration
    const columnWidths = [100, 70, 70, 70, 70, 120, 120];
    const startX = 10;

    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

      if (isHeader) {
        doc.font("Helvetica-Bold").fontSize(8);
      } else {
        doc.font("Helvetica").fontSize(8);
      }

      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 7, { width: columnWidths[index], lineBreak: false });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Table Header
    drawTableRow(doc.y, [
      "Period",
      "Invoice #",
      "Amount",
      "Balance",
      "Status",
      "Name",
      "Phone Number",
    ], true);

    let rowY = doc.y + 30;

    // Table Data
    invoices.forEach((invoice) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 70;
        drawTableRow(rowY, [
          "Period",
          "Invoice #",
          "Amount",
          "Balance",
          "Status",
          "Name",
          "Phone Number",
        ], true);
        rowY += 30;
      }

      drawTableRow(rowY, [
        invoice.invoicePeriod.toISOString().split("T")[0],
        invoice.invoiceNumber.substring(0, 5),
        invoice.invoiceAmount.toFixed(2),
        invoice.closingBalance.toFixed(2),
        invoice.status,
        `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        invoice.customer.phoneNumber || "N/A",
      ]);

      rowY += 30;
    });

    // Add total summary
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.invoiceAmount, 0);
    const totalBalance = invoices.reduce((sum, inv) => sum + inv.closingBalance, 0);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Total Invoiced: Ksh ${totalAmount.toFixed(2)}`, startX, rowY + 20)
      .text(`Total Balance: Ksh ${totalBalance.toFixed(2)}`, startX, rowY + 40);

    // Finalize PDF
    doc.end();
    console.log('generateMonthlyInvoiceReport - PDF generated, total time:', `${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("Error generating monthly invoice report:", error);
    console.log('generateMonthlyInvoiceReport - Error time:', `${Date.now() - startTime}ms`);
    const statusCode =
      error.message === "Tenant ID is required" ? 403 :
      error.message.includes("Month") || error.message.includes("Year") ? 400 :
      500;
    res.status(statusCode).json({
      error: error.message || "Failed to generate monthly invoice report",
    });
  }
};


  

module.exports = { generateMonthlyInvoiceReport };
