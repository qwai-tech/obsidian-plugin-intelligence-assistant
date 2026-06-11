/**
 * Jest setup file
 * Provides polyfills and global mocks for testing
 */

// Add TextEncoder and TextDecoder polyfills for jsdom
const { TextEncoder, TextDecoder } = require('util');
const { ReadableStream, TransformStream, WritableStream } = require('stream/web');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.ReadableStream = global.ReadableStream || ReadableStream;
global.TransformStream = global.TransformStream || TransformStream;
global.WritableStream = global.WritableStream || WritableStream;
global.structuredClone = global.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));

// Obsidian exposes `activeWindow`/`activeDocument` globals (popout-safe). In jsdom
// these resolve to the standard `window`/`document`.
if (typeof document !== 'undefined') {
	global.activeDocument = global.activeDocument || global.document;
}
if (typeof window !== 'undefined') {
	global.activeWindow = global.activeWindow || global.window;
}
