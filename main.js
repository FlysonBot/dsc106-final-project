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
