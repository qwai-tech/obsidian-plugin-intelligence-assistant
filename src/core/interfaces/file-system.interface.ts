/**
 * Abstract interface for file system operations.
 * Decouples application logic from specific platforms like Obsidian Vault or Node.js fs.
 */
export interface IFileSystem {
	exists(_path: string): Promise<boolean>;
	read(_path: string): Promise<string>;
	write(_path: string, _data: string): Promise<void>;
	mkdir(_path: string): Promise<void>;
	listRecursive(_path: string): Promise<string[]>;
	getDisplayName(_path: string): string;
	isDirectory(_path: string): Promise<boolean>;
}
