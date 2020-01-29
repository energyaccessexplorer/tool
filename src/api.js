async function ea_api_parse(response, options = {}) {
  let body = null;

  try {
    switch (options.expect) {
    case 'text':
      body = await response.text();
      break;

    case 'blob':
      body = await response.blob();
      break;

    case 'json':
    default:
      body = await response.json();
      break;
    }
  }
  catch(err) {
    return { "message": "ea_api_parse: could not parse response!" };
  }

  if (!response.ok) {
    let title, message;
    let type = 'error';

    switch (response.status) {
    case 0: {
      title = "Connection error";
      message = "You (and/or the server) are offline.";
      ea_flash.push({ type: type, title: title, message, message });
      break;
    }

    case 401: {
      localStorage.removeItem('token');

      if (body.message === 'JWT expired') {
        type = null;
        title = "Session expired";
        message = "Log in on the other tab.";

        setTimeout(_ => window.open('/login'), 1000);

        window.ea_token_interval = setInterval(function() {
          if (!localStorage.getItem('token'))
            log("Waiting for token");

          else {
            clearInterval(window.ea_token_interval);
            window.location.reload();
          }
        }, 1000);

        ea_flash.push({ type: type, title: title, message, message });
      }

      else {
        window.location = '/login';
        return;
      }
      break;
    }

    case 500: {
      title = "Server crash!";
      message = "NOT GOOD. File a bug report.";
      ea_flash.push({ type: type, title: title, message, message });
      break;
    }

    case 502: {
      title = "Server is not running!";
      message = "NOT GOOD. Contact an admin.";
      ea_flash.push({ type: type, title: title, message, message });
      break;
    }

    default: {
      title = `${response.status}: ${response.statusText}`;
      message = body.message;
      ea_flash.push({ type: type, title: title, message, message });

      break;
    }
    }

    throw Error('ea_api_check: FAILED request');
  }

  return body;
};

function ea_api(table, params, options = {}) {
  const token = localStorage.getItem('token');

  const url = new URL(ea_settings.database + "/" + table);
  for (let k in params) {
    let v = params[k];
    if (v instanceof Array) v = params[k].join(',');

    url.searchParams.set(k,v);
  }

  const {method, contenttype, payload, object} = options;

  const req = {
    "method": method || 'GET',
    "headers": {
      "Prefer": "return=representation",
      "Authorization": token ? `Bearer ${token}` : undefined,
      "Content-Type": (contenttype || 'application/json'),
      "Accept": object ? "application/vnd.pgrst.object+json" : undefined,
    }
  }

  for (let k in req.headers) if (!req.headers[k]) delete req.headers[k];

  return fetch(url, req).then(r => ea_api_parse(r, options));
};
