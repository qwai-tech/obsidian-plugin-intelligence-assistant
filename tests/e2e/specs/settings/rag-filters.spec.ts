/**
 * E2E Tests for RAG Settings - Filters Subtab
 * Tests folder/file/tag filtering rules
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import {

	openRagTab,
	switchRagSubtab,
	getExcludedFolders,
	addExcludedFolder,
	removeExcludedFolder,
	getIncludedFileTypes,
	addIncludedFileType,
	removeIncludedFileType,
	getExcludedFileTypes,
	addExcludedFileType,
	removeExcludedFileType,
	getFilterTags,
	addFilterTag,
	removeFilterTag,
	getExcludedTags,
	addExcludedTag,
	removeExcludedTag,
	clearAllFilters,
} from '../../utils/rag-helpers';

describe('RAG Settings - Filters', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openRagTab();
		await switchRagSubtab('filters');
	});

	afterEach(async () => {
		// Clean up test filters
		try {
			await clearAllFilters();
			await browser.pause(300);
		} catch (e) {
			// Ignore cleanup errors
		}

		await closeSettings();
	});

	describe('Folder Exclusion', () => {
		it('should add folder to exclusion list', async () => {
			const testFolder = 'test-exclude-folder';
			await addExcludedFolder(testFolder);

			const folders = await getExcludedFolders();
			expect(folders).toContain(testFolder);
		});

		it('should remove folder from exclusion list', async () => {
			const testFolder = 'test-remove-folder';

			// Add folder first
			await addExcludedFolder(testFolder);
			let folders = await getExcludedFolders();
			expect(folders).toContain(testFolder);

			// Remove folder
			await removeExcludedFolder(testFolder);
			folders = await getExcludedFolders();
			expect(folders).not.toContain(testFolder);
		});

		it('should handle multiple folder exclusions', async () => {
			const folders = ['folder1', 'folder2', 'folder3'];

			for (const folder of folders) {
				await addExcludedFolder(folder);
			}

			const excludedFolders = await getExcludedFolders();
			for (const folder of folders) {
				expect(excludedFolders).toContain(folder);
			}
		});

		it('should persist folder exclusions', async () => {
			const testFolder = 'persist-folder';
			await addExcludedFolder(testFolder);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('filters');

			// Verify persisted
			const folders = await getExcludedFolders();
			expect(folders).toContain(testFolder);
		});
	});

	describe('File Type Inclusion', () => {
		it('should add file type to inclusion list', async () => {
			const testType = '.txt';
			await addIncludedFileType(testType);

			const types = await getIncludedFileTypes();
			expect(types).toContain(testType);
		});

		it('should remove file type from inclusion list', async () => {
			const testType = '.csv';

			// Add type first
			await addIncludedFileType(testType);
			let types = await getIncludedFileTypes();
			expect(types).toContain(testType);

			// Remove type
			await removeIncludedFileType(testType);
			types = await getIncludedFileTypes();
			expect(types).not.toContain(testType);
		});

		it('should handle multiple file type inclusions', async () => {
			const types = ['.md', '.txt', '.pdf'];

			for (const type of types) {
				await addIncludedFileType(type);
			}

			const includedTypes = await getIncludedFileTypes();
			for (const type of types) {
				expect(includedTypes).toContain(type);
			}
		});

		it('should persist file type inclusions', async () => {
			const testType = '.json';
			await addIncludedFileType(testType);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('filters');

			// Verify persisted
			const types = await getIncludedFileTypes();
			expect(types).toContain(testType);
		});
	});

	describe('File Type Exclusion', () => {
		it('should add file type to exclusion list', async () => {
			const testType = '.log';
			await addExcludedFileType(testType);

			const types = await getExcludedFileTypes();
			expect(types).toContain(testType);
		});

		it('should remove file type from exclusion list', async () => {
			const testType = '.tmp';

			// Add type first
			await addExcludedFileType(testType);
			let types = await getExcludedFileTypes();
			expect(types).toContain(testType);

			// Remove type
			await removeExcludedFileType(testType);
			types = await getExcludedFileTypes();
			expect(types).not.toContain(testType);
		});

		it('should handle multiple file type exclusions', async () => {
			const types = ['.log', '.tmp', '.cache'];

			for (const type of types) {
				await addExcludedFileType(type);
			}

			const excludedTypes = await getExcludedFileTypes();
			for (const type of types) {
				expect(excludedTypes).toContain(type);
			}
		});

		it('should persist file type exclusions', async () => {
			const testType = '.bak';
			await addExcludedFileType(testType);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('filters');

			// Verify persisted
			const types = await getExcludedFileTypes();
			expect(types).toContain(testType);
		});
	});

	describe('Tag Filtering', () => {
		it('should add tag to filter list', async () => {
			const testTag = '#project';
			await addFilterTag(testTag);

			const tags = await getFilterTags();
			expect(tags).toContain(testTag);
		});

		it('should remove tag from filter list', async () => {
			const testTag = '#work';

			// Add tag first
			await addFilterTag(testTag);
			let tags = await getFilterTags();
			expect(tags).toContain(testTag);

			// Remove tag
			await removeFilterTag(testTag);
			tags = await getFilterTags();
			expect(tags).not.toContain(testTag);
		});

		it('should handle multiple tag filters', async () => {
			const tags = ['#project', '#work', '#personal'];

			for (const tag of tags) {
				await addFilterTag(tag);
			}

			const filterTags = await getFilterTags();
			for (const tag of tags) {
				expect(filterTags).toContain(tag);
			}
		});

		it('should persist tag filters', async () => {
			const testTag = '#important';
			await addFilterTag(testTag);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('filters');

			// Verify persisted
			const tags = await getFilterTags();
			expect(tags).toContain(testTag);
		});
	});

	describe('Tag Exclusion', () => {
		it('should add tag to exclusion list', async () => {
			const testTag = '#draft';
			await addExcludedTag(testTag);

			const tags = await getExcludedTags();
			expect(tags).toContain(testTag);
		});

		it('should remove tag from exclusion list', async () => {
			const testTag = '#archive';

			// Add tag first
			await addExcludedTag(testTag);
			let tags = await getExcludedTags();
			expect(tags).toContain(testTag);

			// Remove tag
			await removeExcludedTag(testTag);
			tags = await getExcludedTags();
			expect(tags).not.toContain(testTag);
		});

		it('should handle multiple tag exclusions', async () => {
			const tags = ['#draft', '#archive', '#private'];

			for (const tag of tags) {
				await addExcludedTag(tag);
			}

			const excludedTags = await getExcludedTags();
			for (const tag of tags) {
				expect(excludedTags).toContain(tag);
			}
		});

		it('should persist tag exclusions', async () => {
			const testTag = '#temp';
			await addExcludedTag(testTag);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('filters');

			// Verify persisted
			const tags = await getExcludedTags();
			expect(tags).toContain(testTag);
		});
	});

	describe('Filter Management', () => {
		it('should clear all filters', async () => {
			// Add various filters
			await addExcludedFolder('test-folder');
			await addIncludedFileType('.md');
			await addExcludedFileType('.log');
			await addFilterTag('#project');
			await addExcludedTag('#draft');
			await browser.pause(500);

			// Clear all
			await clearAllFilters();
			await browser.pause(500);

			// Verify all cleared
			expect((await getExcludedFolders()).length).toBe(0);
			expect((await getIncludedFileTypes()).length).toBe(0);
			expect((await getExcludedFileTypes()).length).toBe(0);
			expect((await getFilterTags()).length).toBe(0);
			expect((await getExcludedTags()).length).toBe(0);
		});
	});
});
