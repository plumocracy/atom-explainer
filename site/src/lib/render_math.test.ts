import { expect, test, beforeEach, describe } from "vitest";
import { type vector3, subtractV3, addV3, cross, dot, normalize, perspective, lookAt } from "./render_math";




describe.concurrent('vector math', () => {
	let v1: vector3, v2: vector3;

	beforeEach(() => {
		v1 = { x: 3, y: 1, z: 4 }
		v2 = { x: 4, y: 1, z: 3 }
	})

	test("test vector3 subtract", () => {
		expect(subtractV3(v1, v2)).toEqual({ x: -1, y: 0, z: 1 } as vector3)
	})

	test("test vector3 add", () => {
		expect(addV3(v1, v2)).toEqual({ x: 7, y: 2, z: 7 } as vector3)
	})

	test("test vector3 cross", () => {
		expect(cross(v1, v2)).toEqual({ x: -1, y: 7, z: -1 } as vector3)
	})

	test("test vector3 normalize", () => {
		const { x, y, z } = normalize(v1);
		expect(x).toBeCloseTo(0.6, 1);
		expect(y).toBeCloseTo(0.1, 0);
		expect(z).toBeCloseTo(0.8, 1);
	})


	test("test vector3 dot", () => {
		expect(dot(v1, v2)).toBe(25)
	})
})
