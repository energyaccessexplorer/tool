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

		const bc = "rgba(0,0,0,1)";
		let cs, f;

		switch (position) {
		case "N":
		case "north": {
			halign();
			cs = (this.clientWidth / 2);
			f = 1/4;

			this.caret.style['border-width'] = cs + "px";
			this.caret.style['border-top-color'] = bc;
			this.caret.style['transform'] = `scale(1, ${f})`;
			this.caret.style['top'] = this.clientHeight - ((this.clientWidth * (3/8)) + 0.5) + "px";

			y -= this.clientHeight + (cs * f);

			break;
		}

		case "E":
		case "east": {
			valign();
			cs = (this.clientHeight / 2);
			f = 1/2;

			this.caret.style['border-width'] = cs + "px";
			this.caret.style['border-right-color'] = bc;
			this.caret.style['transform'] = `scale(${f}, 1)`;
			this.caret.style['left'] = -((this.clientHeight * (3/4)) - 1.5) + "px";

			x += elbox.width + (cs * f);

			break;
		}

		case "S":
		case "south": {
			halign();
			cs = (this.clientWidth / 2);
			f = 1/4;

			this.caret.style['border-width'] = cs + "px";
			this.caret.style['border-bottom-color'] = bc;
			this.caret.style['transform'] = `scale(1, ${f})`;
			this.caret.style['top'] = (-1) * ((this.clientWidth * (5/8)) - 0.5) + "px";

			y += elbox.height + (cs * f);

			break;
		}

		case "W":
		case "west": {
			valign();
			cs = (this.clientHeight / 2);
			f = 1/2;

			this.caret.style['border-width'] = cs + "px";
			this.caret.style['border-left-color'] = bc;
			this.caret.style['transform'] = `scale(${f}, 1)`;
			this.caret.style['left'] = this.clientWidth - ((this.clientHeight * (1/4)) + 1.5) + "px";

			x -= this.clientWidth + (cs * f);

			if (this.close_button)
				this.prepend(this.close_button);

			break;
		}

		case "C":
		case "center": {
			this.caret.style['display'] = 'none';

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

		this.caret = document.createElement('span');
		this.caret.className = 'caret';

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

			if (message instanceof Element)
				content.append(message);
			else
				content.innerHTML = message;

			this.main.append(content);
		}

		this.append(this.caret, this.main);

		if (close !== false) {
			this.close_button = document.createElement('div');
			this.close_button.className = 'map-info-close-button';

			this.close_button.onclick = _ => {
				if (this) this.remove();
				if (typeof close_callback === 'function') close_callback();
			};

			this.append(this.close_button);
		}

		if (hidden) this.style['display'] = "none";

		document.body.append(this);

		this.align();
	}
};

customElements.define('map-info', mapinfo);


