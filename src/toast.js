import bind from '../lib/bind.js';
import { tmpl } from '../lib/helpers.js';

export default class Toast extends HTMLElement {
	constructor(options) {
		super();

		const { label, caption, variant } = options;

		this._label   = label;
		this._caption = caption;
		this._variant = variant;

		const templateId = (variant === 'error' || variant === 'warn') ? '#toast-error-template' : '#toast-notification-template';
		const content = tmpl(templateId);
		bind(content, { label, caption });

		if (variant === 'error' || variant === 'warn') this.classList.add('error');

		this.append(content);
	}

	show() {
		if (this._variant === 'error')
			window.Sentry?.captureMessage(this._label, {
				"level": 'error',
				"extra": { "caption": this._caption },
			});

		document.body.append(this);

		setTimeout(() => {
			this.remove();
		}, 5000);
	}
}

customElements.define('toast-notification', Toast);

export function show_error(title, caption) {
	new Toast({ "label": title, "caption": caption ?? '', "variant": 'error' }).show();
}
