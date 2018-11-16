(function() {
  const select = document.querySelector('#controls-country');

  let country_list = null;

  if (!select) return;

  fetch(ea_settings.database + '/countries?select=name,cca3,ccn3&online')
    .then(r => r.json())
    .then(j => j.sort((a,b) => a['name'] > b['name'] ? 1 : -1))
    .then(j => {
      country_list = j;
      j.forEach(c => select.appendChild(elem(`<option value="${c.ccn3}">${c.name}</option>`)));
    })
    .then(_ => {
      select.value = location.get_query_param('ccn3');
      select.querySelector('option[value=""]').innerText = "Select a country";
    });

  select.addEventListener('change', function() { window.location = `/maps-and-data/tool/?ccn3=${this.value}`});
})();
