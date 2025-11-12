const { existsSync, statSync, copyFileSync, mkdirSync } = require('fs');
const { join, dirname, basename } = require('path');
const logger = require('./logger');

class FileUtils {
    /**
     * Copy a file from source to destination with error handling
     */
    static copyFile(source, destination, options = {}) {
        try {
            if (!existsSync(source)) {
                if (options.required) {
                    throw new Error(`Required file not found: ${source}`);
                } else {
                    logger.warning(`Optional file not found: ${source}`);
                    return false;
                }
            }

            // Ensure destination directory exists
            const destDir = dirname(destination);
            if (!existsSync(destDir)) {
                mkdirSync(destDir, { recursive: true });
                logger.file(`Created directory: ${destDir}`);
            }

            copyFileSync(source, destination);
            logger.file(`Copied: ${basename(source)} → ${basename(destination)}`);
            return true;
        } catch (error) {
            logger.error(`Failed to copy ${source}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if file exists and get stats
     */
    static getFileInfo(filePath) {
        if (!existsSync(filePath)) {
            return { exists: false };
        }

        try {
            const stats = statSync(filePath);
            return {
                exists: true,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime
            };
        } catch (error) {
            logger.error(`Failed to get file info for ${filePath}: ${error.message}`);
            return { exists: false, error };
        }
    }

    /**
     * Ensure directory exists
     */
    static ensureDirectory(dirPath) {
        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
            logger.file(`Created directory: ${dirPath}`);
            return true;
        }
        return false;
    }

    /**
     * Validate multiple files exist
     */
    static validateFiles(filePaths, basePath = process.cwd()) {
        const results = {
            valid: [],
            missing: [],
            total: filePaths.length
        };

        for (const filePath of filePaths) {
            const fullPath = join(basePath, filePath);
            const info = this.getFileInfo(fullPath);
            
            if (info.exists) {
                results.valid.push({
                    path: filePath,
                    size: info.size,
                    modified: info.modified
                });
            } else {
                results.missing.push(filePath);
            }
        }

        return results;
    }

    /**
     * Clean directory (remove all files)
     */
    static cleanDirectory(dirPath) {
        const { rmSync } = require('fs');
        
        try {
            if (existsSync(dirPath)) {
                rmSync(dirPath, { recursive: true, force: true });
                logger.file(`Cleaned directory: ${dirPath}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Failed to clean directory ${dirPath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get file size in human readable format
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Create backup of file
     */
    static createBackup(filePath, backupDir = './backups') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const backupName = `${basename(filePath)}.backup.${timestamp}`;
            const backupPath = join(backupDir, backupName);
            
            this.ensureDirectory(backupDir);
            this.copyFile(filePath, backupPath);
            
            logger.highlight(`Backup created: ${backupPath}`);
            return backupPath;
        } catch (error) {
            logger.error(`Failed to create backup: ${error.message}`);
            throw error;
        }
    }
}

module.exports = FileUtils;
