const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const { generatePDFHeader } = require('../header.js');
const { fetchTenant } = require('../../tenants/tenantupdate.js');

const prisma = new PrismaClient();





async function generateIncomeReport(req, res) {
  try {
    // Validate and get tenant information
    const { tenantId } = req.user;
    console.log('generateIncomeReport - tenantId:', tenantId);
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    console.log('generateIncomeReport - tenant:', tenant);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Get month and year from query parameters
    const { month, year } = req.query;
    if (!month) throw new Error("Month is required in query parameters");

    // Validate month (1-12)
    const monthInt = parseInt(month, 10);
    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      throw new Error("Month must be an integer between 1 (January) and 12 (December)");
    }

    // Use current year if not provided, validate year if provided
    const selectedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    if (year && (isNaN(selectedYear) || selectedYear < 2025 || selectedYear > 2100)) {
      throw new Error("Year must be a valid integer from 2025 onwards");
    }

    // Calculate date range for the specified month
    const firstDayOfMonth = new Date(selectedYear, monthInt - 1, 1);
    const lastDayOfMonth = new Date(selectedYear, monthInt, 0); // Last day of the month

    // Fetch invoices for the specified month
    const invoices = await prisma.invoice.groupBy({
      by: ["createdAt"],
      where: {
        tenantId,
        createdAt: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
      _sum: { invoiceAmount: true },
    });

    // Fetch payments for the specified month
    const payments = await prisma.payment.groupBy({
      by: ["createdAt"],
      where: {
        tenantId,
        createdAt: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
      _sum: { amount: true },
    });

    // Organize data for the month
    const monthlyData = {
      invoiced: invoices.reduce((sum, inv) => sum + (inv._sum.invoiceAmount || 0), 0),
      payments: payments.reduce((sum, pay) => sum + (pay._sum.amount || 0), 0),
    };

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader('Content-Disposition', `attachment; filename="income-report-${monthInt}-${selectedYear}.pdf"`);
    doc.pipe(res);

    // Add header (assuming generatePDFHeader is defined)
    generatePDFHeader(doc, tenant);

    // Report title
    const monthName = firstDayOfMonth.toLocaleString("en-US", { month: "long" });
    doc
      .fontSize(14)
      .text(`Income Report: Invoices vs Payments for ${monthName} ${selectedYear}`, { align: "center" })
      .moveDown(1);

    // Handle empty data
    if (monthlyData.invoiced === 0 && monthlyData.payments === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .text(`No income records found for ${monthName} ${selectedYear}.`, 50, doc.y + 20);
      doc.end();
      return;
    }

    // Define table headers
    const headers = ["Month", "Total Invoiced", "Total Payments", "Percentage Paid (%)"];
    const columnWidths = [80, 100, 100, 120];
    const startX = 50;
    let startY = doc.y + 20;
    const rowHeight = 20;
    const pageHeight = doc.page.height - doc.page.margins.bottom;

    // Function to check and add new page if needed
    const checkPageBreak = () => {
      if (startY + rowHeight > pageHeight) {
        doc.addPage();
        startY = doc.page.margins.top;
        // Redraw headers on new page
        doc.font("Helvetica-Bold").fontSize(10);
        headers.forEach((header, index) => {
          doc.text(
            header,
            startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
            startY,
            {
              width: columnWidths[index],
              align: "left",
            }
          );
        });
        startY += 20;
        doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();
      }
    };

    // Draw headers
    doc.font("Helvetica-Bold").fontSize(10);
    headers.forEach((header, index) => {
      doc.text(
        header,
        startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
        startY,
        {
          width: columnWidths[index],
          align: "left",
        }
      );
    });

    // Draw header underline
    startY += 20;
    doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();

    // Draw table row for the specified month
    doc.font("Helvetica").fontSize(9);
    checkPageBreak();

    const percentagePaid = monthlyData.invoiced > 0 ? ((monthlyData.payments / monthlyData.invoiced) * 100).toFixed(2) : "0.00";
    const rowData = [
      `${monthName} ${selectedYear}`,
      `Ksh ${monthlyData.invoiced.toFixed(2)}`,
      `Ksh ${monthlyData.payments.toFixed(2)}`,
      `${percentagePaid}%`,
    ];

    rowData.forEach((text, index) => {
      doc.text(
        text,
        startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
        startY,
        {
          width: columnWidths[index],
          align: "left",
        }
      );
    });

    // Move to next row position
    startY += rowHeight;

    // Add total summary
    checkPageBreak();
    startY += 20;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Total Invoiced: Ksh ${monthlyData.invoiced.toFixed(2)}`, 50, startY);
    doc
      .moveDown(0.5)
      .text(`Total Payments: Ksh ${monthlyData.payments.toFixed(2)}`, 50, doc.y);

    doc.end();
  } catch (error) {
    console.error("Error generating income report:", error);
    const statusCode =
      error.message === "Tenant ID is required" ? 403 :
      error.message.includes("Month") || error.message.includes("Year") ? 400 :
      500;
    res.status(statusCode).json({
      error: error.message || "Failed to generate PDF report",
    });
  }
}





async function generatePaymentReportPDF(req, res) {
  try {
    // Validate and get tenant information
    const { tenantId } = req.user;
    console.log('generatePaymentReportPDF - tenantId:', tenantId);
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    console.log('generatePaymentReportPDF - tenant:', tenant);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Get month and year from query parameters
    const { month, year } = req.query;
    if (!month) throw new Error("Month is required in query parameters");

    // Validate month (1-12)
    const monthInt = parseInt(month, 10);
    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      throw new Error("Month must be an integer between 1 (January) and 12 (December)");
    }

    // Use current year if not provided, validate year if provided
    const selectedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    if (year && (isNaN(selectedYear) || selectedYear < 2025 || selectedYear > 2100)) {
      throw new Error("Year must be a valid integer from 2025 onwards");
    }

    // Calculate date range for the specified month
    const firstDayOfMonth = new Date(selectedYear, monthInt - 1, 1);
    const lastDayOfMonth = new Date(selectedYear, monthInt, 0);

    // Fetch payment data for the specified month
    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
      select: {
        amount: true,
        modeOfPayment: true,
        receipted: true,
        transactionId: true,
        ref: true,
        receiptId: true,
        createdAt: true,
        receipt: {
          select: {
            customer: {
              select: {
                firstName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payment-report-${monthInt}-${selectedYear}.pdf"`
    );
    doc.pipe(res);

    // Add header (assuming generatePDFHeader is defined)
    generatePDFHeader(doc, tenant);

    // Report title
    const monthName = firstDayOfMonth.toLocaleString("en-US", { month: "long" });
    doc
      .fontSize(14)
      .text(`Payment Details Report for ${monthName} ${selectedYear}`, { align: "center" })
      .moveDown(1);

    // Handle empty data
    if (payments.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .text(`No payment records found for ${monthName} ${selectedYear}.`, 50, doc.y + 20);
      doc.end();
      return;
    }

    // Table configuration
    const tableHeaders = [
      "Date",
      "First Name",
      "Amount",
      "Method",
      "Receipted",
      "Transaction ID",
      "Reference",
      "Receipt ID",
    ];
    const columnWidths = [70, 80, 60, 70, 60, 110, 80, 110];
    const startX = 50;
    let startY = doc.y + 20;
    const rowHeight = 20;
    const pageHeight = doc.page.height - doc.page.margins.bottom;

    // Function to check and add new page if needed
    const checkPageBreak = () => {
      if (startY + rowHeight > pageHeight) {
        doc.addPage();
        startY = doc.page.margins.top;
        // Redraw headers on new page
        doc.font("Helvetica-Bold").fontSize(9);
        tableHeaders.forEach((header, index) => {
          doc.text(
            header,
            startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
            startY,
            {
              width: columnWidths[index],
              align: "left",
            }
          );
        });
        startY += 20;
        doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();
      }
    };

    // Draw table headers
    doc.font("Helvetica-Bold").fontSize(9);
    tableHeaders.forEach((header, index) => {
      doc.text(
        header,
        startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
        startY,
        {
          width: columnWidths[index],
          align: "left",
        }
      );
    });

    // Draw header underline
    startY += 20;
    doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();

    // Draw table rows
    doc.font("Helvetica").fontSize(9);
    payments.forEach((payment) => {
      checkPageBreak();

      const rowData = [
        payment.createdAt.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        payment.receipt?.customer?.firstName || "N/A",
        `Ksh ${payment.amount.toFixed(2)}`,
        payment.modeOfPayment,
        payment.receipted ? "Yes" : "No",
        payment.transactionId || "N/A",
        payment.ref || "N/A",
        payment.receiptId || "N/A",
      ];

      rowData.forEach((text, index) => {
        doc.text(
          text,
          startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
          startY,
          { width: columnWidths[index], align: "left" }
        );
      });

      startY += rowHeight;
    });

    // Add total summary
    checkPageBreak();
    startY += 20;
    const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Total Amount: Ksh ${totalAmount.toFixed(2)}`, 50, startY);

    doc.end();
  } catch (error) {
    console.error("Error generating PDF report:", error);
    const statusCode =
      error.message === "Tenant ID is required" ? 403 :
      error.message.includes("Month") || error.message.includes("Year") ? 400 :
      500;
    res.status(statusCode).json({
      error: error.message || "Failed to generate PDF report",
    });
  }
}






async function generateMpesaReport(req, res) {
  try {
    // Validate and get tenant information
    const tenantId = req.user?.tenantId;

    console.log(`this is the tenant id ${tenantId}`);
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Get first and last day of current month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Fetch payment data for the current month
    const payments = await prisma.mPESATransactions.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
      select: {
        TransID: true,
        TransTime: true,
        TransAmount: true,
        BillRefNumber: true,
        FirstName: true,
        processed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader('Content-Disposition', 'attachment; filename="Mpesa-report.pdf"');
    doc.pipe(res);

    // Add header
    generatePDFHeader(doc, tenant);

    // Report title
    doc
      .fontSize(14)
      .text("M-Pesa Transactions Report", { align: "center" })
      .moveDown(1);
    doc
      .fontSize(12)
      .text(
        `Period: ${firstDayOfMonth.toDateString()} - ${lastDayOfMonth.toDateString()}`,
        { align: "center" }
      )
      .moveDown(1);

    // Handle empty data
    if (payments.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .text("No payment records found for this month.", 50, doc.y + 20);
      doc.end();
      return;
    }

    // Table configuration
    const tableHeaders = [
      "TransID",
      "Date",
      "Amount",
      "BillRefNumber",
      "First Name",
      "Processed",
    ];
    const columnWidths = [70, 80, 60, 100, 110, 70];
    const startX = 50;
    let startY = doc.y + 20;
    const rowHeight = 20;
    const pageHeight = doc.page.height - doc.page.margins.bottom;

    // Function to check and add new page if needed
    const checkPageBreak = () => {
      if (startY + rowHeight > pageHeight) {
        doc.addPage();
        startY = doc.page.margins.top;
        // Redraw headers on new page
        doc.font("Helvetica-Bold").fontSize(9);
        tableHeaders.forEach((header, index) => {
          doc.text(
            header,
            startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
            startY,
            {
              width: columnWidths[index],
              align: "left",
            }
          );
        });
        startY += 20;
        doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();
      }
    };

    // Draw table headers
    doc.font("Helvetica-Bold").fontSize(9);
    tableHeaders.forEach((header, index) => {
      doc.text(
        header,
        startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
        startY,
        {
          width: columnWidths[index],
          align: "left",
        }
      );
    });

    // Draw header underline
    startY += 20;
    doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();

    // Draw table rows
    doc.font("Helvetica").fontSize(9);
    payments.forEach((payment) => {
      // Check for page break before drawing row
      checkPageBreak();

      const rowData = [
        payment.TransID || "N/A",
        payment.createdAt.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        `Ksh ${payment.TransAmount.toFixed(2)}`,
        payment.BillRefNumber || "N/A",
        payment.FirstName || "N/A",
        payment.processed ? "Yes" : "No",
      ];

      // Draw all cells in the row at the same startY
      rowData.forEach((text, index) => {
        doc.text(
          text,
          startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
          startY,
          { width: columnWidths[index], align: "left" }
        );
      });

      // Move to next row (no separator line)
      startY += rowHeight;
    });

    // Add total summary
    checkPageBreak();
    startY += 20;
    const totalAmount = payments.reduce((sum, payment) => sum + payment.TransAmount, 0);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Total Amount: Ksh ${totalAmount.toFixed(2)}`, 50, startY);

    doc.end();
  } catch (error) {
    console.error("Error generating M-Pesa report:", error);
    const statusCode = error.message === "Tenant ID is required" ? 403 : 500;
    res.status(statusCode).json({
      error: error.message || "Failed to generate report",
    });
  }
}


async function generateReceiptReport(req, res) {
  try {
    // Validate and get tenant information
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader('Content-Disposition', 'attachment; filename="receipt-report.pdf"');
    doc.pipe(res);

    // Add header
    generatePDFHeader(doc, tenant);

    // Report title
    doc
      .fontSize(14)
      .text("Receipt Report", { align: "center" })
      .moveDown(1);

    // Table configuration
    const tableHeaders = [
      "Date",
      "Receipt No",
      "Amount",
      "Mode",
      "Paid By",
      "Transaction Code",
      "Phone Number",
    ];
    const columnWidths = [70, 100, 80, 80, 100, 100, 100];
    const startX = 50;
    let startY = doc.y + 20;
    const rowHeight = 20;
    const pageHeight = doc.page.height - doc.page.margins.bottom;

    // Function to check and add new page if needed
    const checkPageBreak = () => {
      if (startY + rowHeight > pageHeight) {
        doc.addPage();
        startY = doc.page.margins.top;
        // Redraw headers on new page
        doc.font("Helvetica-Bold").fontSize(9);
        tableHeaders.forEach((header, index) => {
          doc.text(
            header,
            startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
            startY,
            {
              width: columnWidths[index],
              align: "left",
            }
          );
        });
        startY += 20;
        doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();
      }
    };

    // Draw table headers
    doc.font("Helvetica-Bold").fontSize(9);
    tableHeaders.forEach((header, index) => {
      doc.text(
        header,
        startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
        startY,
        {
          width: columnWidths[index],
          align: "left",
        }
      );
    });

    // Draw header underline
    startY += 20;
    doc.strokeColor("blue").moveTo(50, startY).lineTo(580, startY).stroke();

    // Fetch receipt data
    const receipts = await prisma.receipt.findMany({
      where: { tenantId },
      select: {
        createdAt: true,
        receiptNumber: true,
        amount: true,
        modeOfPayment: true,
        paidBy: true,
        transactionCode: true,
        phoneNumber: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Handle empty data
    if (receipts.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .text("No receipt records found", 50, startY + 20);
      doc.end();
      return;
    }

    // Draw table rows
    doc.font("Helvetica").fontSize(9);
    receipts.forEach((receipt) => {
      // Check for page break before drawing row
      checkPageBreak();

      const rowData = [
        receipt.createdAt.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        receipt.receiptNumber,
        `Ksh ${receipt.amount.toFixed(2)}`,
        receipt.modeOfPayment,
        receipt.paidBy || "N/A",
        receipt.transactionCode || "N/A",
        receipt.phoneNumber || "N/A",
      ];

      // Draw all cells in the row at the same startY
      rowData.forEach((text, index) => {
        doc.text(
          text,
          startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
          startY,
          { width: columnWidths[index], align: "left" }
        );
      });

      // Move to next row (no separator line)
      startY += rowHeight;
    });

    // Add total summary
    checkPageBreak();
    startY += 20;
    const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Total Amount: Ksh ${totalAmount.toFixed(2)}`, 50, startY);

    doc.end();
  } catch (error) {
    console.error("Error generating Receipt Report:", error);
    const statusCode = error.message === "Tenant ID is required" ? 403 : 500;
    res.status(statusCode).json({
      error: error.message || "Failed to generate Receipt Report",
    });
  }
}



module.exports = { generatePaymentReportPDF,generateMpesaReport,generateReceiptReport,generateIncomeReport };