/**
 * Workflow Service
 * Manages workflow file creation and naming
 */

import { App, Notice, TFolder, TFile, TAbstractFile } from 'obsidian';
import { WorkflowGraph } from '@/domain/workflow';

/**
 * Create a new workflow file in the specified folder
 */
export async function createWorkflowFile(
	app: App,
	folder: TFolder,
	baseName: string = 'New Intelligence Workflow'
): Promise<void> {
	const { fileName, displayName } = generateUniqueWorkflowFilename(app, folder, baseName);
	const folderPath = folder.path && folder.path !== '/' ? folder.path : '';
	const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;

	const workflow = WorkflowGraph.create(displayName);
	const content = JSON.stringify(workflow.toJSON(), null, 2);

	try {
		const createdFile = await app.vault.create(fullPath, content);
		new Notice(`✅ Workflow created: "${displayName}"`);

		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(createdFile);
	} catch (error: unknown) {
		console.error('Failed to create workflow file', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		new Notice(`Failed to create workflow: ${message}`);
	}
}

/**
 * Generate a unique workflow filename in the given folder
 */
function generateUniqueWorkflowFilename(
	app: App,
	folder: TFolder,
	baseName: string
): { fileName: string; displayName: string } {
	const sanitizedBase = baseName.trim().replace(/[\\/:]/g, '-') || 'Workflow';
	const folderPath = folder.path && folder.path !== '/' ? `${folder.path}/` : '';
	let counter = 0;
	let displayName = sanitizedBase;
	let fileName = composeWorkflowFilename(displayName);

	while (app.vault.getAbstractFileByPath(`${folderPath}${fileName}`)) {
		counter += 1;
		displayName = `${sanitizedBase} ${counter + 1}`;
		fileName = composeWorkflowFilename(displayName);
	}

	return { fileName, displayName };
}

/**
 * Compose a workflow filename from a display name
 */
function composeWorkflowFilename(name: string): string {
	const trimmed = name.trim() || 'Workflow';
	return `${trimmed}.workflow`;
}

/**
 * Get the target folder for workflow creation from a file menu context
 */
export function getTargetFolder(app: App, file?: TAbstractFile): TFolder | null {
	if (file instanceof TFolder) {
		return file;
	}
	if (file instanceof TFile) {
		return file.parent;
	}
	return app.vault.getRoot();
}
