import { Notice } from 'obsidian';
import type { Message } from '@/features/conversations';
import {
	extractWriteProposalsFromSteps,
	isBatchWriteProposal,
	isWriteProposal,
	type BatchWriteProposal,
	type WriteProposal,
} from '@/features/agent';
import { errorMessage } from '@/core/utils/errors';

export type ApplyProposal = (proposal: WriteProposal | BatchWriteProposal) => Promise<boolean>;

export function describeProposal(proposal: WriteProposal | BatchWriteProposal): string {
	if (isBatchWriteProposal(proposal)) {
		return `${proposal.proposals.length} changes: ${proposal.proposals.map(describeProposal).join(', ')}`;
	}
	return `${proposal.operation} ${proposal.path}`;
}

export function renderWriteProposalCards(container: HTMLElement, steps: Message['agentExecutionSteps'], apply?: ApplyProposal): void {
	const proposals = extractWriteProposalsFromSteps(steps);
	if (proposals.length === 0) return;

	const section = container.createDiv('ia-write-proposals');
	section.createEl('h5', { text: 'Write proposals' });
	for (const proposal of proposals) {
		if (isBatchWriteProposal(proposal)) {
			renderBatchCard(section, proposal, apply);
		} else if (isWriteProposal(proposal)) {
			renderSingleCard(section, proposal, apply);
		}
	}
}

function renderBatchCard(parent: HTMLElement, proposal: BatchWriteProposal, apply?: ApplyProposal): void {
	const card = parent.createDiv('ia-write-proposal-card is-batch');
	renderHeader(card, 'batch', `${proposal.proposals.length} changes`);
	card.createDiv({ cls: 'ia-write-proposal-card__note', text: proposal.reason });

	const list = card.createDiv('ia-write-proposal-card__batch-list');
	for (const sub of proposal.proposals) {
		const item = list.createDiv('ia-write-proposal-card__batch-item');
		item.createSpan({ cls: 'ia-write-proposal-card__batch-op', text: sub.operation });
		item.createSpan({ cls: 'ia-write-proposal-card__batch-path', text: sub.path });
	}
	renderApplyButton(card, 'Apply all', proposal, apply);
}

function renderSingleCard(parent: HTMLElement, proposal: WriteProposal, apply?: ApplyProposal): void {
	const card = parent.createDiv('ia-write-proposal-card');
	renderHeader(card, proposal.operation, proposal.path);
	card.createDiv({ cls: 'ia-write-proposal-card__note', text: proposal.reason });

	if (proposal.proposedContent) {
		const details = card.createEl('details', { cls: 'ia-write-proposal-card__preview' });
		details.createEl('summary', { text: 'Preview proposed content' });
		details.createEl('pre', { text: proposal.proposedContent });
	}
	renderApplyButton(card, 'Apply', proposal, apply);
}

function renderHeader(card: HTMLElement, operation: string, path: string): void {
	const header = card.createDiv('ia-write-proposal-card__header');
	header.createSpan({ cls: 'ia-write-proposal-card__operation', text: operation });
	header.createSpan({ cls: 'ia-write-proposal-card__path', text: path });
}

function renderApplyButton(card: HTMLElement, label: string, proposal: WriteProposal | BatchWriteProposal, apply?: ApplyProposal): void {
	const button = card.createDiv('ia-write-proposal-card__actions').createEl('button', { text: label });
	button.disabled = !apply;
	button.addEventListener('click', () => {
		if (!apply) return;
		button.disabled = true;
		apply(proposal).then((applied) => {
			if (!applied) {
				button.disabled = false;
				return;
			}
			button.setText('Applied');
			button.addClass('is-applied');
		}, (error: unknown) => {
			console.error('[WriteProposalCards] Failed to apply proposal', error);
			new Notice(errorMessage(error));
			button.disabled = false;
		});
	});
}
