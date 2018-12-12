(function() {
  const button = document.querySelector('#country-select');
  const dropdown = document.querySelector('#country-dropdown');

  let country_list = null;

  button.addEventListener('click', _ => {
    if (country_list) {
      dropdown.style.display = 'block';
      return;
    }

    fetch(ea_settings.database + '/countries?select=name,cca3,ccn3&online')
      .then(r => r.json())
      .then(j => j.sort((a,b) => a['name'] > b['name'] ? 1 : -1))
      .then(j => {
        country_list = j;
        j.forEach(c => {
          let e = elem(`
<div class="country-dropdown-element">
  <div class="country-dropdown-image">
    <img class="flag" src="https://cdn.rawgit.com/mledoze/countries/master/data/${c.cca3.toLowerCase()}.svg" />
  </div>

  <div class="country-dropdown-name">${c.name}</div>
</div>
`);

          e.addEventListener('click', _ => {
            console.log(countries, c.ccn3)
            ea_countries_overview(countries.find(x => +x.ccn3 === c.ccn3), countries_overviews, countries_online)
          });

          dropdown.appendChild(e);
        });

        dropdown.style.display = 'block';
      });
  });

  dropdown.addEventListener('mouseleave', _ => dropdown.style.display = 'none');
  dropdown.addEventListener('mouseenter', _ => dropdown.style.display = 'block');

  button.addEventListener('mouseleave', _ => dropdown.style.display = 'none');
})();
