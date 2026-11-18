import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Shared data, loaded once. Every figure imports it from here:
//   import { data } from './data.js';
// One row per state, year and month: { state, abbr, year, month, temp_c }
export const data = await d3.csv('data/state_monthly_tas.csv', (d) => ({
  state: d.state,
  abbr: d.abbr,
  year: +d.year,
  month: +d.month,
  temp_c: +d.temp_c,
}));
