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
	/** Currently selected index id ('eai', 'demand', 'supply', 'ani', ...). */
	readonly index: string;

	/**
	 * Legacy per-geography selected Date (timeline.js). The EAE-297 year
	 * control writes the selected GEOGRAPHY.timeline_dates entry here to
	 * keep the legacy graphs in sync; state_set accepts date-parseables.
	 */
	timeline: unknown;
};

declare const GEOGRAPHY: {
	readonly divisions?: Record<string, {
		readonly raster?: RasterLike;
		/** Per-division-id priority averages (analysis.js priority()). */
		readonly priorityData?: Record<string, { readonly average?: number }>;
	} | undefined>;

	/** ISO date strings for timeline-enabled geographies (EAE-297). */
	readonly timeline_dates?: readonly string[];
};

declare const OUTLINE: { readonly raster?: RasterLike } | undefined;

/** Dataset registry by id (analysis.js). */
declare const DST: ReadonlyMap<string, unknown>;

/** App configuration namespace (built into main.js at build time). */
declare const EAE: {
	readonly indexes: Record<string, { readonly compound?: readonly string[] } | undefined>;
};

interface Window {
	LOCALE: string;
}

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
	tickValues(values: readonly number[]): D3Axis<V>;
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

interface D3DragBehavior {
	on(event: string, fn: () => void): D3DragBehavior;
}

declare const d3: {
	create(tag: string): D3Selection;
	select(node: Element): D3Selection;
	scalePoint(): D3ScalePoint;
	scaleUtc(): D3ScaleTime;
	scaleLinear(): D3ScaleLinear;
	axisBottom(scale: D3ScaleTime): D3Axis<Date>;
	axisLeft(scale: D3ScaleLinear): D3Axis<number>;
	line<D>(): D3Line<D>;
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
