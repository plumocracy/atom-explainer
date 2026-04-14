export type vector3 = {
	x: number,
	y: number,
	z: number,
}


/** returns the difference between two vector3's */
export function subtractV3(a: vector3, b: vector3): vector3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}


export function addV3(a: vector3, b: vector3): vector3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}


/** Returns the cross product of two vector3's */
export function cross(a: vector3, b: vector3): vector3 {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	};
}

/** returns the dot product of two vector3's */
export function dot(a: vector3, b: vector3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z!;
}

/** Returns a normalized vector3 */
export function normalize(v: vector3): vector3 {
	const l = Math.hypot(v.x, v.y, v.z);
	return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** */
export function perspective(fov: number, aspect: number, near: number, far: number) {
	const f = 1 / Math.tan(fov / 2);

	// prettier-ignore
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (far + near) / (near - far), -1,
		0, 0, (2 * far * near) / (near - far), 0
	]);
}

/** */
export function lookAt(eye: vector3, center: vector3, up: vector3) {
	const z = normalize(subtractV3(eye, center));
	const x = normalize(cross(up, z));
	const y = cross(z, x);

	// prettier-ignore
	return new Float32Array([
		x.x, y.x, z.x, 0,
		x.y, y.y, z.y, 0,
		x.z, y.z, z.z, 0,
		-dot(x, eye), -dot(y, eye), -dot(z, eye), 1
	]);
}
