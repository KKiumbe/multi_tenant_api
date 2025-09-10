require('dotenv').config({ quiet: true });
const { exec } = require('child_process');
const cron = require('node-cron');

const fs = require('fs').promises;
const path = require('path');
const { uploadToDropbox } = require('./backuToDropbox');
const lockfile = require('proper-lockfile');

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_DAYS = 7; // Keep backups for 7 days

// Debug: Log environment variables and process info at startup


const backupDatabase = async () => {
  try {

    const timestamp = new Date().toISOString().split('T')[0];

    //const timestamp = new Date().getDate.toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-taqa-${timestamp}.dump`);

    // Ensure backup directory exists
    if (!(await fs.stat(BACKUP_DIR).catch(() => false))) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
     
    }

    // Use pg_dump with -Fc for custom format (.dump)
    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} -Fc ${DB_NAME} -f ${backupFile}`;
  

    await new Promise((resolve, reject) => {
      exec(backupCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Backup failed: ${stderr || error.message}`);
          reject(error);
        } else {
          console.log(` Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      });
    });

    try {
      await uploadToDropbox(backupFile);
    } catch (error) {
      console.error(`Failed to upload to Dropbox: ${error.message}`);
    }

    return backupFile;
  } catch (error) {
    throw new Error(` Backup process failed: ${error.message}`);
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
      if (!file.endsWith('.dump')) continue;
      
      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile() && stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          console.log(` Deleted old backup: ${filePath}`);
          deletedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(` File ${filePath} not found, skipping.`);
          skippedCount++;
        } else {
          console.error(` Error processing file ${filePath}: ${error.message}`);
        }
      }
    }
    console.log(` Cleanup complete: ${deletedCount} files deleted, ${skippedCount} files skipped.`);
  } catch (error) {
    console.error(`[ Error in cleanup task: ${error.message}`);
    throw error;
  }
};

const runTask = async () => {


  try {
   
    await backupDatabase();
    await deleteOldBackups();
    console.log(` Task completed successfully.`);
  } catch (error) {
    console.error(`[$Task failed: ${error.message}`);
  } 
};


module.exports = runTask;
