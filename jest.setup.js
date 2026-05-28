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
