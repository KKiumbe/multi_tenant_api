require('dotenv').config();
const { exec } = require('child_process');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs').promises;
const path = require('path');



const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_DAYS = 7; // Keep backups for 7 days
const instanceId = process.env.PM2_NODE_ID || `pid-${process.pid}`; // Fallback to process ID if PM2_NODE_ID is undefined

// Debug: Log environment variables and process info at startup
console.log(`[${instanceId}] Debug: PM2_NODE_ID=${process.env.PM2_NODE_ID}, NODE_ENV=${process.env.NODE_ENV}, PID=${process.pid}, PM2_VERSION=${process.env.PM2_VERSION}`);

const backupDatabase = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.dump`);

    // Ensure backup directory exists
    if (!(await fs.stat(BACKUP_DIR).catch(() => false))) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log(`[${instanceId}] Created backup directory: ${BACKUP_DIR}`);
    }

    // Use pg_dump with -Fc for custom format (.dump)
    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} -Fc ${DB_NAME} -f ${backupFile}`;
    console.log(`[${instanceId}] Executing: ${backupCommand.replace(DB_PASSWORD, '****')}`);

    await new Promise((resolve, reject) => {
      exec(backupCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`[${instanceId}] Backup failed: ${stderr || error.message}`);
          reject(error);
        } else {
          console.log(`[${instanceId}] Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      });
    });
    return backupFile;
  } catch (error) {
    throw new Error(`[${instanceId}] Backup process failed: ${error.message}`);
  }
};

const deleteOldBackups = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    let deletedCount = 0;
    let skippedCount = 0;

    const files = await fs.readdir(BACKUP_DIR);
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = await fs.stat(filePath).catch((error) => {
          if (error.code === 'ENOENT') {
            console.log(`[${instanceId}] File ${filePath} not found, skipping.`);
            skippedCount++;
            return null;
          }
          throw error;
        });

        if (stats && stats.isFile() && stats.mtime < cutoffDate) {
          await fs.unlink(filePath).catch((error) => {
            if (error.code === 'ENOENT') {
              console.log(`[${instanceId}] File ${filePath} already deleted, skipping.`);
              skippedCount++;
              return;
            }
            throw error;
          });
          console.log(`[${instanceId}] Deleted old backup: ${filePath}`);
          deletedCount++;
        } else if (!stats) {
          skippedCount++;
        }
      } catch (error) {
        console.error(`[${instanceId}] Error processing file ${filePath}: ${error.message}`);
      }
    }
    console.log(`[${instanceId}] Cleanup complete: ${deletedCount} files deleted, ${skippedCount} files skipped.`);
  } catch (error) {
    console.error(`[${instanceId}] Error in cleanup task: ${error.message}`);
    throw error;
  }
};

// Fallback to select a single instance based on lowest PID
const isPrimaryInstance = async () => {
  if (process.env.PM2_NODE_ID === '0') return true;
  if (!process.env.PM2_NODE_ID) {
    // Fallback: Check for a lock file to elect a primary instance
    const lockFile = path.join(BACKUP_DIR, 'cleanup.lock');
    try {
      await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' }); // Exclusive write
      console.log(`[${instanceId}] Acquired cleanup lock`);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        console.log(`[${instanceId}] Cleanup lock exists, skipping cleanup`);
        return false;
      }
      console.error(`[${instanceId}] Error checking lock: ${error.message}`);
      return false;
    }
  }
  return false;
};

const runTask = async () => {
  try {
    console.log(`[${instanceId}] Starting backup and cleanup task...`);
    await backupDatabase();
    if (await isPrimaryInstance()) {
      console.log(`[${instanceId}] Performing cleanup...`);
      await deleteOldBackups();
    } else {
      console.log(`[${instanceId}] Skipping cleanup.`);
    }
    console.log(`[${instanceId}] Task completed successfully.`);
  } catch (error) {
    console.error(`[${instanceId}] Task failed: ${error.message}`);
  }
};

module.exports = () => {
  if (!DB_USER || !DB_PASSWORD || !DB_NAME || !DB_HOST || !BACKUP_DIR) {
    console.error(`[${instanceId}] Missing required environment variables (DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, BACKUP_DIR). Check your .env file.`);
    return;
  }

  cron.schedule('0 0 * * *', () => {
    console.log(`[${instanceId}] Running task at: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}`);
    runTask();
  }, {
    scheduled: true,
    timezone: 'Africa/Nairobi'
  });
  console.log(`[${instanceId}] Scheduler started. Task will run every midnight.`);
};