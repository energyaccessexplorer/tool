import {
	extract as user_extract,
} from './user.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import tabs from './tabs.js';

import {
	debounce,
	fake_blob_download,
	or,
	qs,
	unique,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

function loading(bool) {
	qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};

function filtering(snapshots) {
	const els = Array.from(document.querySelectorAll('.snapshot-square'));

	document.querySelector('input#search').oninput = debounce(function(event) {
		const v = event.target.value;

		const r = new RegExp(v, "i");

		for (const e of els) {
			const s = snapshots.find(s => s.time == e.getAttribute('data'));
			if (!s) continue;

			e.style.display = (or(
				s.geography_names_path.join("|").match(r),
				s.title?.match(r),
			)) ? '' : 'none';
		}
	}, 300);
};

function download(snapshots) {
	const div = this.closest('.snapshot-square');
	const data = div.getAttribute('data');

	const s = snapshots.find(s => s.time === +data);
	if (!s) return;

	fake_blob_download(
		JSON.stringify(s),
		`energyaccessexplorer-config-${s.time}.json`,
	);
};

function share(snapshots) {
	const div = this.closest('.snapshot-square');
	const data = div.getAttribute('data');

	const s = snapshots.find(s => s.time === +data);
	if (!s) return;

	const c = tmpl('#share-link-modal-content');

	const u = new URL(location);
	const url = `${u.protocol}//${u.hostname}${window.BASE}/tool/p?${s.time}`;

	function copy() {
		if (!navigator.clipboard) {
			FLASH.push({
				"type":    'error',
				"timeout": 2000,
				"title":   "Clipboard functionality not available",
			});

			this.closest('button').remove();

			return;
		}

		navigator.clipboard.writeText(url)
			.then(_ => {
				FLASH.push({
					"type":    'success',
					"timeout": 2000,
					"title":   "Link copied!",
				});
			});
	};

	bind(c, { url, copy });

	new modal({
		"id":      'share-link-modal',
		"header":  "Share link",
		"content": c,
		"destroy": true,
	}).show();
};

function edit_title(snapshots) {
	const div = this.closest('.snapshot-square');
	const data = div.getAttribute('data');

	const s = snapshots.find(s => s.time === +data);
	if (!s) return;

	const i = document.createElement('input');
	const f = document.createElement('form');
	const x = document.createElement('button');

	i.value = s.title;
	i.setAttribute('required', '');

	i.style = `
font-size: 1.2em;
padding: 7px 12px;
`;

	f.id = "save-analysis";
	f.append(i);

	x.type = "submit";
	x.innerText = "Save";
	x.setAttribute('form', 'save-analysis');

	const m = new modal({
		"header":  "Set Analysis Title",
		"content": f,
		"footer":  x,
	});

	f.onsubmit = function(e) {
		e.preventDefault();
		m.remove();

		s.title = i.value;

		API.patch('snapshots', {
			"time": `eq.${s.time}`,
		}, {
			"payload": {
				"title": i.value,
			},
		}).then(_ => {
			div.querySelector('.title').innerText = i.value;
			API.flash.push({ "message": "Title updated", "type": "success" });
		});

		return false;
	};

	m.show();
};

function drop(snapshots) {
	const div = this.closest('.snapshot-square');
	const data = div.getAttribute('data');

	const s = snapshots.find(s => s.time === +data);
	if (!s) return;

	if (!confirm(`Are you sure you want to delete this analysis? '${s.title}'`)) return;

	API.delete('snapshots', {
		"time": `eq.${s.time}`,
	}).then(_ => {
		div.remove();
		API.flash.push({ "message": `Analysis '${s.title}' deleted.`, "type": "success" });
	});
};

function base(e) {
	if (location.hostname.match('localhost')) return "";

	const subdomain = e === "public" ? "www" : e;

	return `https://${subdomain}.energyaccessexplorer.org`;
};

function draw_snapshots(snapshots, geographies, container, trees) {
	snapshots.forEach(s => {
		s.size = s.config.datasets.length;

		if (!s.size) return;

		s.url = base(s.env) + `/tool/a/?id=${s.geography_id}&snapshot=${s.time}`;

		const d = new Date(s.time);
		s.date = d.toLocaleDateString() + " at " + d.toLocaleTimeString();

		const geos = trees.find(t => t.id === s.geography_id).path.map(e => geographies.find(g => g.id === e).name);

		s.path = geos.join(" › ");
		s.geography_names_path = geos;

		const m = tmpl('#snapshot');
		bind(m,s);

		container.append(m);
	});

	filtering(snapshots);

	for (const p of document.querySelectorAll('.bi.bi-pencil'))
		p.onclick = function() { edit_title.call(this, snapshots); };

	for (const p of document.querySelectorAll('.bi.bi-trash3'))
		p.onclick = function() { drop.call(this, snapshots); };

	for (const p of document.querySelectorAll('.download'))
		p.onclick = function() { download.call(this, snapshots); };

	for (const p of document.querySelectorAll('.share'))
		p.onclick = function() { share.call(this, snapshots); };
};

export async function init() {
	if (!user_id) {
		console.warn("NOT logged in.");
		loading(false);
		return;
	}

	const snapshots = await API.get('snapshots', {
		"user_id": `eq.${user_id}`,
		"order":   "time.desc",
	});

	snapshots.forEach(s => s.title = s.title || '-- untitled --');

	const gs = unique(snapshots.map(t => t.geography_id));

	const trees = await API.get('geographies_tree_up',   { "id": `in.(${gs.join(',')})`});
	const flat = [].concat.call(trees.map(t => t.path)).flat();

	const geographies = await API.get('geographies', {
		"id":     `in.(${flat.join(',')})`,
		"select": ["id", "name"],
	});

	const container = document.querySelector('#snapshots');

	document.querySelector('#snapshots-count').innerText = snapshots.length + " Analyses";

	document.querySelector('select').onchange = function() {
		const v = this.value;

		const squares = document.getElementsByClassName('snapshot-square');
		while (squares[0]) squares[0].parentNode.removeChild(squares[0]);

		snapshots.sort(function(a,b) {
			if (a[v] > b[v]) return 1;
			else if (a[v] < b[v]) return -1;
			else return 0;
		});

		draw_snapshots(snapshots, geographies, container, trees);
	};

	document.querySelector('#change-password').onclick = function() {
		window.location = `/password-reset?email=${user_extract('email')}`;
	};

	draw_snapshots(snapshots, geographies, container, trees);

	tabs(document.body);

	loading(false);
};
