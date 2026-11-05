import type { AgentExecutionStep } from '@/features/llm';

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

export interface ProposalCard {
	proposal: WriteProposal | BatchWriteProposal;
	step: AgentExecutionStep;
}

export function proposalCardsFromSteps(steps: AgentExecutionStep[] | undefined): ProposalCard[] {
	return (steps ?? []).flatMap(step => {
		const proposal = parseProposal(step.result ?? (step.type === 'observation' ? step.content : undefined));
		return proposal ? [{ proposal, step }] : [];
	});
}

function parseProposal(result: string | undefined): WriteProposal | BatchWriteProposal | null {
	if (!result) return null;
	try {
		const parsed = JSON.parse(result) as unknown;
		return isWriteProposal(parsed) || isBatchWriteProposal(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
