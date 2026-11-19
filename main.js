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
const mapNote = document.querySelector('#map-note');
const viewButtons = document.querySelectorAll('input[name="view"]');

let year = 2014;
let selectedState = 'CA';
let timer;
let view = 'gap'; // 'gap' or 'change'

function formatChange(change) {
  // Round first so tiny values show as 0.0°C instead of -0.0°C or +0.0°C
  const rounded = Number(change.toFixed(1)) || 0;
  return (rounded > 0 ? '+' : '') + rounded.toFixed(1) + '°C';
}

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

  // Change = gap minus the state's own 1850-1879 average gap
  for (const state in annual) {
    let total = 0;

    for (let baseYear = 1850; baseYear <= 1879; baseYear++) {
      total += annual[state][baseYear].gap;
    }

    const baseline = total / 30;

    for (const year in annual[state]) {
      annual[state][year].change = annual[state][year].gap - baseline;
    }
  }

  let largestGap = 0;
  let largestChange = 0;

  for (const state in annual) {
    for (const year in annual[state]) {
      const gap = annual[state][year].gap;
      const change = Math.abs(annual[state][year].change);

      if (gap > largestGap) {
        largestGap = gap;
      }

      if (change > largestChange) {
        largestChange = change;
      }
    }
  }

  const upper = Math.ceil(largestGap / 5) * 5;
  const changeLimit = Math.ceil(largestChange / 5) * 5;
  const stateFeatures = topojson.feature(
    geography,
    geography.objects.states
  ).features;
  const states = stateFeatures.filter(function (state) {
    return abbreviations[state.properties.name];
  });

  const gapColor = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, upper]);
  // Purple and green ends have the same lightness, and interpolating in Lab
  // makes lightness change evenly from the light middle to either end.
  // Single years are noisy, so values beyond ±8°C (about 1%) use the end colors
  const changeColor = d3
    .scaleDiverging(
      d3.piecewise(d3.interpolateLab, ['#79319c', '#f7f7f7', '#026025'])
    )
    .domain([-8, 0, 8])
    .clamp(true);

  function color() {
    return view === 'gap' ? gapColor : changeColor;
  }
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
      tooltip.innerHTML = `<strong>${d.properties.name} · ${year}</strong><br>Annual gap: ${value.gap.toFixed(1)}°C<br>Change since 1850–1879: ${formatChange(value.change)}`;
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
    .attr('viewBox', '0 0 500 80')
    .style('max-width', '500px')
    .style('margin', 'auto');

  const gradient = legend
    .append('defs')
    .append('linearGradient')
    .attr('id', 'legend-colors');

  // Words and small bars above each end say what the colors mean.
  // A short bar is a small gap between the hottest and coldest month.
  const ends = [
    { x: 25, anchor: 'start', barHeight: 6 },
    { x: 475, anchor: 'end', barHeight: 18 }
  ];

  const endLabels = legend
    .selectAll('g.end')
    .data(ends)
    .join('g')
    .attr('class', 'end');

  endLabels
    .append('rect')
    .attr('x', (d) => (d.anchor === 'start' ? d.x : d.x - 4))
    .attr('y', (d) => 24 - d.barHeight)
    .attr('width', 4)
    .attr('height', (d) => d.barHeight)
    .attr('fill', '#53666c');

  const endText = endLabels
    .append('text')
    .attr('x', (d) => (d.anchor === 'start' ? d.x + 9 : d.x - 9))
    .attr('y', 22)
    .attr('text-anchor', (d) => d.anchor)
    .attr('font-size', 13)
    .attr('fill', '#1c343d');

  const middleText = legend
    .append('text')
    .attr('x', 250)
    .attr('y', 22)
    .attr('text-anchor', 'middle')
    .attr('font-size', 12)
    .attr('fill', '#53666c');

  legend
    .append('rect')
    .attr('x', 25)
    .attr('y', 30)
    .attr('width', 450)
    .attr('height', 12)
    .attr('fill', 'url(#legend-colors)');

  const legendAxis = legend.append('g').attr('transform', 'translate(0,42)');

  function drawLegend() {
    const min = view === 'gap' ? 0 : -8;
    const max = view === 'gap' ? upper : 8;

    if (view === 'gap') {
      endText.text((d, i) => (i === 0 ? 'Small gap' : 'Large gap'));
      middleText.text('');
    } else {
      endText.text((d, i) => (i === 0 ? '◀ Gap narrowed' : 'Gap widened ▶'));
      middleText.text('No change');
    }

    gradient.selectAll('stop').remove();

    for (let step = 0; step <= 10; step++) {
      const fraction = step / 10;

      gradient
        .append('stop')
        .attr('offset', fraction)
        .attr('stop-color', color()(min + fraction * (max - min)));
    }

    const legendScale = d3.scaleLinear().domain([min, max]).range([25, 475]);

    legendAxis.call(
      d3
        .axisBottom(legendScale)
        .ticks(view === 'gap' ? 5 : 8)
        .tickFormat((d) => (view === 'change' && d > 0 ? '+' : '') + d + '°C')
    );
  }

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
  const y = d3.scaleLinear().range([265, 20]);

  chart
    .append('g')
    .attr('transform', 'translate(0,265)')
    .call(d3.axisBottom(x).ticks(7).tickFormat(d3.format('d')));

  const yAxis = chart.append('g').attr('transform', 'translate(58,0)');

  const zeroLine = chart
    .append('line')
    .attr('x1', 58)
    .attr('x2', 875)
    .attr('stroke', '#9aa8ac');

  const yLabel = chart
    .append('text')
    .attr('x', 58)
    .attr('y', 12)
    .attr('font-size', 12)
    .attr('fill', '#53666c');

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

  // Average of one measure ('hot', 'cold', 'gap' or 'change') over a span of years
  function average(state, measure, start, end) {
    let total = 0;

    for (let eraYear = start; eraYear <= end; eraYear++) {
      const summary = annual[state][eraYear];
      total +=
        measure === 'gap' || measure === 'change'
          ? summary[measure]
          : summary[measure].temp;
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
      .classed('gap-measure', measure === 'gap')
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
        color()(annual[abbreviations[d.properties.name]][year][view])
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
    document.querySelector('#gap-change').textContent = formatChange(value.change);
    document.querySelector('#detail-note').textContent =
      `${name} · ${year}. The orange marker shows the selected year.`;
    document
      .querySelector('#trend')
      .setAttribute(
        'aria-label',
        view === 'gap'
          ? `${name}: annual temperature gap, 1850 to 2014`
          : `${name}: change in annual temperature gap since 1850–1879`
      );

    const history = [];

    for (let chartYear = 1850; chartYear <= 2014; chartYear++) {
      history.push({
        year: chartYear,
        value: annual[selectedState][chartYear][view]
      });
    }

    const drawLine = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.value));

    line.attr('d', drawLine(history));

    // 30-year averages on the line chart (of the gap or of the change,
    // matching the map view), and the matching row in section 03
    const eraAverage = (d) => average(selectedState, view, d.start, d.end);

    eraLines
      .attr('y1', (d) => y(eraAverage(d)))
      .attr('y2', (d) => y(eraAverage(d)));
    eraLabels
      // Label sits at the top or bottom, whichever is away from the line
      .attr('y', (d) => (y(eraAverage(d)) < (20 + 265) / 2 ? 256 : 34))
      .text(
        (d) =>
          `${d.start}–${d.end} avg: ` +
          (view === 'gap'
            ? eraAverage(d).toFixed(1) + '°C'
            : formatChange(eraAverage(d)))
      );
    changeRows.classed('selected', (d) => d.state === selectedState);
    cursor.attr('x1', x(year)).attr('x2', x(year));
    dot.attr('cx', x(year)).attr('cy', y(value[view]));
  }

  // Switch the map, legend and line chart between gap and change
  function setView(newView) {
    view = newView;

    if (view === 'gap') {
      y.domain([0, upper]);
      yLabel.text('Annual gap (°C)');
      mapNote.textContent =
        'The color scale stays fixed across all years. Alaska and Hawaii appear as insets. Darker color means a larger gap, not faster warming.';
    } else {
      y.domain([-changeLimit, changeLimit]);
      yLabel.text('Change in gap since 1850–1879 (°C)');
      mapNote.textContent =
        'Each state is compared with its own 1850–1879 average gap. Green means the gap widened, purple means it narrowed. Single years jump around, so look for colors that persist.';
    }

    yAxis.call(
      d3
        .axisLeft(y)
        .ticks(5)
        .tickFormat((d) => (view === 'change' && d > 0 ? '+' : '') + d)
    );
    zeroLine.attr('y1', y(0)).attr('y2', y(0)).attr('opacity', view === 'change' ? 1 : 0);
    drawLegend();
    update();
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

  for (const button of viewButtons) {
    button.addEventListener('change', () => setView(button.value));
  }

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

  for (const button of viewButtons) {
    button.disabled = false;
  }

  document.querySelector('#status').hidden = true;
  setView(view);
}

start().catch((error) => {
  document.querySelector('#status').textContent =
    'Could not load the visualization. Open this folder in VS Code and use Live Server. Keep the data folder, map JSON, and vendor folder together.';
  console.error(error);
});
