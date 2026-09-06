// Shared bits for the right-panel tab atoms and views.
//
// Both tabs (Data, Prioritization) keep their own Meiosis atom for now, but
// they describe the same selection (a clicked admin feature or raster pixel)
// and filter the same dataset set. These are the pieces they share; when the
// two atoms consolidate into one, this module is where the merge starts.

/** An admin-division feature the user clicked (as produced by mapbox).
 * `_variant` tags items originating from a variant-tagged list (EAE-306
 * Filtered geographies); the Prioritization tab skips per-index entries
 * for those (no priority score exists for timeline coverage). */
export interface AdminRef {
	readonly variant: string;
	readonly id: number;
	readonly _variant?: string | number;
}

/**
 * Minimal structural type for the legacy dataset objects the views touch
 * (STATE.datasets entries). Full dataset typing is out of scope; grow as
 * more modules are ported.
 */
export interface LegacyDataset {
	readonly id: string;
	readonly name: string;
	readonly on: boolean;
	readonly type?: string;
	// matches the legacy DS method name (ds.js) — not renamed
	info_modal(): void;
	readonly category?: {
		readonly name: string;
		readonly datatype?: string;
		readonly unit?: string;
		readonly analysis?: { readonly aggregation?: string };
		readonly controls?: { readonly path?: readonly string[] };
	};
	readonly csv?: {
		readonly data?: ReadonlyArray<Record<string, unknown>>;
		readonly key?: string;
		readonly column?: string;
	};
	readonly raster?: RasterLike;
	readonly colorscale?: { readonly fn: (value: number) => string };
}

/**
 * Datasets the right panel shows cards for: switched on, and not the
 * internal boundaries/outline datasets. Both tabs filter STATE.datasets
 * with exactly this predicate.
 */
export function activeDatasets(): LegacyDataset[] {
	return (STATE.datasets as LegacyDataset[]).filter(
		ds => ds.on && ds.category?.name !== 'boundaries' && ds.category?.name !== 'outline',
	);
}
