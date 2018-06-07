function ea_spinner() {
  var d = document.createElement('div');
  d.classList.add('loading');

  var s = document.createElement('div');
  s.classList.add('spinner');

  d.appendChild(s);

  return d;
}

function ea_app_loading(bool) {
  document.querySelector('#app-loading').style.display = (bool) ? 'block' : 'none';
}
