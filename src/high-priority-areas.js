import {
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	context,
} from './complicated.js';

import {
	extract_map_info_data,
} from './map-info.js';

import {
	fake_blob_download,
	qs,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

function prepare_data(results) {
	const is_raster = STATE.variant === 'raster';
	const analysis_name = EAE['indexes'][STATE.index]['name'];

	const get_row = (item) => {
		let fields = [];
		let props = {};
		let ll = null;
		let area_info = null;

		if (is_raster) {
			ll = item.c;
			const rc = coordinates_to_raster_pixel(ll, OUTLINE.raster);
			[fields, props] = context(rc, null);
		} else {
			area_info = { "variant": STATE.variant, "name": item.name };
		}

		const { detailedData } = extract_map_info_data(
			fields, props, ll, item.v, analysis_name, null, area_info,
		);

		const row = {};
		if (ll) {
			row["Longitude"] = ll[0].toFixed(5);
			row["Latitude"] = ll[1].toFixed(5);
		}

		for (const data of detailedData) {
			row[data.label] = data.value.replace(/<[^>]*>/g, '').trim();
		}

		return row;
	};

	const headers = ["Priority score", ...Object.keys(get_row(results[0])).filter(h => h !== "Priority score")];
	const area_type = is_raster ? '1km²' : (GEOGRAPHY.divisions[STATE.variant]?.name || 'areas');

	return { headers, get_row, area_type, analysis_name };
}

function* generate_rows(results, get_row, start = 0, count = results.length - start) {
	const end = Math.min(start + count, results.length);
	for (let i = start; i < end; i++) {
		yield get_row(results[i]);
	}
}

export async function download(results, event) {
	const data = prepare_data(results);
	const { headers, get_row, analysis_name } = data;
	const button = event.currentTarget;

	button.disabled = true;
	button.querySelector('span').textContent = 'Generating...';

	const warn_before_unload = (e) => {
		e.preventDefault();
		e.returnValue = '';
	};
	window.addEventListener('beforeunload', warn_before_unload);

	const escape_csv = (val) => {
		if (val === null || val === undefined) return '';
		const str = String(val);
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const rows = [];
	let i = 0;
	for (const row_data of generate_rows(results, get_row)) {
		rows.push(headers.map(h => escape_csv(row_data[h])).join(','));
		if (++i % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
	}

	const csv_content = [headers.join(','), ...rows].join('\n');
	const filename = `energyaccessexplorer-${analysis_name.toLowerCase().replace(/\s+/g, '-')}-high-priority-areas-${Date.now()}.csv`;

	fake_blob_download(csv_content, filename, 'text/csv;charset=utf-8');

	window.removeEventListener('beforeunload', warn_before_unload);
	button.disabled = false;
	button.querySelector('span').textContent = 'Download data';
}

export function view_all(results) {
	const data = prepare_data(results);
	if (!data) return;

	const { headers, get_row, area_type, analysis_name } = data;

	const BATCH_SIZE = 50;
	let loaded_count = 0;
	let observer = null;

	const content = tmpl('#high-priority-areas-list-all-template');
	bind(content, {
		"analysis-name": analysis_name,
		"headers":       headers.map(name => ({ name })),
		"download":      (_, event) => download(results, event),
	});

	const table_container = qs('.high-priority-areas-list-all-table-container', content);
	const tbody = qs('tbody', content);

	const sentinel = document.createElement('tr');
	sentinel.className = 'sentinel-row';
	sentinel.innerHTML = `<td colspan="${headers.length}"></td>`;

	function load_batch() {
		for (const row_data of generate_rows(results, get_row, loaded_count, BATCH_SIZE)) {
			const tr = document.createElement('tr');
			headers.forEach(header => {
				const td = document.createElement('td');
				td.textContent = row_data[header] || '';
				tr.append(td);
			});
			tbody.append(tr);
			loaded_count++;
		}

		if (loaded_count < results.length) {
			tbody.append(sentinel);
		} else if (observer) {
			observer.disconnect();
		}
	}

	load_batch();

	const m = new modal({
		"id":      'high-priority-areas-list-all',
		"header":  `High priority areas (${area_type})`,
		"content": content,
		"destroy": true,
	});

	m.show(() => {
		observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting && loaded_count < results.length) {
					sentinel.remove();
					load_batch();
				}
			});
		}, {
			"root":       table_container,
			"rootMargin": '100px',
			"threshold":  0,
		});

		if (loaded_count < results.length) {
			observer.observe(sentinel);
		}
	});
}
