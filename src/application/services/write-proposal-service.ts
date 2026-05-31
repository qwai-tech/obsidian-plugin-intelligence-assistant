import { App, TFile } from 'obsidian';
import type { AgentExecutionStep } from '@/types/common/reasoning';

export interface WriteProposal {
	type: 'write_proposal';
	operation: 'create' | 'update' | 'append' | 'delete' | 'move';
	path: string;
	content?: string;
	previousContent?: string;
	proposedContent?: string;
	newPath?: string;
	applied: false;
	reason: string;
}

export interface BatchWriteProposal {
	type: 'batch_proposal';
	id: string;
	proposals: WriteProposal[];
	reason: string;
	applied: false;
}

export function createWriteProposal(input: {
	operation: WriteProposal['operation'];
	path: string;
	content?: string;
	previousContent?: string;
	proposedContent?: string;
	newPath?: string;
	reason?: string;
}): WriteProposal {
	return {
		type: 'write_proposal',
		operation: input.operation,
		path: input.path,
		content: input.content,
		previousContent: input.previousContent,
		proposedContent: input.proposedContent ?? input.content,
		newPath: input.newPath,
		applied: false,
		reason: input.reason ?? 'Vault write was not applied. Review this proposal and explicitly confirm before making changes.',
	};
}

export function isBatchWriteProposal(value: unknown): value is BatchWriteProposal {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<BatchWriteProposal>;
	return candidate.type === 'batch_proposal'
		&& Array.isArray(candidate.proposals)
		&& candidate.applied === false;
}

export function createBatchWriteProposal(input: {
	id: string;
	proposals: WriteProposal[];
	reason: string;
}): BatchWriteProposal {
	return {
		type: 'batch_proposal',
		id: input.id,
		proposals: input.proposals,
		reason: input.reason,
		applied: false,
	};
}

export function isWriteProposal(value: unknown): value is WriteProposal {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<WriteProposal>;
	return candidate.type === 'write_proposal'
		&& (candidate.operation === 'create' || candidate.operation === 'update' || candidate.operation === 'append')
		&& typeof candidate.path === 'string'
		&& typeof candidate.proposedContent === 'string'
		&& candidate.applied === false;
}

export function assertWriteProposalResult(value: unknown): { success: true } | { success: false; error: string } {
	if (isWriteProposal(value)) {
		return { success: true };
	}
	return { success: false, error: 'Vault write tools must return a write proposal and must not write directly.' };
}

export function extractWriteProposalsFromSteps(steps: AgentExecutionStep[] | undefined): (WriteProposal | BatchWriteProposal)[] {
	if (!steps?.length) return [];
	const proposals: (WriteProposal | BatchWriteProposal)[] = [];
	for (const step of steps) {
		const result = step.result ?? (step.type === 'observation' ? step.content : undefined);
		if (!result) continue;
		try {
			const parsed = JSON.parse(result) as unknown;
			if (isWriteProposal(parsed)) {
				proposals.push(parsed);
			} else if (isBatchWriteProposal(parsed)) {
				proposals.push(parsed);
			}
		} catch {
			continue;
		}
	}
	return proposals;
}

export async function applyWriteProposal(app: App, proposal: WriteProposal | BatchWriteProposal): Promise<void> {
	if (isBatchWriteProposal(proposal)) {
		for (const subProposal of proposal.proposals) {
			await applySingleProposal(app, subProposal);
		}
		return;
	}
	await applySingleProposal(app, proposal as WriteProposal);
}

async function applySingleProposal(app: App, proposal: WriteProposal): Promise<void> {
	if (proposal.operation === 'create') {
		const existing = app.vault.getAbstractFileByPath(proposal.path);
		if (existing) {
			throw new Error(`File already exists: ${proposal.path}`);
		}
		await app.vault.create(proposal.path, proposal.proposedContent || '');
		return;
	}

	if (proposal.operation === 'delete') {
		const file = app.vault.getAbstractFileByPath(proposal.path);
		if (file) {
			await app.vault.trash(file, true);
		}
		return;
	}

	if (proposal.operation === 'move') {
		const file = app.vault.getAbstractFileByPath(proposal.path);
		if (file && proposal.newPath) {
			await app.fileManager.renameFile(file, proposal.newPath);
		}
		return;
	}

	const file = app.vault.getAbstractFileByPath(proposal.path);
	if (!file || !(file instanceof TFile)) {
		throw new Error(`File not found: ${proposal.path}`);
	}
	await app.vault.modify(file, proposal.proposedContent || '');
}
