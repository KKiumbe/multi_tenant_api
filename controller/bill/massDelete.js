
const moment = require('moment-timezone');

const {prisma} = require('../../globalPrismaClient.js');

 const deleteTodayInvoices = async (req, res) => {
  try {
    const timezone = 'Africa/Nairobi';

    const startOfToday = moment.tz(timezone).startOf('day').toDate();
    const endOfToday = moment.tz(timezone).endOf('day').toDate();

    // Step 1: Get today's invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      select: { id: true },
    });

    if (invoices.length === 0) {
      return res.status(200).json({ message: 'No invoices created today.' });
    }

    const invoiceIds = invoices.map(i => i.id);

    // Step 2: Delete related invoiceItems and receiptInvoices
    await prisma.$transaction([
      prisma.invoiceItem.deleteMany({
        where: {
          invoiceId: { in: invoiceIds },
        },
      }),
      prisma.receiptInvoice.deleteMany({
        where: {
          invoiceId: { in: invoiceIds },
        },
      }),
      prisma.invoice.deleteMany({
        where: {
          id: { in: invoiceIds },
        },
      }),
    ]);

    return res.status(200).json({ message: `Deleted ${invoices.length} invoices created today.` });

  } catch (error) {
    console.error('❌ Error deleting today’s invoices:', error);
    return res.status(500).json({ error: 'Failed to delete today’s invoices.' });
  }
};
 module.exports = { deleteTodayInvoices };