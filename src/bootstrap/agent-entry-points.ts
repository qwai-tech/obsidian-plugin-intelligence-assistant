import { notify } from '@/core/notifications';
import { TFile, TFolder, type App, type Editor, type MarkdownView, type Plugin } from 'obsidian';
import { t } from '@/i18n';
import {
	buildAskCurrentNotePrompt,
	buildBacklinkTagDoctorPrompt,
	buildDuplicateMergePrompt,
	buildImproveSelectionPrompt,
	buildOrganizeCurrentNotePrompt,
	buildOrganizeFolderPrompt,
	buildProjectBriefPrompt,
	buildRelatedNotesPrompt,
	buildResearchBriefPrompt,
	buildSourceGroundedQuestionPrompt,
	buildSummarizeCurrentNotePrompt,
	buildSummarizeFilePrompt,
	buildVaultDiagnosisPrompt,
	buildWeeklyReviewPrompt,
	buildWritingDraftPrompt,
} from '@/features/agent';
import type { AgentTaskLauncher } from '@/ui/views/agent-task-launcher';

export function registerAgentEntryPoints(plugin: Plugin, launcher: AgentTaskLauncher): void {
	plugin.addCommand({
		id: 'ask-agent-current-note',
		name: t('commands.askAgentCurrentNote'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToAsk'));
				return;
			}
			await launcher.launch(
				buildAskCurrentNotePrompt(file.path, 'What should I understand or do next?'),
				[file],
				t('chat.modals.agentTask.title')
			);
		}
	});

	plugin.addCommand({
		id: 'summarize-current-note-agent',
		name: t('commands.summarizeCurrentNote'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToSummarize'));
				return;
			}
			await launcher.launch(buildSummarizeCurrentNotePrompt(file.path), [file]);
		}
	});

	plugin.addCommand({
		id: 'organize-current-note-agent',
		name: t('commands.organizeCurrentNote'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToOrganize'));
				return;
			}
			await launcher.launch(buildOrganizeCurrentNotePrompt(file.path), [file]);
		}
	});

	plugin.addCommand({
		id: 'source-grounded-question-agent',
		name: t('commands.sourceGroundedQuestion'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			await launcher.launch(
				buildSourceGroundedQuestionPrompt('What do my notes say about this?', file?.path),
				file ? [file] : [],
				t('commands.sourceGroundedQuestion')
			);
		}
	});

	plugin.addCommand({
		id: 'create-project-brief-agent',
		name: t('commands.createProjectBrief'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openProjectNote'));
				return;
			}
			await launcher.launch(buildProjectBriefPrompt(file.path), [file]);
		}
	});

	plugin.addCommand({
		id: 'create-research-brief-agent',
		name: t('commands.createResearchBrief'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToResearch'));
				return;
			}
			await launcher.launch(
				buildResearchBriefPrompt(file.path, 'What are the key conclusions and open questions?'),
				[file],
				t('commands.createResearchBrief')
			);
		}
	});

	plugin.addCommand({
		id: 'generate-weekly-review-agent',
		name: t('commands.generateWeeklyReview'),
		callback: async () => {
			await launcher.launch(
				buildWeeklyReviewPrompt('this week'),
				[],
				t('commands.generateWeeklyReview')
			);
		}
	});

	plugin.addCommand({
		id: 'find-related-notes-agent',
		name: t('commands.findRelatedNotes'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToFindRelated'));
				return;
			}
			await launcher.launch(buildRelatedNotesPrompt(file.path), [file]);
		}
	});

	plugin.addCommand({
		id: 'find-duplicate-notes-agent',
		name: t('commands.findDuplicateNotes'),
		callback: async () => {
			await launcher.launch(buildDuplicateMergePrompt());
		}
	});

	plugin.addCommand({
		id: 'doctor-links-tags-agent',
		name: t('commands.doctorLinksTags'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToImproveLinks'));
				return;
			}
			await launcher.launch(buildBacklinkTagDoctorPrompt(file.path), [file]);
		}
	});

	plugin.addCommand({
		id: 'draft-from-note-agent',
		name: t('commands.draftFromNote'),
		callback: async () => {
			const file = activeMarkdownFile(plugin.app);
			if (!file) {
				notify(t('commands.notices.openNoteToDraft'));
				return;
			}
			await launcher.launch(
				buildWritingDraftPrompt(file.path, 'Write a clear draft for a knowledgeable reader.'),
				[file],
				t('commands.draftFromNote')
			);
		}
	});

	plugin.addCommand({
		id: 'diagnose-vault-agent',
		name: t('commands.diagnoseVault'),
		callback: async () => {
			await launcher.launch(buildVaultDiagnosisPrompt());
		}
	});

	plugin.addCommand({
		id: 'improve-selection-agent',
		name: t('commands.improveSelection'),
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selection = editor.getSelection();
			if (!selection.trim()) {
				notify(t('commands.notices.selectTextToImprove'));
				return;
			}
			const file = view.file ?? activeMarkdownFile(plugin.app);
			await launcher.launch(
				buildImproveSelectionPrompt(selection, file?.path),
				file ? [file] : []
			);
		}
	});

	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (file instanceof TFile) {
				menu.addSeparator();
				menu.addItem(item => item
					.setTitle(t('contextMenu.askAgent'))
					.setIcon('bot')
					.onClick(() => {
						void launcher.launch(
							buildAskCurrentNotePrompt(file.path, 'What should I understand or do next?'),
							[file],
							t('contextMenu.askAgent')
						);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.summarize'))
					.setIcon('list-collapse')
					.onClick(() => {
						void launcher.launch(buildSummarizeFilePrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.createProjectBrief'))
					.setIcon('clipboard-list')
					.onClick(() => {
						void launcher.launch(buildProjectBriefPrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.createResearchBrief'))
					.setIcon('book-open-text')
					.onClick(() => {
						void launcher.launch(
							buildResearchBriefPrompt(file.path, 'What are the key conclusions and open questions?'),
							[file],
							t('contextMenu.createResearchBrief')
						);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.findRelatedNotes'))
					.setIcon('network')
					.onClick(() => {
						void launcher.launch(buildRelatedNotesPrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.doctorLinksTags'))
					.setIcon('tags')
					.onClick(() => {
						void launcher.launch(buildBacklinkTagDoctorPrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.draftFromFile'))
					.setIcon('pen-line')
					.onClick(() => {
						void launcher.launch(
							buildWritingDraftPrompt(file.path, 'Write a clear draft for a knowledgeable reader.'),
							[file],
							t('contextMenu.draftFromFile')
						);
					}));
				return;
			}

			if (file instanceof TFolder) {
				menu.addSeparator();
				menu.addItem(item => item
					.setTitle(t('contextMenu.organizeFolder'))
					.setIcon('folder-tree')
					.onClick(() => {
						void launcher.launch(buildOrganizeFolderPrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.createProjectBrief'))
					.setIcon('clipboard-list')
					.onClick(() => {
						void launcher.launch(buildProjectBriefPrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.createResearchBrief'))
					.setIcon('book-open-text')
					.onClick(() => {
						void launcher.launch(
							buildResearchBriefPrompt(file.path, 'What are the key conclusions and open questions?'),
							[file],
							t('contextMenu.createResearchBrief')
						);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.findDuplicates'))
					.setIcon('git-merge')
					.onClick(() => {
						void launcher.launch(buildDuplicateMergePrompt(file.path), [file]);
					}));
				menu.addItem(item => item
					.setTitle(t('contextMenu.improveFolder'))
					.setIcon('tags')
					.onClick(() => {
						void launcher.launch(buildBacklinkTagDoctorPrompt(file.path), [file]);
					}));
			}
		})
	);

}

function activeMarkdownFile(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	return file instanceof TFile ? file : null;
}
