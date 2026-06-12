import { TFile } from 'obsidian';
import { createHarnessApp } from './in-memory-vault';

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
});
