import tourBohrOrbitalBasics from './definitions/bohr-orbital-basics.json';
import { TourSchema, type Tour, type TourStep } from './tour-schema';

export const loadedTours = [tourBohrOrbitalBasics].map((tourData) => TourSchema.parse(tourData));

export const toursById = new Map(loadedTours.map((tour) => [tour.id, tour]));

export const getTours = (): Tour[] => loadedTours;

export const getTourById = (tourId: string): Tour | undefined => toursById.get(tourId);

export const getTourStep = (tourId: string, stepId: string): TourStep | undefined => {
	const tour = getTourById(tourId);
	return tour?.steps.find((step) => step.id === stepId);
};

export const getNextTourStep = (tourId: string, stepId: string): TourStep | undefined => {
	const currentStep = getTourStep(tourId, stepId);
	if (!currentStep?.nextStepId) {
		return undefined;
	}

	return getTourStep(tourId, currentStep.nextStepId);
};

const formatGoalSummary = (goal: string): string =>
	goal
		.replace(/^User\s+/i, 'you ')
		.replace(/^user\s+/i, 'you ')
		.replace(/\.$/, '');

export const getTourCompletionMessage = (tourId: string): string => {
	const tour = getTourById(tourId);
	if (!tour) {
		return 'You completed this guided tour. You can keep chatting normally or start the lesson again.';
	}

	const summaryItems = tour.steps
		.map((step) => formatGoalSummary(step.judge.goal))
		.filter((goal, index, goals) => goals.indexOf(goal) === index)
		.map((goal) => `- ${goal}.`)
		.join('\n');

	return `You completed **${tour.title}**. You learned:\n${summaryItems}\n\nYou can keep chatting normally or start the lesson again.`;
};

export const getTourSummary = () =>
	loadedTours.map((tour) => ({
		id: tour.id,
		title: tour.title,
		description: tour.description
	}));
