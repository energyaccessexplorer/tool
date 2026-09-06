// Ambient declarations for the app-wide legacy globals that TypeScript
// modules touch. Deliberately minimal: declare only what the TS code uses,
// and grow as more modules are ported. JS modules keep using these globals
// unchecked (checkJs is off). This file has no imports/exports on purpose:
// it stays a global script so the declarations are ambient.

/** Raster payload shape shared by OUTLINE, GEOGRAPHY.divisions[*] and datasets. */
interface RasterLike {
	readonly data: ArrayLike<number>;
	readonly nodata: number;
}

declare const STATE: {
	readonly datasets: unknown[];
	readonly variant: string;
};

declare const GEOGRAPHY: {
	readonly divisions?: Record<string, { readonly raster?: RasterLike } | undefined>;
};

declare const OUTLINE: { readonly raster?: RasterLike } | undefined;

/** Dataset registry by id (analysis.js). */
declare const DST: ReadonlyMap<string, unknown>;

interface Window {
	LOCALE: string;
}
