import { App, TFile } from 'obsidian';
import { rewriteNote } from '@/core/utils/note-writer';

export { assertWriteProposalResult, createWriteProposal, isBatchWriteProposal, proposalCardsFromSteps, isWriteProposal } from './write-proposal';
export type { BatchWriteProposal, ProposalCard, WriteProposal } from './write-proposal';
import { isBatchWriteProposal, type WriteProposal, type BatchWriteProposal } from './write-proposal';

export async function applyWriteProposal(app: App, proposal: WriteProposal | BatchWriteProposal, signal?: AbortSignal): Promise<void> {
	signal?.throwIfAborted();
	if (isBatchWriteProposal(proposal)) {
		for (const subProposal of proposal.proposals) {
			await applySingleProposal(app, subProposal, signal);
		}
		return;
	}
	await applySingleProposal(app, proposal, signal);
}

/**
 * Ensure the parent folder of a vault-relative file path exists, creating each
 * missing ancestor segment. vault.create() does NOT create parent folders, so
 * writing "Folder/Note.md" into a non-existent "Folder" fails with ENOENT.
 */
async function ensureParentFolder(app: App, filePath: string): Promise<void> {
	const slash = filePath.lastIndexOf('/');
	if (slash <= 0) return; // root-level file — no parent folder to create
	const folder = filePath.slice(0, slash);
	if (app.vault.getAbstractFileByPath(folder)) return;
	let current = '';
	for (const segment of folder.split('/')) {
		current = current ? `${current}/${segment}` : segment;
		if (app.vault.getAbstractFileByPath(current)) continue;
		try {
			await app.vault.createFolder(current);
		} catch {
			// Ignore "already exists" races; a genuine failure surfaces at create time.
		}
	}
}

async function applySingleProposal(app: App, proposal: WriteProposal, signal?: AbortSignal): Promise<void> {
	signal?.throwIfAborted();
	if (proposal.operation === 'create') {
		const existing = app.vault.getAbstractFileByPath(proposal.path);
		if (existing) {
			throw new Error(`File already exists: ${proposal.path}`);
		}
		await ensureParentFolder(app, proposal.path);
		signal?.throwIfAborted();
		await app.vault.create(proposal.path, proposal.proposedContent || '');
		return;
	}

	if (proposal.operation === 'delete') {
		const file = app.vault.getAbstractFileByPath(proposal.path);
		if (file) {
			// Respect the user's deletion preference (system trash vs .trash vs permanent).
			await app.fileManager.trashFile(file);
		}
		return;
	}

	if (proposal.operation === 'move') {
		const file = app.vault.getAbstractFileByPath(proposal.path);
		if (file && proposal.newPath) {
			await ensureParentFolder(app, proposal.newPath);
			signal?.throwIfAborted();
			await app.fileManager.renameFile(file, proposal.newPath);
		}
		return;
	}

	const file = app.vault.getAbstractFileByPath(proposal.path);
	if (!file || !(file instanceof TFile)) {
		throw new Error(`File not found: ${proposal.path}`);
	}
	await rewriteNote(app, file, (current) => {
		signal?.throwIfAborted();
		if (proposal.previousContent !== undefined && current !== proposal.previousContent) {
			throw new Error(`${proposal.path} changed after the proposal was made; review it again before applying.`);
		}
		return proposal.proposedContent || '';
	});
}
