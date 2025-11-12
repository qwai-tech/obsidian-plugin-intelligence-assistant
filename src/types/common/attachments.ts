/**
 * Attachment Common Types
 * Shared types for file attachments and references
 */

export interface Attachment {
	type: 'file' | 'image';
	name: string;
	path: string;
	content?: string;
}

export interface FileReference {
	type: 'file' | 'folder';
	path: string;
	name: string;
}
