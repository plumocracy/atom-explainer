import { describe, expect, test } from 'vitest';
import {
	getNextTourStep,
	getTourById,
	getTourCompletionMessage,
	getTours,
	getTourStep,
	getTourSummary,
	loadedTours,
	toursById
} from './tours';

describe('tours registry', () => {
	test('loaded tours and index map are in sync', () => {
		expect(loadedTours.length).toBeGreaterThan(0);
		expect(toursById.size).toBe(loadedTours.length);
	});

	test('getTours/getTourById/getTourSummary return expected structures', () => {
		const tours = getTours();
		const first = tours[0];
		expect(getTourById(first.id)?.id).toBe(first.id);
		expect(getTourSummary()[0]).toMatchObject({ id: first.id, title: first.title });
	});

	test('getTourStep and getNextTourStep resolve valid ids', () => {
		const tour = getTours()[0];
		const step = tour.steps[0];
		expect(getTourStep(tour.id, step.id)?.id).toBe(step.id);
		if (step.nextStepId) {
			expect(getNextTourStep(tour.id, step.id)?.id).toBe(step.nextStepId);
		}
	});

	test('getTourCompletionMessage summarizes learned ideas', () => {
		const tour = getTours()[0];
		expect(getTourCompletionMessage(tour.id)).toContain(`You completed **${tour.title}**`);
		expect(getTourCompletionMessage(tour.id)).toContain('You learned:');
	});
});
