(function() {
  const support = {
    "IE": null,

    "Firefox": {
      "min": 63,
      "reason": "import/export module support",
    },

    "Chrome": {
      "min": 63,
      "reason": "import/export module support",
    },

    "Opera": {
      "min": 54,
      "reason": "ES6 support",
    },

    "Safari": {
      "min": 11.1,
      "reason": "import/export module support",
    },

    "Edge": {
      "min": 79,
      "reason": "EdgeHTML was never supported. Blink is now shipped."
    }
  };

  function browser_version() {
    const ua = navigator.userAgent
    let M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    let tem;

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

  const v = browser_version();
  let m;

  const usethis = " Please use a recent version of Firefox, Chrome or Opera.";
  const update = " Please update your browser to the latest version.";

  if (v.match(/IE/i)) {
    alert("This platform is known NOT to work on Internet Explorer." + usethis);
    throw "Internet Explorer is not supported. Hej då.";
  }

  else if (m = v.match(/(Edge|Firefox|Chrome|Opera|Safari) (.*)/i)) {
    if (support[m[1]]["min"] > parseInt(m[2])) {
      alert("This platform is known NOT to work on " + v + "." + update);
    }
  }
})();
