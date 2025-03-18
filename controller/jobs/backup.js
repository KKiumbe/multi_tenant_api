require('dotenv').config();
const { exec } = require('child_process');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs').promises;

console.log('DB_PASSWORD right after dotenv:', process.env.DB_PASSWORD); // Log 1

const DB_USER = process.env.DB_USER;
DB_PASSWORD="MyNia2208#@!";
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

console.log('DB_PASSWORD assigned to const:', DB_PASSWORD); // Log 2

const backupDatabase = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${BACKUP_DIR}/backup-${timestamp}.sql`;

    if (!(await fs.stat(BACKUP_DIR).catch(() => false))) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log(`Created backup directory: ${BACKUP_DIR}`);
    }

    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} ${DB_NAME} > ${backupFile}`;
    console.log('DB_PASSWORD before command:', DB_PASSWORD); // Log 3
    console.log(`Executing: ${backupCommand}`);

    await new Promise((resolve, reject) => {
      exec(backupCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Backup failed: ${stderr || error.message}`);
          reject(error);
        } else {
          console.log(`Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      });
    });
    return backupFile;
  } catch (error) {
    throw new Error(`Backup process failed: ${error.message}`);
  }
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
    console.log(`Deleted ${deleted.count} records older than 7 days from sMS table`);
  } catch (error) {
    console.error('Error deleting old records:', error.message);
    throw error;
  }
};

const runTask = async () => {
  try {
    console.log('Starting backup and cleanup task...');
    await backupDatabase();
    await deleteOldRecords();
    console.log('Task completed successfully.');
  } catch (error) {
    console.error('Task failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = () => {
  if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error('Missing required environment variables (DB_USER, DB_PASSWORD, DB_NAME). Check your .env file.');
    return;
  }

  cron.schedule('*/5 * * * *', () => {
    console.log('Running task at:', new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
    runTask();
  }, {
    scheduled: true,
    timezone: 'Africa/Nairobi'
  });
  console.log('Scheduler started. Task will run every 5 minutes.');
};