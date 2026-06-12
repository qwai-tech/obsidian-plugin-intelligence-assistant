import { TFile } from 'obsidian';
import { createHarnessApp, InMemoryVault } from './in-memory-vault';

describe('in-memory harness vault', () => {
  it('seeds, reads, creates, modifies, and lists files', async () => {
    const app = createHarnessApp({ 'notes/a.md': 'hello' });

    const a = app.vault.getAbstractFileByPath('notes/a.md');
    expect(a).toBeInstanceOf(TFile);
    expect(await app.vault.read(a as TFile)).toBe('hello');

    await app.vault.create('notes/b.md', 'world');
    expect(await app.vault.adapter.exists('notes/b.md')).toBe(true);

    const b = app.vault.getAbstractFileByPath('notes/b.md') as TFile;
    await app.vault.modify(b, 'world!!');
    expect(await app.vault.read(b)).toBe('world!!');

    const md = app.vault.getMarkdownFiles().map((f) => f.path).sort();
    expect(md).toEqual(['notes/a.md', 'notes/b.md']);
  });

  it('create on an existing path rejects', async () => {
    const vault = new InMemoryVault({ 'notes/a.md': 'hello' });
    await expect(vault.create('notes/a.md', 'new content')).rejects.toThrow('File already exists: notes/a.md');
  });

  it('read on a missing path rejects', async () => {
    const vault = new InMemoryVault();
    const file = new TFile();
    file.path = 'missing.md';
    await expect(vault.read(file)).rejects.toThrow('File not found: missing.md');
  });

  it('modify on a missing path rejects', async () => {
    const vault = new InMemoryVault();
    const file = new TFile();
    file.path = 'missing.md';
    await expect(vault.modify(file, 'content')).rejects.toThrow('File not found: missing.md');
  });

  it('delete removes a file from the snapshot', async () => {
    const vault = new InMemoryVault({ 'notes/a.md': 'hello' });
    await vault.delete('notes/a.md');
    expect(vault.snapshot()).not.toHaveProperty('notes/a.md');
  });

  it('rename moves content from old path to new path', async () => {
    const vault = new InMemoryVault({ 'notes/old.md': 'content' });
    await vault.rename('notes/old.md', 'notes/new.md');
    const snap = vault.snapshot();
    expect(snap).not.toHaveProperty('notes/old.md');
    expect(snap['notes/new.md']).toBe('content');
  });

  it('rename on a missing path rejects', async () => {
    const vault = new InMemoryVault();
    await expect(vault.rename('missing.md', 'new.md')).rejects.toThrow('File not found: missing.md');
  });

  it('fileManager.trashFile removes the file from the vault', async () => {
    const app = createHarnessApp({ 'notes/a.md': 'hello' });
    const file = Object.assign(new TFile(), { path: 'notes/a.md' });
    await app.fileManager.trashFile(file);
    expect(app.__vault.snapshot()).not.toHaveProperty('notes/a.md');
  });

  it('fileManager.renameFile moves the file in the vault', async () => {
    const app = createHarnessApp({ 'notes/old.md': 'content' });
    const file = Object.assign(new TFile(), { path: 'notes/old.md' });
    await app.fileManager.renameFile(file, 'notes/new.md');
    const snap = app.__vault.snapshot();
    expect(snap).not.toHaveProperty('notes/old.md');
    expect(snap['notes/new.md']).toBe('content');
  });

  it('createFolder is a no-op that resolves', async () => {
    const vault = new InMemoryVault();
    await expect(vault.createFolder('some/folder')).resolves.toBeUndefined();
  });

  it('adapter.remove removes the file from the map', async () => {
    const vault = new InMemoryVault({ 'notes/a.md': 'hello' });
    await vault.adapter.remove('notes/a.md');
    expect(vault.snapshot()).not.toHaveProperty('notes/a.md');
  });
});
