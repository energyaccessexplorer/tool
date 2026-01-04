export default class mapinfo extends HTMLElement {
	constructor(opts, el = document.body) {
		if (!(el instanceof Node)) throw new DOMError("mapinfo", `'${el}' is not an Node`);

		super();

		this.el = el;
		this.opts = opts;

		this.render();

		return this;
	}

	align() {
		const { position, align } = this.opts;
		const elbox = this.el.getBoundingClientRect();

		let x = elbox.x;
		let y = elbox.y;

		const halign = _ => {
			switch (align) {
			case "start":
				x += 0;
				break;

			case "end":
				x += elbox.width - this.clientWidth;
				break;

			case "middle":
			default:
				x += (elbox.width / 2) - (this.clientWidth / 2);
				break;
			}
		};

		const valign = _ => {
			switch (align) {
			case "start":
				y -= this.clientHeight / 2;
				break;

			case "end":
				y += elbox.height - (this.clientHeight / 2);
				break;

			case "middle":
			default:
				y = elbox.y + (elbox.height / 2) - (this.clientHeight / 2);
				break;
			}
		};

		const lineWidth = 4;
		const gap = 10;

		switch (position) {
		case "N":
		case "north": {
			halign();

			this.arrow.style['width'] = lineWidth + "px";
			this.arrow.style['height'] = gap + "px";
			this.arrow.style['left'] = (this.clientWidth / 2 - lineWidth / 2) + "px";
			this.arrow.style['top'] = this.clientHeight + "px";

			y -= this.clientHeight + gap;

			break;
		}

		case "E":
		case "east": {
			valign();

			this.arrow.style['width'] = gap + "px";
			this.arrow.style['height'] = lineWidth + "px";
			this.arrow.style['left'] = -gap + "px";
			this.arrow.style['top'] = (this.clientHeight / 2 - lineWidth / 2) + "px";

			x += elbox.width + gap;

			break;
		}

		case "S":
		case "south": {
			halign();

			this.arrow.style['width'] = lineWidth + "px";
			this.arrow.style['height'] = gap + "px";
			this.arrow.style['left'] = (this.clientWidth / 2 - lineWidth / 2) + "px";
			this.arrow.style['top'] = -gap + "px";

			y += elbox.height + gap;

			break;
		}

		case "W":
		case "west": {
			valign();

			this.arrow.style['width'] = gap + "px";
			this.arrow.style['height'] = lineWidth + "px";
			this.arrow.style['left'] = this.clientWidth + "px";
			this.arrow.style['top'] = (this.clientHeight / 2 - lineWidth / 2) + "px";

			x -= this.clientWidth + gap;

			if (this.close_button)
				this.prepend(this.close_button);

			break;
		}

		case "C":
		case "center": {
			this.arrow.style['display'] = 'none';

			valign();
			halign();

			break;
		}

		default:
			break;
		}

		this.style.left = (x < 0 ? 0 : x) + window.scrollX + "px";
		this.style.top = (y < 0 ? 0 : y) + window.scrollY + "px";
	}

	render() {
		const { hidden, title, message, close, close_callback, max_width, noevents } = this.opts;

		if (typeof max_width === 'number')
			this.style['max-width'] = max_width + "px";

		if (noevents)
			this.style['pointer-events'] = "none";

		this.arrow = document.createElement('span');
		this.arrow.className = 'arrow';

		this.main = document.createElement('main');

		if (title) {
			const header = document.createElement('header');

			if (title instanceof Element)
				header.append(title);
			else
				header.innerHTML = title;

			this.main.append(header);
		}

		if (message) {
			const content = document.createElement('content');

			if (message instanceof Element || message instanceof DocumentFragment)
				content.append(message);
			else
				content.innerHTML = message;

			this.main.append(content);
		}

		this.append(this.arrow, this.main);

		if (close !== false) {
			this.close_button = document.createElement('div');
			this.close_button.className = 'map-info-close-button';

			this.close_button.onclick = _ => {
				if (this) this.remove();
				if (typeof close_callback === 'function') close_callback();
			};

			this.append(this.close_button);
		}

		this.style['visibility'] = 'hidden';

		document.body.append(this);

		this.align();

		this.style['visibility'] = 'visible';

		if (hidden) this.style['display'] = "none";
	}
};

customElements.define('map-info', mapinfo);


