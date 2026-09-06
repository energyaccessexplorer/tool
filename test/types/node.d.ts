// Minimal ambient types for the node builtins the unit tests use.
// Hand-rolled on purpose: no @types/node dependency (deps come from the
// flake only). Grow as tests need more surface.

declare module 'node:test' {
	export function describe(name: string, fn: () => void): void;
	export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
	interface Assert {
		equal(actual: unknown, expected: unknown, message?: string): void;
		deepEqual(actual: unknown, expected: unknown, message?: string): void;
		ok(value: unknown, message?: string): void;
		fail(message?: string): void;
	}
	const assert: Assert;
	export default assert;
}
