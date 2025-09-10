
const { PrismaClient } = require('@prisma/client');

const path = require('path');
const fs = require('fs');
 // or adjust based on where prisma is initialized
const { generateReceiptPDF } = require('./generateReceiptPDF.js');



const {prisma} = require('../../globalPrismaClient.js');




const fetchReceipts = async (tenantId, receiptId) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required to fetch receipts.');
  }

  try {
    const receipts = await prisma.receipt.findFirst({
      where: {
        tenantId,
        ...(receiptId && { id: receiptId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            closingBalance: true,
          },
        },
        receiptInvoices: {
          include: {
            invoice: {
              include: {
                items: true, // Changed from 'item' to 'items'
              },
            },
          },
        },
      },
    });

    // Format result: ensure dates are strings and balances are numbers
    if (!receipts) {
      throw new Error('Receipt not found');
    }

    return {
      ...receipts,
      createdAt: receipts.createdAt.toISOString(),
      customer: {
        ...receipts.customer,
        closingBalance: receipts.customer?.closingBalance || 0,
      },
    };
  } catch (error) {
    console.error('Error fetching receipts:', error);
    throw new Error('Failed to fetch receipts.');
  }
};




async function downloadReceipt(req, res) {
  const { receiptId } = req.params;
  const { tenantId } = req.user;

  try {
    const receipt = await fetchReceipts(tenantId, receiptId);

    console.log(`receipt data: ${JSON.stringify(receipt)}`);

    if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

    const pdfPath = await generateReceiptPDF(receipt);

    res.download(pdfPath, `receipt-${receiptId}.pdf`, (err) => {
      if (err) {
        console.error('Error sending PDF:', err);
        res.status(500).send('Error downloading receipt');
      }

      try {
        fs.unlinkSync(pdfPath);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });
  } catch (error) {
    console.error('Download Receipt Error:', error);
    res.status(500).json({ message: error.message });
  }
}

module.exports = { downloadReceipt,fetchReceipts };
