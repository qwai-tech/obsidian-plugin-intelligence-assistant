import { TFile } from 'obsidian';
import type { App } from 'obsidian';

/** Map-backed vault store: path -> file content. */
export class InMemoryVault {
  private readonly files = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(seed)) {
      this.files.set(path, content);
    }
  }

  private makeTFile(path: string): TFile {
    const file = new TFile();
    file.path = path;
    file.name = path.split('/').pop() ?? path;
    const dot = file.name.lastIndexOf('.');
    file.extension = dot >= 0 ? file.name.slice(dot + 1) : '';
    file.basename = dot >= 0 ? file.name.slice(0, dot) : file.name;
    return file;
  }

  getAbstractFileByPath(path: string): TFile | null {
    return this.files.has(path) ? this.makeTFile(path) : null;
  }

  async read(file: TFile): Promise<string> {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`File not found: ${file.path}`);
    return content;
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
    this.files.set(path, content);
    return this.makeTFile(path);
  }

  async modify(file: TFile, content: string): Promise<void> {
    if (!this.files.has(file.path)) throw new Error(`File not found: ${file.path}`);
    this.files.set(file.path, content);
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const content = this.files.get(oldPath);
    if (content === undefined) throw new Error(`File not found: ${oldPath}`);
    this.files.delete(oldPath);
    this.files.set(newPath, content);
  }

  /** Folders are not tracked; a no-op keeps proposal-apply code happy. */
  async createFolder(_path: string): Promise<void> {
    return undefined;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.keys()]
      .filter((p) => p.endsWith('.md'))
      .map((p) => this.makeTFile(p));
  }

  getFiles(): TFile[] {
    return [...this.files.keys()].map((p) => this.makeTFile(p));
  }

  // Adapter surface used by tools/persistence.
  readonly adapter = {
    exists: async (path: string): Promise<boolean> => this.files.has(path),
    read: async (path: string): Promise<string> => {
      const content = this.files.get(path);
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    write: async (path: string, content: string): Promise<void> => {
      this.files.set(path, content);
    },
    mkdir: async (): Promise<void> => undefined,
    list: async (path: string): Promise<{ files: string[]; folders: string[] }> => {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const files = [...this.files.keys()].filter((p) => p.startsWith(prefix));
      return { files, folders: [] };
    },
    remove: async (path: string): Promise<void> => {
      this.files.delete(path);
    },
  };

  /** Test-only inspector for the side-effect oracle. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files);
  }
}

export interface HarnessApp extends App {
  __vault: InMemoryVault;
}

/** Build an `App`-shaped object the real tools and services can use headless. */
export function createHarnessApp(seed: Record<string, string> = {}): HarnessApp {
  const vault = new InMemoryVault(seed);
  const app = {
    vault,
    metadataCache: {
      getFileCache: () => null,
      getFirstLinkpathDest: (linkpath: string): TFile | null =>
        vault.getAbstractFileByPath(linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`),
    },
    workspace: {
      getActiveFile: () => null,
      getLeavesOfType: () => [],
      onLayoutReady: (cb: () => void) => cb(),
    },
    fileManager: {
      trashFile: async (file: { path: string }): Promise<void> => vault.delete(file.path),
      renameFile: async (file: { path: string }, newPath: string): Promise<void> =>
        vault.rename(file.path, newPath),
      // Vault-correct link generator: wikilink by basename, with optional
      // #subpath and |alias. Mirrors the obsidian mock's behaviour.
      generateMarkdownLink: (
        file: TFile,
        _sourcePath: string,
        subpath?: string,
        alias?: string,
      ): string => {
        const base = file.basename || file.name;
        const target = subpath ? `${base}${subpath}` : base;
        return alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
      },
    },
  } as unknown as HarnessApp;
  app.__vault = vault;
  return app;
}
