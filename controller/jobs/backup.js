require('dotenv').config();
const { exec } = require('child_process');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

const backupDatabase = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `${BACKUP_DIR}/backup-${timestamp}.sql`;

  const fs = require('fs');
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} 
-h ${DB_HOST} ${DB_NAME} > ${backupFile}`;

  return new Promise((resolve, reject) => {
    exec(backupCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Backup failed: ${stderr}`);
        reject(error);
      } else {
        console.log(`Backup created: ${backupFile}`);
        resolve(backupFile);
      }
    });
  });
};

const deleteOldRecords = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  try {
    const deleted = await prisma.sMS.deleteMany({
      where: {
        createdAt: {
          lt: sevenDaysAgo,
        },
      },
    });
    console.log(`Deleted ${deleted.count} records older than 7 days from 
sMS table`);
  } catch (error) {
    console.error('Error deleting old records:', error);
  }
};

const runDailyTask = async () => {
  try {
    await backupDatabase();
    await deleteOldRecords();
  } catch (error) {
    console.error('Daily task failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};



module.exports = () => {
  cron.schedule('*/5 * * * *', () => {
    console.log('Running daily backup and cleanup...');
    runDailyTask();
  }, {
    scheduled: true,
    timezone: 'Africa/Nairobi'
  });
  console.log('Daily backup scheduler started.');
};