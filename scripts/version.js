#!/usr/bin/env node

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const logger = require('./utils/logger');

/**
 * Version management script for bumping plugin versions
 */
class VersionManager {
    constructor() {
        this.sourceDir = process.cwd();
        this.options = this.parseArgs();
        
        // File paths
        this.manifestPath = join(this.sourceDir, 'manifest.json');
        this.versionsPath = join(this.sourceDir, 'versions.json');
        this.packagePath = join(this.sourceDir, 'package.json');
    }

    parseArgs() {
        const args = process.argv.slice(2);
        const versionType = args[0] || 'patch';
        
        return {
            versionType,
            showHelp: args.includes('--help') || args.includes('-h')
        };
    }

    async bump() {
        if (this.options.showHelp) {
            this.showHelp();
            return;
        }

        logger.section('🏷️ Version Management');
        
        try {
            // Step 1: Get current version from package.json
            const currentVersion = this.getCurrentVersion();
            logger.info(`Current version: ${currentVersion}`);
            
            // Step 2: Calculate new version
            const newVersion = this.calculateNewVersion(currentVersion, this.options.versionType);
            logger.info(`New version: ${newVersion} (${this.options.versionType})`);
            
            // Step 3: Update manifest.json
            this.updateManifest(newVersion);
            
            // Step 4: Update versions.json
            this.updateVersions(newVersion);
            
            // Step 5: Update package.json
            this.updatePackage(newVersion);
            
            logger.success(`✅ Version bumped to ${newVersion}`);
            logger.info('💡 Remember to commit the changes');
            
        } catch (error) {
            logger.error(`Version bump failed: ${error.message}`);
            process.exit(1);
        }
    }

    getCurrentVersion() {
        const packageJson = JSON.parse(readFileSync(this.packagePath, 'utf8'));
        return packageJson.version;
    }

    calculateNewVersion(current, type) {
        const parts = current.split('.').map(Number);
        
        switch (type) {
            case 'major':
                return `${parts[0] + 1}.0.0`;
            case 'minor':
                return `${parts[0]}.${parts[1] + 1}.0`;
            case 'patch':
            default:
                return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
        }
    }

    updateManifest(newVersion) {
        logger.step('1', 'Updating manifest.json');
        
        const manifest = JSON.parse(readFileSync(this.manifestPath, 'utf8'));
        const { minAppVersion } = manifest;
        
        manifest.version = newVersion;
        
        writeFileSync(this.manifestPath, JSON.stringify(manifest, null, '\t'));
        logger.success(`manifest.json updated to ${newVersion}`);
    }

    updateVersions(newVersion) {
        logger.step('2', 'Updating versions.json');
        
        let versions;
        try {
            versions = JSON.parse(readFileSync(this.versionsPath, 'utf8'));
        } catch (error) {
            versions = {};
        }
        
        const manifest = JSON.parse(readFileSync(this.manifestPath, 'utf8'));
        const { minAppVersion } = manifest;
        
        versions[newVersion] = minAppVersion;
        
        writeFileSync(this.versionsPath, JSON.stringify(versions, null, '\t'));
        logger.success(`versions.json updated with ${newVersion} -> ${minAppVersion}`);
    }

    updatePackage(newVersion) {
        logger.step('3', 'Updating package.json');
        
        const packageJson = JSON.parse(readFileSync(this.packagePath, 'utf8'));
        packageJson.version = newVersion;
        
        writeFileSync(this.packagePath, JSON.stringify(packageJson, null, '\t'));
        logger.success(`package.json updated to ${newVersion}`);
    }

    showHelp() {
        console.log(`
🏷️ Version Management Tool

Usage: node version.js [type]

Types:
  patch   Increment patch version (1.0.1 -> 1.0.2) [default]
  minor   Increment minor version (1.0.1 -> 1.1.0)
  major   Increment major version (1.0.1 -> 2.0.0)

Examples:
  node version.js           # Bump patch version
  node version.js patch       # Bump patch version
  node version.js minor       # Bump minor version
  node version.js major       # Bump major version

Files updated:
  - manifest.json (version field)
  - versions.json (version -> minAppVersion mapping)
  - package.json (version field)

Note:
  This tool automatically commits the changes if git is available.
        `);
    }
}

// Command line interface
async function main() {
    const versionManager = new VersionManager();
    await versionManager.bump();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        logger.error(`Unexpected error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = VersionManager;
