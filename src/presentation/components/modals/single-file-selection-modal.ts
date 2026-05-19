import { App, TFile, Modal } from 'obsidian';

export class SingleFileSelectionModal extends Modal {
	private onChooseFile: (file: TFile | null) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allFiles: TFile[];
	private selectedFile: TFile | null = null;

	constructor(app: App, onChooseFile: (file: TFile | null) => void) {
		super(app);
		this.onChooseFile = onChooseFile;

		const files = app.vault.getFiles();
		this.allFiles = files.filter(f => f.extension === "md");
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("single-file-selection-modal");

		contentEl.createEl("h2", { text: "Insert to note" });

		this.searchInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Search notes..."
		});
		this.searchInput.addClass('ia-modal-search-input');

		this.resultsContainer = contentEl.createDiv('ia-modal-results');

		this.displayFiles(this.allFiles);

		this.searchInput.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			const filteredFiles = this.allFiles.filter(file =>
				file.path.toLowerCase().includes(query)
			);
			this.displayFiles(filteredFiles);
		});

		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && this.selectedFile) {
				this.close();
				this.onChooseFile(this.selectedFile);
			}
		});

		const buttonContainer = contentEl.createDiv('ia-modal-btn-row--end');

		const insertButton = buttonContainer.createEl("button", { text: "Insert to selected note" });
		insertButton.addClass("mod-cta");
		insertButton.addEventListener("click", () => {
			this.close();
			this.onChooseFile(this.selectedFile);
		});

		const newNoteButton = buttonContainer.createEl("button", { text: "Create new note" });
		newNoteButton.addClass('ia-mr-10');
		newNoteButton.addEventListener("click", () => {
			this.close();
			this.onChooseFile(null);
		});
	}

	private displayFiles(files: TFile[]) {
		this.resultsContainer.empty();

		if (files.length === 0) {
			this.resultsContainer.createDiv({ text: "No matching notes found." });
			return;
		}

		files.forEach(file => {
			const fileEl = this.resultsContainer.createDiv("file-item ia-modal-list-item");
			fileEl.addClass('ia-clickable');

			if (this.selectedFile && this.selectedFile.path === file.path) {
				fileEl.addClass('ia-modal-item--selected');
			}

			const iconEl = fileEl.createDiv('ia-modal-list-icon');
			iconEl.setText("📄");

			const textEl = fileEl.createDiv('ia-flex-1');
			textEl.setText(file.path);

			fileEl.addEventListener("click", () => {
				this.selectedFile = file;
				this.updateDisplay();
			});
		});
	}

	private updateDisplay() {
		const query = this.searchInput.value.toLowerCase();
		const currentFiles = this.allFiles.filter(file =>
			file.path.toLowerCase().includes(query)
		);
		this.displayFiles(currentFiles);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
