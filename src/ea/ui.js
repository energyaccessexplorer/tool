function elem(str) {
  const d = document.createElement('div');
  d.innerHTML = str;

  return d.firstElementChild;
}

function fake_download(blob) {
  const a = document.createElement('a');
  document.body.appendChild(a);

  a.style = "display:none;";

  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "ea_download";
  a.click();

  window.URL.revokeObjectURL(url);
}

function ea_ui_collapse_triangle(d) {
  let t;

  switch (d) {
  case 'e':
    t = 'rotate(-45)translate(-2,-4)';
    break;

  case 's':
    t = 'rotate(45)translate(-8,0)';
    break;

  case 'n':
    t = 'rotate(-135)translate(0,-6)';
    break;

  case 'w':
    t = 'rotate(135)translate(-2,0)';
    break;

  case 'ne':
    t = 'rotate(-90)';
    break;

  case 'se':
    t = '';
    break;

  default:
    throw `ea_collapse_triangle: e, ne, s, se, w. Got ${d}.`;
  }

  return `
<svg width="12px" height="12px" viewBox="0 0 12 12" transform="${t}">
  <polyline points="12,0 12,12 0,12 "/>
</svg>`;
}

function ea_ui_spinner() {
  return elem(`<div class="loading"><div class="spinner"></div></div>`);
}

function ea_ui_app_loading(bool) {
  document.querySelector('#app-loading').style['display'] = bool ? 'block' : 'none';
}

function ea_ui_dataset_loading(ds, bool) {
  const el = document.querySelector(`#controls-${ds.id}`);
  let s;

  if (bool) {
    s = ea_ui_spinner();
    el.append(s);
  }

  else {
    s = el.querySelector('.loading');
    s.remove();
  }

  return s;
}

function ea_ui_flash_setup() {
  const flash = elem(`
<aside id="flash"
       style="color: white;
              font-family: monospace;
              position: fixed;
              top: 2px;
              left: 2px;
              z-index: 9999;
              display: none;
              min-height: 50px;
              padding: 10px 20px;
              border: 1px solid white;">
</aside>`);

  document.body.prepend(flash)

  return (_type, title, message, timeout_override) => {
    let content = '';
    let bc = 'transparent';
    let timeout = null;

    if (title && message) {
      content += `<strong>${title}</strong><br>`;
      content += `<pre>${message}</pre>`;
    }

    if (title && !message)
      content = `<div style="line-height: 29px;">${title}</div>`;

    flash.innerHTML = content;

    switch (_type) {
    case "error":
      bc = '#E3655A';
      timeout = 0;
      break;

    case "info":
      bc = '#AEB3FF';
      timeout = 2000;
      break;

    case "success":
      bc = '#A5E49E';
      timeout = 1000;
      break;

    default:
      bc = 'gray';
      timeout = 5000;
    };

    timeout = (typeof timeout_override !== 'undefined' ? timeout_override : timeout);

    flash.style['display'] = 'block';
    flash.style['background-color'] = bc;

    if (timeout) setTimeout(() => flash.style['display'] = 'none', timeout);

    flash.addEventListener('click', () => flash.style['display'] = 'none');
  };
}

function ea_layout_map() {
  const p = document.querySelector('#playground');

  let width, height;

  width = p.clientWidth -
    (p.querySelector('#controls').clientWidth +
     p.querySelector('#layers').clientWidth) + 10;

  height = document.querySelector('#visual').clientHeight

  const coord_tooltip = document.querySelector('body')
        .appendChild(elem(`<div id="coord-tooltip"></div>`));

  ea_canvas = document.querySelector('canvas#plot');
  ea_canvas.style['width'] = width + "px";

  const maparea = document.querySelector('#maparea');
  maparea.style['width'] = width + "px";
  maparea.style['height'] = height + "px";

  return {
    width: width,
    height: height
  };
}
