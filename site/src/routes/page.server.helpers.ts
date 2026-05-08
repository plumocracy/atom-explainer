export const parseSimulationValues = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
) => {
	if (toolName !== 'set_simulation_params' && toolName !== 'set_simulation_values') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { n?: unknown; l?: unknown; m?: unknown };
	if (
		typeof values.n === 'number' &&
		typeof values.l === 'number' &&
		typeof values.m === 'number'
	) {
		return {
			n: values.n,
			l: values.l,
			m: values.m
		};
	}

	return undefined;
};

export const parseCameraTarget = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
) => {
	if (toolName !== 'move_camera_to_point') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { x?: unknown; y?: unknown; z?: unknown; durationMs?: unknown };
	if (
		typeof values.x === 'number' &&
		typeof values.y === 'number' &&
		typeof values.z === 'number'
	) {
		return {
			x: values.x,
			y: values.y,
			z: values.z,
			durationMs: typeof values.durationMs === 'number' ? values.durationMs : undefined
		};
	}

	return undefined;
};

export const parseCrossSectionHidden = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
) => {
	if (toolName !== 'toggle_positive_xy_cross_section') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { hidden?: unknown };
	return typeof values.hidden === 'boolean' ? values.hidden : undefined;
};

export const parseVisualizationMode = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
) => {
	if (toolName !== 'set_visualization_mode') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { mode?: unknown };
	return values.mode === 'orbital' || values.mode === 'bohr' ? values.mode : undefined;
};

export const parseAtomicNumber = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
) => {
	if (toolName !== 'set_bohr_atomic_number') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { atomicNumber?: unknown };
	return typeof values.atomicNumber === 'number' ? values.atomicNumber : undefined;
};

export const parseVisualizationAttachment = (toolName: string) => {
	if (toolName === 'insert_standing_wave_visualization') {
		return { type: 'standing_wave' as const };
	}

	return undefined;
};

export const isMobileRequest = (headers: Headers): boolean => {
	const chMobile = headers.get('sec-ch-ua-mobile');
	if (chMobile === '?1') {
		return true;
	}

	const userAgent = headers.get('user-agent')?.toLowerCase() ?? '';
	return /android|iphone|ipad|ipod|mobile|webos|blackberry|windows phone/.test(userAgent);
};
