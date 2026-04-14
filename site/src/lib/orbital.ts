// ==============================
// Constants
// ==============================
export const PI = Math.PI;
const a0 = 1; // Bohr radius (can scale visually)

// ==============================
// Factorial + helpers
// ==============================
function factorial(n: number): number {
	let res = 1;
	for (let i = 2; i <= n; i++) res *= i;
	return res;
}

// Associated Laguerre Polynomial L_k^alpha(x)
function laguerre(k: number, alpha: number, x: number): number {
	let sum = 0;
	for (let i = 0; i <= k; i++) {
		const coeff =
			Math.pow(-1, i) *
			factorial(k + alpha) /
			(factorial(k - i) * factorial(alpha + i) * factorial(i));
		sum += coeff * Math.pow(x, i);
	}
	return sum;
}

// ==============================
// Radial function R_nl(r)
// ==============================
export function radial(n: number, l: number, r: number): number {
	const rho = (2 * r) / (n * a0);

	const norm =
		Math.sqrt(
			Math.pow(2 / (n * a0), 3) *
			factorial(n - l - 1) /
			(2 * n * factorial(n + l))
		);

	return (
		norm *
		Math.exp(-rho / 2) *
		Math.pow(rho, l) *
		laguerre(n - l - 1, 2 * l + 1, rho)
	);
}

// ==============================
// Spherical Harmonics Y_l^m
// (Real-valued versions for rendering)
// ==============================

function legendre(l: number, m: number, x: number): number {
	if (m < 0 || m > l) return 0;

	let pmm = 1.0;
	if (m > 0) {
		const somx2 = Math.sqrt((1 - x) * (1 + x));
		let fact = 1.0;
		for (let i = 1; i <= m; i++) {
			pmm *= -fact * somx2;
			fact += 2.0;
		}
	}

	if (l === m) return pmm;

	let pmmp1 = x * (2 * m + 1) * pmm;
	if (l === m + 1) return pmmp1;

	let pll = 0;
	for (let ll = m + 2; ll <= l; ll++) {
		pll =
			((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) /
			(ll - m);
		pmm = pmmp1;
		pmmp1 = pll;
	}

	return pll;
}

export function sphericalHarmonic(
	l: number,
	m: number,
	theta: number,
	phi: number
): number {
	const absM = Math.abs(m);
	const norm =
		Math.sqrt(
			((2 * l + 1) / (4 * PI)) *
			factorial(l - absM) /
			factorial(l + absM)
		);

	const P = legendre(l, absM, Math.cos(theta));

	if (m > 0) {
		return Math.sqrt(2) * norm * P * Math.cos(m * phi);
	} else if (m < 0) {
		return Math.sqrt(2) * norm * P * Math.sin(absM * phi);
	} else {
		return norm * P;
	}
}

// ==============================
// Full wavefunction ψ
// ==============================
export function psi(
	n: number,
	l: number,
	m: number,
	r: number,
	theta: number,
	phi: number
): number {
	return radial(n, l, r) * sphericalHarmonic(l, m, theta, phi);
}

// ==============================
// Probability density |ψ|^2
// ==============================
export function probabilityDensity(
	n: number,
	l: number,
	m: number,
	r: number,
	theta: number,
	phi: number
): number {
	const val = psi(n, l, m, r, theta, phi);
	return val * val;
}

// ==============================
// Radial probability P(r)
// ==============================
export function radialProbability(
	n: number,
	l: number,
	r: number
): number {
	const R = radial(n, l, r);
	return r * r * R * R;
}
