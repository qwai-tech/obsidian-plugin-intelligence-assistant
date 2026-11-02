import * as fs from 'fs';
import * as path from 'path';

const LOCALES = path.join(__dirname, '../../i18n/locales');

describe('grading threshold descriptions', () => {
	it.each(fs.readdirSync(LOCALES))('%s describes the 0-10 scale the grader scores on', (file) => {
		const grading = (JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8')) as { settings: { rag: { grading: Record<string, { desc: string }> } } }).settings.rag.grading;

		for (const key of ['minRelevance', 'minAccuracy', 'minSupport']) {
			expect(grading[key].desc).toMatch(/[0০][-–~〜]\s*(10|১০)/);
		}
	});
});
