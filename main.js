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
  return (change > 0 ? '+' : '') + change.toFixed(1) + '°C';
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
    document.querySelector('#change').textContent = formatChange(value.change);
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
