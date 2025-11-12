/**
 * Jest setup file
 * Provides polyfills and global mocks for testing
 */

// Add TextEncoder and TextDecoder polyfills for jsdom
const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
