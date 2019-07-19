const ea_nanny_steps = [
  {
    init: function() {
      const content = ce('div', ce('p', 'Would you like us to guide you through the basics?'));

      const footer = ce('div');

      const yes = ce('button', "Yes, let's do this!");
      yes.addEventListener('mouseup', _ => {
        ea_modal.hide();
        ea_nanny.next();
      });

      const no = ce('button', "No. Ask me later.");
      no.addEventListener('mouseup', _ => ea_modal.hide());

      const never = ce('button', "No, don't ask me again.");
      never.addEventListener('mouseup', _ => {
        localStorage.setItem('needs-nanny', false);
        ea_modal.hide();
      });

      footer.append(yes, no, never);

      ea_modal.set({
        header: "Welcome to Energy Access Explorer",
        content: content,
        footer: footer
      }).show();
    }
  },
  {
    init: function() {
      ea_modal.hide();
      this.el = qs(document, '#controls-boundaries');
    },
    mark: {
      title: "Sub-national level data",
      message: "Select one or more. They will be used as filters to identify regions of interest.",
      position: "E",
      align: "middle"
    },
    wait: {
      action: 'click'
    }
  },
  {
    init: function() {
      this.ds = DS.named('population');
      this.el = this.ds.controls_el;
    },
    mark: {
      title: "Granular Demand Data (1/3)",
      message: "Select one or more datasets on <strong>Demographics</strong> and <strong>Social and Productive Uses</strong> to visualize and analyze current or potential demand for energy.",
      position: "E",
      align: "middle",
    },
    wait: {
      el: s => qs(s.el, 'header'),
      action: 'click',
      f: function(fn) { this.ds.active ? fn() : null; }
    }
  },
  {
    init: function() {
      this.ds = DS.named('schools');
      this.el = this.ds.controls_el;
    },
    mark: {
      title: "Granular Demand Data (2/3)",
      message: "Select another one...",
      position: "E",
      align: "middle",
    },
    wait: {
      el: s => qs(s.el, 'header'),
      action: 'click',
      f: function(fn) { this.ds.active ? fn() : null; }
    }
  },
  {
    init: async function() {
      this.ds = DS.named('schools');
      this.el = this.ds.controls_el;

      await new Promise(_ => setTimeout(_, 1000));
    },
    mark: {
      el: s => qs(s.el, '[name=range-slider] .svg-interval'),
      title: "Granular Demand Data (3/3)",
      message: `
Apply filters to identify specific areas of interest.
<br>
If you are interested in identifying areas that are close to social load (e.g. schools and health facilities), select these datasets to short proximity to use as a filter.`,
      position: "E",
      align: "middle",
    },
    run: function(fn) {
      let i;

      i = setInterval(_ => {
        if (this.ds.tmp_domain[1] !== this.ds.heatmap.domain['max']) {
          clearInterval(i);
          fn();
        }
      }, 1000);
    },
  },
  {
    init: async function() {
      this.ds = DS.named('schools');
      this.el = this.ds.controls_el;

      await new Promise(_ => setTimeout(_, 1000));
    },
    mark: {
      el: s => qs(s.el, '[name=weight-slider] .svg-range'),
      title: "Granular Demand Data (3/3)",
      message: `
Weigh the importance.
<br>
You can prioritize areas of interest base on your criteria. You can set a value from 1 (low) to 5 (high) importance.`,
      position: "E",
      align: "middle",
    },
    run: function(fn) {
      let i;
      i = setInterval(_ => {
        if (this.ds.weight !== 2) {
          clearInterval(i);
          fn();
        }
      }, 1000);
    }
  },
  {
    init: function() {
      this.ds = DS.named('ghi');
      this.el = this.ds.controls_el;
    },
    mark: {
      title: "Granular Supply Data",
      message: "Similarly, select and customize one or more data on <strong>Resource Availability</strong> and <strong>Infrastructure</strong>.",
      position: "E",
      align: "middle"
    },
    wait: {
      el: _ => document.querySelector('#supply'),
      action: 'click',
      f: function(fn) { this.ds.active ? fn() : null; }
    }
  },
  {
    init: function() {
      this.el = qs(document, '#inputs-list');
    },
    mark: {
      title: "Visualize Underlying Data",
      message: `
You can sort the elements below by dragging them and change the order of the layers on the map.
<br>
Try it!`,
      position: "W",
      align: "middle"
    },
    run: function(fn) {
      const inputs = this.el.querySelectorAll('ds-input');

      let l = _ => {
        for (let i of inputs) i.removeEventListener('dragend', l);
        fn();
      };

      for (let i of inputs) i.addEventListener('dragend', l);
    },
  },
  {
    init: function() {
      this.el = qs(document, '#views .view:nth-child(2)');
    },
    mark: {
      title: "Analytical Outputs",
      message: `You can change the view to see the different available indexes.`,
      position: "S",
      align: "middle"
    },
    wait: {
      action: 'click'
    }
  },
  {
    init: async function() {
      this.el = document.querySelector('#indexes-list');
      await new Promise(_ => setTimeout(_, 1000));
    },
    mark: {
      title: "Analytical Outputs",
      message: `
These elements represent the different indexes. Each index is a specialized aggregate of the dataset you selected previously.
<br>
Change the index by clicking on it.`,
      position: "W",
      align: "middle",
    },
    wait: {
      action: 'click'
    }
  },
  {
    init: function() {
      this.el = qs(document, '#index-graphs-info');
    },
    mark: {
      title: "Information about Analytical Outputs",
      message: `Click here to see a more detailed explanation about the Index`,
      position: "W",
      align: "middle"
    },
    wait: {
      action: 'click'
    }
  },
  {
    init: async function() {
      this.el = document.body;
      await new Promise(_ => setTimeout(_, 1000));
    },
    mark: {
      title: "That's it!",
      message: "There are more features for you to find... go!",
      position: "C"
    },
    wait: {
      el: _ => document.body,
      action: 'click'
    }
  },
];
