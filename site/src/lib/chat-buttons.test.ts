import { describe, expect, test } from 'vitest';
import { parseCreateButtons } from './chat-buttons';

describe('parseCreateButtons', () => {
	test('parses create_button payloads', () => {
		expect(
			parseCreateButtons(
				'create_button',
				{ buttons: [{ label: '2p', simulationValues: { n: 2, l: 1, m: 0 } }] },
				''
			)
		).toEqual([{ label: '2p', simulationValues: { n: 2, l: 1, m: 0 } }]);
	});

	test('parses create_toggle_button cross-section payloads', () => {
		expect(
			parseCreateButtons(
				'create_toggle_button',
				{
					toggleType: 'positive_xy_cross_section',
					labelWhenVisible: 'Hide slice',
					labelWhenHidden: 'Show slice'
				},
				''
			)
		).toEqual([
			{
				toggleButton: {
					toggleType: 'positive_xy_cross_section',
					labelWhenVisible: 'Hide slice',
					labelWhenHidden: 'Show slice'
				}
			}
		]);
	});

	test('parses create_toggle_button visualization payloads', () => {
		expect(
			parseCreateButtons(
				'create_toggle_button',
				{
					toggleType: 'visualization_mode',
					labelWhenOrbital: 'Switch to Bohr',
					labelWhenBohr: 'Switch to Orbital'
				},
				''
			)
		).toEqual([
			{
				toggleButton: {
					toggleType: 'visualization_mode',
					labelWhenOrbital: 'Switch to Bohr',
					labelWhenBohr: 'Switch to Orbital'
				}
			}
		]);
	});
});
