#!/usr/bin/env node

const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

/** Render the exact manifest version's changelog into a reviewable release body. */
function renderReleaseNotes(root, env = process.env) {
    const { version } = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
    if (env.RELEASE_VERSION && env.RELEASE_VERSION !== version) {
        throw new Error('Release version does not match manifest.json');
    }
    const lines = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
    const start = lines.findIndex(line => line === `## [${version}]` || line.startsWith(`## [${version}] - `));
    if (start < 0) throw new Error(`No changelog entry for ${version}`);
    const next = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
    const changes = lines.slice(start + 1, next < 0 ? undefined : next).join('\n').trim();
    if (!changes) throw new Error(`Empty changelog entry for ${version}`);

    let notes = `## Intelligence Assistant ${version}\n\n${changes}\n\n` +
        '### Installation\n' +
        "Download and install via Obsidian's community plugins browser, or manually copy the files below to your vault's `.obsidian/plugins/intelligence-assistant/` folder.\n\n" +
        '### Release assets\n' +
        '- `main.js` — plugin bundle\n- `styles.css` — plugin styles\n- `manifest.json` — plugin metadata\n\n' +
        '### Verification scope\n' +
        'Fresh real-service verification is temporarily removed by release-owner approval. Lint, type checks, the production build and artifact digest checks remain required. Earlier local acceptance retains its original version scope; no new full real-gate pass is claimed.\n';

    if (env.GITHUB_ACTIONS === 'true') {
        const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA } = env;
        if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID || !GITHUB_SHA) {
            throw new Error('Missing GitHub Actions source/run identity for release notes');
        }
        notes += `\n[CI/CD run](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}) · Source: \`${GITHUB_SHA}\`\n`;
    }
    return notes;
}

if (require.main === module) {
    try {
        const output = process.argv[2];
        if (!output) throw new Error('Usage: node scripts/release-notes.js <output.md>');
        writeFileSync(resolve(output), renderReleaseNotes(process.cwd()));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { renderReleaseNotes };
