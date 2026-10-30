import { groupByDate } from '@/ui/chat/conversation-list-view';

const at = (iso: string) => new Date(iso).getTime();
const conv = (id: string, updatedAt: number) => ({ id, title: id, createdAt: updatedAt, updatedAt });

describe('groupByDate', () => {
	it('sorts conversations into today, yesterday, earlier this week and older, leaving out empty groups', () => {
		const now = new Date('2026-10-29T15:00:00');

		const groups = groupByDate([
			conv('now', at('2026-10-29T09:00:00')),
			conv('monday', at('2026-10-26T12:00:00')),
			conv('last-month', at('2026-09-01T12:00:00')),
		], now);

		expect(groups.map(group => [group.group, group.conversations.map(c => c.id)])).toEqual([
			['today', ['now']],
			['thisWeek', ['monday']],
			['older', ['last-month']],
		]);
	});
});
