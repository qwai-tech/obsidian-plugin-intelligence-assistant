const { join } = require('path');
const { buildLocalePacks } = require('../../scripts/locale-pack');

module.exports = { LOCALE_PACKS: buildLocalePacks(join(__dirname, '../../src/i18n/locales')) };
