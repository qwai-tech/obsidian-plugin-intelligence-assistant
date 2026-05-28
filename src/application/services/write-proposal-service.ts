import { App, TFile } from 'obsidian';
import type { AgentExecutionStep } from '@/types/common/reasoning';

export interface WriteProposal {
	type: 'write_proposal';
	operation: 'create' | 'update' | 'append';
	path: string;
	content: string;
	previousContent?: string;
	proposedContent: string;
	applied: false;
	reason: string;
}

export function createWriteProposal(input: {
	operation: WriteProposal['operation'];
	path: string;
	content: string;
	previousContent?: string;
	proposedContent?: string;
}): WriteProposal {
	return {
		type: 'write_proposal',
		operation: input.operation,
		path: input.path,
		content: input.content,
		previousContent: input.previousContent,
		proposedContent: input.proposedContent ?? input.content,
		applied: false,
		reason: 'Vault write was not applied. Review this proposal and explicitly confirm before making changes.',
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

export function extractWriteProposalsFromSteps(steps: AgentExecutionStep[] | undefined): WriteProposal[] {
	if (!steps?.length) return [];
	const proposals: WriteProposal[] = [];
	for (const step of steps) {
		const result = step.result ?? (step.type === 'observation' ? step.content : undefined);
		if (!result) continue;
		try {
			const parsed = JSON.parse(result) as unknown;
			if (isWriteProposal(parsed)) {
				proposals.push(parsed);
			}
		} catch {
			continue;
		}
	}
	return proposals;
}

export async function applyWriteProposal(app: App, proposal: WriteProposal): Promise<void> {
	if (proposal.operation === 'create') {
		const existing = app.vault.getAbstractFileByPath(proposal.path);
		if (existing) {
			throw new Error(`File already exists: ${proposal.path}`);
		}
		await app.vault.create(proposal.path, proposal.proposedContent);
		return;
	}

	const file = app.vault.getAbstractFileByPath(proposal.path);
	if (!file || !(file instanceof TFile)) {
		throw new Error(`File not found: ${proposal.path}`);
	}
	await app.vault.modify(file, proposal.proposedContent);
}
