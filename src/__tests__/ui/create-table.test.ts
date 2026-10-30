import { createTable } from '@/ui/utils/ui-helpers';

describe('createTable', () => {
	it('right-aligns the headers of trailing numeric columns, like their cells', () => {
		const table = createTable(document.createElement('div'), ['Model', 'Prompt', 'Total'], { numericColumns: 2 });

		const aligned = [...table.querySelectorAll('th')].map(th => th.classList.contains('ia-table-cell--right'));

		expect(aligned).toEqual([false, true, true]);
	});
});
