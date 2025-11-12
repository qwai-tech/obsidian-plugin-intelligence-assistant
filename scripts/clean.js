#!/usr/bin/env node

const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const logger = require('./utils/logger');
const FileUtils = require('./utils/file-utils');

/**
 * Clean build artifacts and temporary files
 */
class Cleaner {
    constructor() {
        this.sourceDir = process.cwd();
        this.options = this.parseArgs();
        
        // Files and directories to clean
        this.cleanTargets = [
            { path: 'main.js', description: 'Built plugin file' },
            { path: 'main.js.map', description: 'Source map file' },
            { path: '.hotreload', description: 'Hot reload trigger file' },
            { path: 'node_modules/.cache', description: 'Build cache directory' },
            { path: 'dist', description: 'Distribution directory' },
            { path: 'backups', description: 'Backup directory' },
            { path: 'coverage', description: 'Test coverage directory' },
            { path: '*.log', description: 'Log files', pattern: true }
        ];
    }

    parseArgs() {
        const args = process.argv.slice(2);
        return {
            dryRun: args.includes('--dry-run'),
            force: args.includes('--force'),
            cache: args.includes('--cache'),
            backups: args.includes('--backups'),
            all: args.includes('--all'),
            showHelp: args.includes('--help')
        };
    }

    async clean() {
        if (this.options.showHelp) {
            this.showHelp();
            return;
        }

        logger.section('🧹 Cleaning Project');
        
        if (this.options.dryRun) {
            logger.info('🔍 DRY RUN MODE - No files will be deleted');
        }

        try {
            let cleanedCount = 0;
            let totalSize = 0;

            for (const target of this.cleanTargets) {
                const shouldClean = this.shouldCleanTarget(target);
                if (!shouldClean) continue;

                const result = await this.cleanTarget(target);
                if (result.cleaned) {
                    cleanedCount++;
                    totalSize += result.size;
                }
            }

            // Show summary
            logger.info('\n📊 Cleaning Summary:');
            logger.info(`   Files/Directories cleaned: ${cleanedCount}`);
            if (totalSize > 0) {
                logger.info(`   Total space freed: ${FileUtils.formatFileSize(totalSize)}`);
            }

            if (this.options.dryRun) {
                logger.info('\n💡 This was a dry run. Run without --dry-run to actually clean files.');
            } else if (cleanedCount > 0) {
                logger.success('✅ Cleaning completed successfully');
            } else {
                logger.info('ℹ️  No files to clean');
            }

        } catch (error) {
            logger.error(`Cleaning failed: ${error.message}`);
            if (!this.options.dryRun) {
                process.exit(1);
            }
        }
    }

    shouldCleanTarget(target) {
        // Skip if specific flags are set
        if (this.options.cache && !target.path.includes('cache')) {
            return false;
        }
        
        if (this.options.backups && !target.path.includes('backup')) {
            return false;
        }
        
        // Handle pattern matching
        if (target.pattern) {
            logger.warning(`Pattern matching not implemented for: ${target.path}`);
            return false;
        }
        
        return true;
    }

    async cleanTarget(target) {
        const targetPath = join(this.sourceDir, target.path);
        const info = FileUtils.getFileInfo(targetPath);
        
        if (!info.exists) {
            logger.muted(`⏭️  Skipped (not found): ${target.description}`);
            return { cleaned: false, size: 0 };
        }

        const size = info.isDirectory ? this.getDirectorySize(targetPath) : info.size;
        const sizeStr = FileUtils.formatFileSize(size);

        if (this.options.dryRun) {
            logger.highlight(`🔍 Would clean: ${target.description} (${sizeStr})`);
            return { cleaned: true, size: 0 };
        }

        // Confirmation for important directories
        if (info.isDirectory && !this.options.force && !this.shouldAutoDelete(target.path)) {
            logger.warning(`⚠️  Skipping directory (use --force to delete): ${target.description}`);
            return { cleaned: false, size: 0 };
        }

        try {
            if (info.isDirectory) {
                rmSync(targetPath, { recursive: true, force: true });
            } else {
                rmSync(targetPath);
            }
            
            logger.success(`🗑️  Cleaned: ${target.description} (${sizeStr})`);
            return { cleaned: true, size };
            
        } catch (error) {
            logger.error(`❌ Failed to clean ${target.description}: ${error.message}`);
            return { cleaned: false, size: 0 };
        }
    }

    shouldAutoDelete(path) {
        const autoDeletePaths = [
            '.hotreload',
            'node_modules/.cache',
            '*.log'
        ];
        return autoDeletePaths.some(p => path.includes(p));
    }

    getDirectorySize(dirPath) {
        try {
            const { statSync, readdirSync } = require('fs');
            const { join } = require('path');
            
            let totalSize = 0;
            const files = readdirSync(dirPath);
            
            for (const file of files) {
                const filePath = join(dirPath, file);
                const stats = statSync(filePath);
                
                if (stats.isDirectory()) {
                    totalSize += this.getDirectorySize(filePath);
                } else {
                    totalSize += stats.size;
                }
            }
            
            return totalSize;
        } catch (error) {
            return 0;
        }
    }

    showHelp() {
        console.log(`
🧹 Project Cleaning Tool

Usage: node clean.js [options]

Options:
  --dry-run      Show what would be deleted without actually deleting
  --force        Force deletion of directories (use with caution)
  --cache        Only clean cache files
  --backups      Only clean backup files
  --all          Clean all targets (equivalent to default behavior)
  --help         Show this help message

Targets:
  - main.js          Built plugin file
  - main.js.map      Source map file
  - .hotreload       Hot reload trigger file
  - node_modules/.cache  Build cache directory
  - dist            Distribution directory
  - backups         Backup directory
  - coverage        Test coverage directory
  - *.log           Log files

Examples:
  node clean.js                    # Clean all targets
  node clean.js --dry-run           # Show what would be cleaned
  node clean.js --cache             # Clean only cache files
  node clean.js --force             # Force clean all targets
  node clean.js --cache --backups   # Clean cache and backups

Warning:
  This tool permanently deletes files. Use --dry-run first to review what will be deleted.
        `);
    }
}

// Command line interface
async function main() {
    const cleaner = new Cleaner();
    await cleaner.clean();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        logger.error(`Unexpected error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = Cleaner;
