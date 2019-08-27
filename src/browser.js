(function() {
  const support = {
    IE: null,

    Firefox: {
      min: 58,
      reason: "Shadow DOM support",
      note: "although suppported, the web browser needs to be configured"
    },

    Chrome: {
      min: 53,
      reason: "Shadow DOM support",
    },

    Opera: {
      min: 54,
      reason: "ES6 support",
    },

    Safari: {
      min: 11,
      reason: "Shadow DOM support",
    },

    Edge: {
      min: 76,
      reason: "Shadow DOM support"
    }
  };

  function browser_version() {
    let ua = navigator.userAgent
    let tem;
    let M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

    if (/trident/i.test(M[1])) {
      tem=  /\brv[ :]+(\d+)/g.exec(ua) || [];
      return 'IE '+(tem[1] || '');
    }

    if (M[1] === 'Chrome') {
      tem = ua.match(/\b(OPR|Edge)\/(\d+)/);

      if (tem != null)
        return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }

    M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
    if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1]);

    return M.join(' ');
  };

  var v = browser_version();
  var m;

  var usethis = " Please use a recent version of Firefox, Chrome or Opera.";
  var update = " Please update your browser to the latest version.";

  if (v.match(/IE/i)) {
    alert("This platform is known NOT to work on Internet Explorer." + usethis);
    throw "Internet Explorer is unsupported. Hej då.";
  }

  else if (m = v.match(/(Firefox|Chrome|Opera|Edge|Safari) (.*)/i)) {
    if (support[m[1]]["min"] > parseInt(m[2])) {
      alert("This platform is known NOT to work on " + v + "." + update);
    }
  }
})();
