import { Notice } from 'obsidian';
import type { Message } from '@/features/conversations';
import {
	isBatchWriteProposal,
	proposalCardsFromSteps,
	type BatchWriteProposal,
	type ProposalCard,
	type WriteProposal,
} from '@/features/agent';
import type { AgentExecutionStep } from '@/features/llm';
import { errorMessage } from '@/core/utils/errors';
import { t } from '@/i18n';

export type ApplyProposal = (proposal: WriteProposal | BatchWriteProposal, step: AgentExecutionStep) => Promise<boolean>;

export function describeProposal(proposal: WriteProposal | BatchWriteProposal): string {
	if (isBatchWriteProposal(proposal)) {
		return `${t('chat.proposals.changes', { count: proposal.proposals.length })}: ${proposal.proposals.map(describeProposal).join(', ')}`;
	}
	return `${operationLabel(proposal.operation)} ${proposal.path}`;
}

export function renderWriteProposalCards(container: HTMLElement, steps: Message['agentExecutionSteps'], apply?: ApplyProposal): void {
	const cards = proposalCardsFromSteps(steps);
	if (cards.length === 0) return;

	const section = container.createDiv('ia-write-proposals');
	section.createEl('h5', { text: t('chat.proposals.title') });
	for (const card of cards) {
		if (isBatchWriteProposal(card.proposal)) {
			renderBatchCard(section, card.proposal, card, apply);
		} else {
			renderSingleCard(section, card.proposal, card, apply);
		}
	}
}

function renderBatchCard(parent: HTMLElement, proposal: BatchWriteProposal, card: ProposalCard, apply?: ApplyProposal): void {
	const element = parent.createDiv('ia-write-proposal-card is-batch');
	renderHeader(element, t('chat.proposals.operations.batch'), t('chat.proposals.changes', { count: proposal.proposals.length }));
	element.createDiv({ cls: 'ia-write-proposal-card__note', text: proposal.reason });

	const list = element.createDiv('ia-write-proposal-card__batch-list');
	for (const sub of proposal.proposals) {
		const item = list.createDiv('ia-write-proposal-card__batch-item');
		item.createSpan({ cls: 'ia-write-proposal-card__batch-op', text: operationLabel(sub.operation) });
		item.createSpan({ cls: 'ia-write-proposal-card__batch-path', text: sub.path });
	}
	renderApplyButton(element, t('chat.proposals.applyAll'), card, apply);
}

function renderSingleCard(parent: HTMLElement, proposal: WriteProposal, card: ProposalCard, apply?: ApplyProposal): void {
	const element = parent.createDiv('ia-write-proposal-card');
	renderHeader(element, operationLabel(proposal.operation), proposal.path);
	element.createDiv({ cls: 'ia-write-proposal-card__note', text: proposal.reason });

	if (proposal.proposedContent) {
		const details = element.createEl('details', { cls: 'ia-write-proposal-card__preview' });
		details.createEl('summary', { text: t('chat.proposals.preview') });
		details.createEl('pre', { text: proposal.proposedContent });
	}
	renderApplyButton(element, t('chat.proposals.apply'), card, apply);
}

function renderHeader(element: HTMLElement, operation: string, path: string): void {
	const header = element.createDiv('ia-write-proposal-card__header');
	header.createSpan({ cls: 'ia-write-proposal-card__operation', text: operation });
	header.createSpan({ cls: 'ia-write-proposal-card__path', text: path });
}

function renderApplyButton(element: HTMLElement, label: string, card: ProposalCard, apply?: ApplyProposal): void {
	const button = element.createDiv('ia-write-proposal-card__actions').createEl('button', { text: label });
	const showApplied = () => {
		button.disabled = true;
		button.setText(t('chat.proposals.applied'));
		button.addClass('is-applied');
	};
	if (card.step.proposalApplied) {
		showApplied();
		return;
	}
	button.disabled = !apply;
	button.addEventListener('click', () => {
		if (!apply) return;
		button.disabled = true;
		apply(card.proposal, card.step).then((applied) => {
			if (!applied) {
				button.disabled = false;
				return;
			}
			showApplied();
		}, (error: unknown) => {
			console.error('[WriteProposalCards] Failed to apply proposal', error);
			new Notice(errorMessage(error));
			button.disabled = false;
		});
	});
}

function operationLabel(operation: WriteProposal['operation']): string {
	return t(`chat.proposals.operations.${operation}`);
}
