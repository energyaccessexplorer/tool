export default function(el) {
	const tabs = el.querySelectorAll('[tab]');

	const attrs = [];

	for (const t of tabs) {
		const a = t.getAttribute('tab');

		attrs.push(a);

		t.onclick = function() {
			for (const r of tabs) {
				r.removeAttribute('active');
				document.querySelector(`[tab-content="${r.getAttribute('tab')}"]`).removeAttribute('active');
			}

			this.setAttribute('active', '');
			document.querySelector(`[tab-content="${a}"]`).setAttribute('active', '');

			location.hash = a;
		};
	}

	const h = location.hash.replace(/^#/, '');
	if (attrs.includes(h))
		el.querySelector(`[tab="${h}"]`).dispatchEvent(new Event('click'));
};
