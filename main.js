const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

const slider = document.querySelector('#year');
const menu = document.querySelector('#state');
const playButton = document.querySelector('#play');
const tooltip = document.querySelector('#tooltip');

let year = 2014;
let selectedState = 'CA';
let timer;

async function start() {
  const rows = await d3.csv('data/state_monthly_tas.csv', function (row) {
    return {
      name: row.state,
      state: row.abbr,
      year: Number(row.year),
      month: Number(row.month),
      temp: Number(row.temp_c)
    };
  });

  const geography = await d3.json('states-10m.json');
  const abbreviations = {};
  const annual = {};

  for (const row of rows) {
    abbreviations[row.name] = row.state;

    if (!annual[row.state]) {
      annual[row.state] = {};
    }

    if (!annual[row.state][row.year]) {
      annual[row.state][row.year] = {
        hot: row,
        cold: row,
        gap: 0
      };
    }

    const summary = annual[row.state][row.year];

    if (row.temp > summary.hot.temp) {
      summary.hot = row;
    }

    if (row.temp < summary.cold.temp) {
      summary.cold = row;
    }

    summary.gap = summary.hot.temp - summary.cold.temp;
  }

  let largestGap = 0;

  for (const state in annual) {
    for (const year in annual[state]) {
      const gap = annual[state][year].gap;

      if (gap > largestGap) {
        largestGap = gap;
      }
    }
  }

  const upper = Math.ceil(largestGap / 5) * 5;
  const stateFeatures = topojson.feature(
    geography,
    geography.objects.states
  ).features;
  const states = stateFeatures.filter(function (state) {
    return abbreviations[state.properties.name];
  });

  const color = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, upper]);
  const map = d3.select('#map');
  const projection = d3.geoAlbersUsa().fitExtent(
    [
      [18, 18],
      [942, 582]
    ],
    { type: 'FeatureCollection', features: states }
  );
  const path = d3.geoPath(projection);
  const shapes = map
    .selectAll('path')
    .data(states)
    .join('path')
    .attr('class', 'state')
    .attr('d', path)
    .on('click', (event, d) => {
      selectedState = abbreviations[d.properties.name];

      menu.value = selectedState;
      update();
    })
    .on('mousemove', (event, d) => {
      const value = annual[abbreviations[d.properties.name]][year];
      tooltip.hidden = false;
      tooltip.innerHTML = `<strong>${d.properties.name} · ${year}</strong><br>Annual gap: ${value.gap.toFixed(1)}°C`;
      let left = event.clientX + 14;
      let top = event.clientY + 14;

      if (left + tooltip.offsetWidth > window.innerWidth - 8) {
        left = window.innerWidth - tooltip.offsetWidth - 8;
      }

      if (top + tooltip.offsetHeight > window.innerHeight - 8) {
        top = window.innerHeight - tooltip.offsetHeight - 8;
      }

      tooltip.style.left = Math.max(8, left) + 'px';
      tooltip.style.top = Math.max(8, top) + 'px';
    })
    .on('mouseleave', () => {
      tooltip.hidden = true;
    });

  const legend = d3
    .select('#legend')
    .append('svg')
    .attr('viewBox', '0 0 500 55')
    .style('max-width', '500px')
    .style('margin', 'auto');

  const gradient = legend
    .append('defs')
    .append('linearGradient')
    .attr('id', 'gap-colors');

  for (let step = 0; step <= 10; step++) {
    const fraction = step / 10;

    gradient
      .append('stop')
      .attr('offset', fraction)
      .attr('stop-color', color(fraction * upper));
  }

  legend
    .append('rect')
    .attr('x', 25)
    .attr('y', 4)
    .attr('width', 450)
    .attr('height', 12)
    .attr('fill', 'url(#gap-colors)');

  const legendScale = d3.scaleLinear().domain([0, upper]).range([25, 475]);

  legend
    .append('g')
    .attr('transform', 'translate(0,16)')
    .call(
      d3
        .axisBottom(legendScale)
        .ticks(5)
        .tickFormat((d) => d + '°C')
    );

  const stateNames = Object.keys(abbreviations).sort();

  for (const name of stateNames) {
    const option = document.createElement('option');
    option.value = abbreviations[name];
    option.textContent = name;
    menu.append(option);
  }

  menu.value = selectedState;

  const chart = d3.select('#trend');
  const x = d3.scaleLinear().domain([1850, 2014]).range([58, 875]);
  const y = d3.scaleLinear().domain([0, upper]).range([265, 20]);

  chart
    .append('g')
    .attr('transform', 'translate(0,265)')
    .call(d3.axisBottom(x).ticks(7).tickFormat(d3.format('d')));

  chart
    .append('g')
    .attr('transform', 'translate(58,0)')
    .call(d3.axisLeft(y).ticks(5));

  chart
    .append('text')
    .attr('x', 58)
    .attr('y', 12)
    .attr('font-size', 12)
    .attr('fill', '#53666c')
    .text('Annual gap (°C)');

  chart
    .append('text')
    .attr('x', 460)
    .attr('y', 310)
    .attr('text-anchor', 'middle')
    .attr('font-size', 12)
    .text('Year');

  // Shaded bands for the two 30-year periods compared in section 03
  const eras = [
    { start: 1850, end: 1879 },
    { start: 1985, end: 2014 }
  ];

  chart
    .selectAll('.era-band')
    .data(eras)
    .join('rect')
    .attr('class', 'era-band')
    .attr('x', (d) => x(d.start))
    .attr('width', (d) => x(d.end) - x(d.start))
    .attr('y', 20)
    .attr('height', 245);

  const eraLines = chart
    .selectAll('.era-line')
    .data(eras)
    .join('line')
    .attr('class', 'era-line')
    .attr('x1', (d) => x(d.start))
    .attr('x2', (d) => x(d.end));

  const eraLabels = chart
    .selectAll('.era-label')
    .data(eras)
    .join('text')
    .attr('class', 'era-label')
    .attr('x', (d) => (x(d.start) + x(d.end)) / 2)
    .attr('text-anchor', 'middle');

  // Average of one measure ('hot', 'cold' or 'gap') over a span of years
  function average(state, measure, start, end) {
    let total = 0;

    for (let eraYear = start; eraYear <= end; eraYear++) {
      const summary = annual[state][eraYear];
      total += measure === 'gap' ? summary.gap : summary[measure].temp;
    }

    return total / (end - start + 1);
  }

  // ---------- Section 03: change between the first and last 30 years ----------
  const measures = {
    gap: { more: 'wider', less: 'narrower', label: 'Annual gap' },
    hot: { more: 'warmer', less: 'cooler', label: 'Hottest month' },
    cold: { more: 'warmer', less: 'cooler', label: 'Coldest month' }
  };
  let measure = 'gap';

  const changes = stateNames.map(function (name) {
    const state = abbreviations[name];
    const change = { name: name, state: state };

    for (const key in measures) {
      change[key] =
        average(state, key, 1985, 2014) - average(state, key, 1850, 1879);
    }

    return change;
  });

  // Rows stay sorted by the change in the gap, whichever measure is shown
  changes.sort((a, b) => a.gap - b.gap);

  const rowHeight = 15;
  const changeTop = 34;
  const changeBottom = changeTop + changes.length * rowHeight;
  const changeChart = d3
    .select('#change')
    .attr('viewBox', `0 0 900 ${changeBottom + 38}`);
  const changeX = d3.scaleLinear().domain([-4.5, 5.5]).range([150, 880]);
  const changeY = d3
    .scaleBand()
    .domain(changes.map((d) => d.state))
    .range([changeTop, changeBottom])
    .padding(0.22);

  changeChart
    .append('g')
    .attr('class', 'change-grid')
    .attr('transform', `translate(0,${changeTop})`)
    .call(
      d3
        .axisTop(changeX)
        .ticks(10)
        .tickSize(-(changeBottom - changeTop))
        .tickFormat((d) => (d > 0 ? '+' : '') + d + '°C')
    );

  const changeRows = changeChart
    .selectAll('.change-row')
    .data(changes)
    .join('g')
    .attr('class', 'change-row')
    .on('click', (event, d) => {
      selectedState = d.state;
      menu.value = selectedState;
      update();
    })
    .on('mousemove', (event, d) => {
      tooltip.hidden = false;
      tooltip.innerHTML =
        `<strong>${d.name}</strong><br>1985–2014 compared with 1850–1879` +
        Object.keys(measures)
          .map((key) => `<br>${measures[key].label}: ${signed(d[key])}`)
          .join('');
      tooltip.style.left =
        Math.max(
          8,
          Math.min(
            event.clientX + 14,
            window.innerWidth - tooltip.offsetWidth - 8
          )
        ) + 'px';
      tooltip.style.top =
        Math.max(
          8,
          Math.min(
            event.clientY + 14,
            window.innerHeight - tooltip.offsetHeight - 8
          )
        ) + 'px';
    })
    .on('mouseleave', () => {
      tooltip.hidden = true;
    });

  // Invisible full-width rectangle so the whole row reacts to the mouse
  changeRows
    .append('rect')
    .attr('class', 'change-hit')
    .attr('x', 0)
    .attr('width', 900)
    .attr('y', (d) => changeY(d.state) - 1.5)
    .attr('height', rowHeight);

  changeRows
    .append('text')
    .attr('class', 'change-name')
    .attr('x', 142)
    .attr('y', (d) => changeY(d.state) + changeY.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .text((d) => d.name);

  const changeBars = changeRows
    .append('rect')
    .attr('class', 'change-bar')
    .attr('y', (d) => changeY(d.state))
    .attr('height', changeY.bandwidth())
    .attr('x', changeX(0))
    .attr('width', 0);

  changeChart
    .append('line')
    .attr('class', 'change-zero')
    .attr('x1', changeX(0))
    .attr('x2', changeX(0))
    .attr('y1', changeTop)
    .attr('y2', changeBottom);

  const lessLabel = changeChart
    .append('text')
    .attr('class', 'change-direction')
    .attr('x', changeX(0) - 10)
    .attr('y', changeBottom + 24)
    .attr('text-anchor', 'end');

  const moreLabel = changeChart
    .append('text')
    .attr('class', 'change-direction')
    .attr('x', changeX(0) + 10)
    .attr('y', changeBottom + 24);

  function signed(value) {
    return (value > 0 ? '+' : '') + value.toFixed(1) + '°C';
  }

  function drawChange() {
    changeBars
      .classed('less', (d) => d[measure] < 0)
      .transition()
      .duration(500)
      .attr('x', (d) => changeX(Math.min(0, d[measure])))
      .attr('width', (d) => Math.abs(changeX(d[measure]) - changeX(0)));

    lessLabel.text('← ' + measures[measure].less);
    moreLabel.text(measures[measure].more + ' →');

    const less = changes.filter((d) => d[measure] < 0).length;
    document.querySelector('#change-summary').textContent =
      `${measures[measure].label}: ${measures[measure].more} in ` +
      `${changes.length - less} states, ${measures[measure].less} in ${less}.`;

    for (const button of document.querySelectorAll('#measure button')) {
      button.setAttribute('aria-pressed', button.value === measure);
    }
  }

  for (const button of document.querySelectorAll('#measure button')) {
    button.addEventListener('click', () => {
      measure = button.value;
      drawChange();
    });
    button.disabled = false;
  }

  drawChange();

  const line = chart
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', '#236a66')
    .attr('stroke-width', 2);

  const cursor = chart
    .append('line')
    .attr('y1', 20)
    .attr('y2', 265)
    .attr('stroke', '#b16b29')
    .attr('stroke-dasharray', '4 4');

  const dot = chart
    .append('circle')
    .attr('r', 5)
    .attr('fill', '#b16b29')
    .attr('stroke', 'white')
    .attr('stroke-width', 1.5);

  function update() {
    tooltip.hidden = true;
    document.querySelector('#year-label').textContent = year;
    slider.value = year;
    shapes
      .attr('fill', (d) =>
        color(annual[abbreviations[d.properties.name]][year].gap)
      )
      .classed(
        'selected',
        (d) => abbreviations[d.properties.name] === selectedState
      );

    const value = annual[selectedState][year];
    const name = menu.selectedOptions[0].textContent;
    document.querySelector('#hot').textContent =
      `${months[value.hot.month - 1]} · ${value.hot.temp.toFixed(1)}°C`;
    document.querySelector('#cold').textContent =
      `${months[value.cold.month - 1]} · ${value.cold.temp.toFixed(1)}°C`;
    document.querySelector('#gap').textContent = value.gap.toFixed(1) + '°C';
    document.querySelector('#detail-note').textContent =
      `${name} · ${year}. The orange marker shows the selected year.`;
    document
      .querySelector('#trend')
      .setAttribute(
        'aria-label',
        `${name}: annual temperature gap, 1850 to 2014`
      );

    const history = [];

    for (let chartYear = 1850; chartYear <= 2014; chartYear++) {
      history.push({
        year: chartYear,
        gap: annual[selectedState][chartYear].gap
      });
    }

    const drawLine = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.gap));

    line.attr('d', drawLine(history));

    // 30-year averages on the line chart, and the matching row in section 03
    eraLines
      .attr('y1', (d) => y(average(selectedState, 'gap', d.start, d.end)))
      .attr('y2', (d) => y(average(selectedState, 'gap', d.start, d.end)));
    eraLabels
      // Label sits at the top or bottom, whichever is away from the line
      .attr('y', (d) =>
        average(selectedState, 'gap', d.start, d.end) > upper / 2 ? 256 : 34
      )
      .text(
        (d) =>
          `${d.start}–${d.end} avg: ` +
          average(selectedState, 'gap', d.start, d.end).toFixed(1) +
          '°C'
      );
    changeRows.classed('selected', (d) => d.state === selectedState);
    cursor.attr('x1', x(year)).attr('x2', x(year));
    dot.attr('cx', x(year)).attr('cy', y(value.gap));
  }

  function pause() {
    clearInterval(timer);
    timer = undefined;
    playButton.textContent = 'Play';
  }

  slider.addEventListener('input', () => {
    pause();
    year = Number(slider.value);
    update();
  });

  menu.addEventListener('change', () => {
    selectedState = menu.value;
    update();
  });

  playButton.addEventListener('click', () => {
    if (timer) {
      pause();
      return;
    }
    if (year === 2014) {
      year = 1850;
      update();
    }
    playButton.textContent = 'Pause';
    timer = setInterval(() => {
      year += 1;
      update();
      if (year === 2014) {
        pause();
      }
    }, 250);
  });

  slider.disabled = false;
  menu.disabled = false;
  playButton.disabled = false;
  document.querySelector('#status').hidden = true;
  update();
}

start().catch((error) => {
  document.querySelector('#status').textContent =
    'Could not load the visualization. Open this folder in VS Code and use Live Server. Keep the data folder, map JSON, and vendor folder together.';
  console.error(error);
});
