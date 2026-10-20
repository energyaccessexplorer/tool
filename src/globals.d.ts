// Ambient declarations for the app-wide legacy globals that TypeScript
// modules touch. Deliberately minimal: declare only what the TS code uses,
// and grow as more modules are ported. JS modules keep using these globals
// unchecked (checkJs is off). This file has no imports/exports on purpose:
// it stays a global script so the declarations are ambient.

/** Raster payload shape shared by OUTLINE, GEOGRAPHY.divisions[*] and datasets.
 * The concrete containers the folds walk (arrays or typed arrays). */
type RasterData = number[] | Float32Array | Int32Array;

interface RasterLike {
	readonly data: RasterData;
	readonly nodata: number;
	readonly width: number;
	readonly height: number;
}

declare const STATE: {
	readonly datasets: unknown[];
	readonly variant: string;
	/** Currently selected index id ('eai', 'demand', 'supply', 'ani', ...). */
	readonly index: string;
	/** "Change geography" division tier run() filters cells with (0 = whole
	 * geography). */
	readonly divtier: number;

	/** "Change geography" area id within divisions[divtier]; run() filters to
	 * it when numeric. */
	readonly subdiv: unknown;

	/**
	 * Legacy per-geography selected Date (timeline.js). The EAE-297 year
	 * control writes the selected GEOGRAPHY.timeline_dates entry here to
	 * keep the legacy graphs in sync; state_set accepts date-parseables.
	 */
	timeline: unknown;
};

declare const GEOGRAPHY: {
	/** Selected geography's display name (the Data tab's title and the
	 * whole-geography clause of the card sentences name it). */
	readonly name: string;

	/** [west, south, east, north] — the GeoTIFF metadata anchors on it. */
	readonly envelope: readonly [number, number, number, number];

	/** Geography id (uuid) — the result inputs fingerprint keys on it. */
	readonly id?: string;

	readonly divisions?: Record<string, {
		readonly name?: string;
		readonly raster: RasterLike;
		readonly vectors?: {
			readonly data?: {
				readonly features?: readonly { readonly id: string | number }[];
			};
		};
		/** Area-id -> display name table. */
		readonly csv?: { readonly table?: Record<string, string> };
	} | undefined>;

	/** ISO date strings for timeline-enabled geographies (EAE-297). */
	readonly timeline_dates?: readonly string[];
};

declare const OUTLINE: { readonly raster: RasterLike } | undefined;

/** Dataset registry by id (analysis.js). */
declare const DST: ReadonlyMap<string, unknown>;

/** The mapbox GL wrapper app code paints through (mapbox.js). */
declare const MAPBOX: {
	getSource(id: string): {
		readonly _data?: {
			features?: Array<{ id?: string | number; properties: Record<string, unknown> }>;
		};
		setData(data: unknown): void;
		play: () => void;
		pause: () => void;
		raster?: unknown;
	} | null;
	getLayer?(id: string): unknown;
};

/** The GeoTIFF writer the report's analysis export uses (loaded as a lib). */
declare const GeoTIFF: {
	writeArrayBuffer(arr: Uint8Array, metadata: Record<string, unknown>): Promise<ArrayBuffer>;
};

/** App configuration namespace (built into main.js at build time). */
declare const EAE: {
	readonly indexes: Record<string, { readonly compound: readonly string[] } | undefined>;
};

interface Window {
	LOCALE: string;
}

/** The debounced state-commit dispatcher (a.js); a writable window global
 * (window.COMMIT in a.tmpl) — re-invokes reload() and the epic's syncs. */
declare const COMMIT: (...args: unknown[]) => void;

/**
 * Minimal d3 v5 (lib/d3.js) surface used by TS modules — only what the
 * timeline view touches today; grow as more d3 code is ported. The datum
 * type is threaded through data()/join() so attribute callbacks get real
 * contextual types; attribute values are otherwise scalars, arrays or such
 * callbacks.
 */
type D3AttrValue<D> =
	| string
	| number
	| boolean
	| readonly unknown[]
	| ((datum: D, index: number) => string | number | boolean);

interface D3Selection<D = unknown> {
	attr(name: string, value: D3AttrValue<D>): D3Selection<D>;
	style(name: string, value: string): D3Selection<D>;
	append(tag: string): D3Selection<D>;
	selectAll(selector: string): D3Selection;
	data<D2>(data: readonly D2[]): D3Selection<D2>;
	join(tag: string): D3Selection<D>;
	on(event: string, fn: (datum: D) => void): D3Selection<D>;
	each(fn: (this: Element, datum: D, index: number) => void): D3Selection<D>;
	call(fn: unknown): D3Selection<D>;
	text(value: string | number | null | undefined | ((datum: D) => string | number | null)): D3Selection<D>;
	node(): Node | null;
}

interface D3ScaleTime {
	(value: Date): number;
	domain(domain: readonly [Date, Date]): D3ScaleTime;
	range(range: readonly [number, number]): D3ScaleTime;
}

interface D3ScaleLinear {
	(value: number): number;
	domain(): [number, number];
	domain(domain: readonly [number, number]): D3ScaleLinear;
	range(range: readonly [number, number]): D3ScaleLinear;
	nice(): D3ScaleLinear;
}

interface D3Axis<V> {
	ticks(count: number): D3Axis<V>;
	tickValues(values: readonly V[]): D3Axis<V>;
	tickFormat(fn: (value: V) => string): D3Axis<V>;
}

interface D3Line<D> {
	defined(fn: (datum: D, index: number) => boolean): D3Line<D>;
	x(fn: (datum: D, index: number) => number): D3Line<D>;
	y(fn: (datum: D) => number): D3Line<D>;
	(data: readonly D[]): string;
}

interface D3ScalePoint {
	(index: number): number;
	domain(domain: readonly number[]): D3ScalePoint;
	range(range: readonly number[]): D3ScalePoint;
}

/** v5 quantile scale (the area score banding): value -> band label. */
interface D3ScaleQuantile<R> {
	(value: number | null): R | undefined;
	domain(): number[];
	domain(domain: readonly number[]): D3ScaleQuantile<R>;
	range(): R[];
	range(range: readonly R[]): D3ScaleQuantile<R>;
}

/** v5 quantize scale (the fixed-band labelling): value -> band label. */
interface D3ScaleQuantize<R> {
	(value: number): R;
	domain(domain: readonly number[]): D3ScaleQuantize<R>;
	range(): R[];
	range(range: readonly R[]): D3ScaleQuantize<R>;
}

interface D3DragBehavior {
	on(event: string, fn: () => void): D3DragBehavior;
}

declare const d3: {
	create(tag: string): D3Selection;
	select(node: Element): D3Selection;
	scalePoint(): D3ScalePoint;
	scaleQuantile<R>(): D3ScaleQuantile<R>;
	scaleUtc(): D3ScaleTime;
	scaleLinear(): D3ScaleLinear;
	axisBottom(scale: D3ScaleTime): D3Axis<Date>;
	axisLeft(scale: D3ScaleLinear): D3Axis<number>;
	line<D>(): D3Line<D>;
	scaleQuantize<R = string>(): D3ScaleQuantize<R>;
	/** The magma colour interpolation (the analysis output ramp). */
	interpolateMagma(t: number): string;
	range(stop: number): number[];
	ticks(start: number, stop: number, count: number): number[];
	extent(values: readonly Date[]): [Date, Date];
	/** v5 returns null on invalid input; timeline_dates entries are
	 * trusted ISO dates, so the parser is declared as total. */
	utcParse(format: string): (s: string) => Date;
	utcFormat(format: string): (d: Date) => string;
	drag(): D3DragBehavior;
	/** d3 v5 global event, set while a drag gesture runs. */
	event: { readonly x: number; readonly y: number };
};

type PCPair = [number, number];

declare const polygonClipping: {
	intersection(geomA: PCPair[][] | PCPair[][][], geomB: PCPair[][] | PCPair[][][]): PCPair[][][];
};
