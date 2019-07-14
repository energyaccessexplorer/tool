const ea_nanny_steps = [
  function() {
    const content = elem(`
<div>
  <p>Would you like us to guide you through the basics?</p>
</div>`);

    const footer = elem(`<div></div>`);

    let yes, no, never;

    footer.append(yes = elem(`<button>Yes, let's do this!</button>`));
    footer.append(no = elem(`<button>No. Ask me later.</button>`));
    footer.append(never = elem(`<button>No, don't ask me again.</button>`));

    yes.addEventListener('mouseup', ea_nanny_next);
    no.addEventListener('mouseup', ea_modal.hide);
    never.addEventListener('mouseup', _ => {
      localStorage.setItem('needs-nanny', false);
      ea_modal.hide();
    });

    ea_modal.set({
      header: "Welcome to Energy Access Explorer",
      content: content,
      footer: footer
    }).show();
  },
  function() {
    ea_modal.hide();

    const marker = ea_nanny_pick_element('#controls-boundaries', {
      title: "Sub-national level data",
      message: "Select one or more. They will be used as filters to identify regions of interest.",
      position: "E",
      align: "middle"
    });

    ea_nanny_el_wait_action(document.querySelector('#controls-boundaries'), 'mouseup', function() {
      ea_nanny_next();
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('#controls-population', {
      title: "Granular Demand Data (1/3)",
      message: "Select one or more datasets on <strong>Demographics</strong> and <strong>Social and Productive Uses</strong> to visualize and analyze current or potential demand for energy.",
      position: "E",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#controls-population .controls-dataset-header'), 'mouseup', function() {
      if (DSTable['population'].active) ea_nanny_next();
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('#controls-schools', {
      title: "Granular Demand Data (2/3)",
      message: "Select another one...",
      position: "E",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#controls-schools .controls-dataset-header'), 'mouseup', function() {
      if (DSTable['schools'].active) ea_nanny_next();
      marker.remove();
    });
  },
  async function() {
    await new Promise(_ => setTimeout(_, 1000));

    const marker = ea_nanny_pick_element('#controls-schools .control-group:nth-child(1) .svg-interval', {
      title: "Granular Demand Data (3/3)",
      message: `
<p>Apply filters to identify specific areas of interest</p>
<p>If you are interested in identifying areas that are close to social load (e.g. schools and health facilities), select these datasets to short proximity to use as a filter.</p>
`,
      position: "E",
      align: "middle",
    });

    let i;
    i = setInterval(function() {
      if (DSTable['schools'].tmp_domain[1] !== DSTable['schools'].heatmap.domain['max']) {
        clearInterval(i);
        marker.remove();
        ea_nanny_next();
      }
    }, 1000);


    ea_nanny_el_wait_action(document.querySelector('#controls-health .controls-dataset-header'), 'mouseup', function() {
      marker.remove();
    });
  },
  async function() {
    await new Promise(_ => setTimeout(_, 1000));

    const marker = ea_nanny_pick_element('#controls-schools .control-group:nth-child(2) .svg-range', {
      title: "Granular Demand Data (3/3)",
      message: `
<p>Weigh the importance</p>
<p>You can prioritize areas of interest base on your criteria. You can set a value from 1 (low) to 5 (high) importance.</p>`,
      position: "E",
      align: "middle",
    });

    let i;
    i = setInterval(function() {
      if (DSTable['schools'].weight !== 2) {
        clearInterval(i);
        marker.remove();
        ea_nanny_next();
      }
    }, 1000);


    ea_nanny_el_wait_action(document.querySelector('#controls-health .controls-dataset-header'), 'mouseup', function() {
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('#controls-ghi', {
      title: "Granular Supply Data",
      message: "Similarly, select and customize one or more data on <strong>Resource Availability</strong> and <strong>Infrastructure</strong>.",
      position: "E",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#supply'), 'mouseup', function() {
      if (DSTable['ghi'].active) ea_nanny_next();
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('#layers-list', {
      title: "Visualize Underlying Data",
      message: `
<p>You can sort the elements below by dragging them and change the order of the layers on the map.</p>
<p>Try it!</p>
`,
      position: "W",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#layers-list'), 'mousedown', function() {
      ea_nanny_next();
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('#views .view:nth-child(2)', {
      title: "Analytical Outputs",
      message: `You can change the view to see the different available indexes.`,
      position: "S",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#views'), 'mouseup', function() {
      ea_nanny_next();
      marker.remove();
    });
  },
  async function() {
    await new Promise(_ => setTimeout(_, 1000));

    const marker = ea_nanny_pick_element('#indexes-list', {
      title: "Analytical Outputs",
      message: `
<p>These elements represent the different indexes. Each index is a specialized aggregate of the dataset you selected previously.</p>
<p>Change the index by clicking on it.</p>
`,
      position: "W",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#indexes-list'), 'mouseup', function() {
      ea_nanny_next();
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('#index-graphs-info', {
      title: "Information about Analytical Outputs",
      message: `Click here to see a more detailed explanation about the Index`,
      position: "W",
      align: "middle",
    });

    ea_nanny_el_wait_action(document.querySelector('#index-graphs'), 'mouseup', function() {
      ea_nanny_next();
      marker.remove();
    });
  },
  function() {
    const marker = ea_nanny_pick_element('body', {
      title: "That's it!",
      message: "There are more features for you to find... go!",
      position: "C"
    });

    ea_nanny_el_wait_action(document.querySelector('body'), 'mousedown', function() {
      ea_nanny_next();
      marker.remove();
    });
  }
];
