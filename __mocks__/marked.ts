/**
 * Mock for marked library
 */

import { jest } from '@jest/globals';

export const marked = {
	parse: (markdown: string): string => {
		// Simple mock implementation that just wraps text in paragraphs
		// For testing purposes, we don't need full markdown parsing
		return `<p>${markdown}</p>`;
	},
	setOptions: jest.fn(),
	use: jest.fn(),
};

export default marked;
