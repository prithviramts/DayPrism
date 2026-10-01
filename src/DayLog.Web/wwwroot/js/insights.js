// DayLog: Insights charts.
//
// All numbers are computed on the server (InsightsService.cs) and embedded as JSON. This file
// only turns them into Chart.js charts. Colours come from the CSS variables in site.css, so the
// charts follow light/dark mode; they're rebuilt when the theme changes.
(() => {
  'use strict';

  const data = JSON.parse(document.getElementById('insights-data').textContent);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let charts = [];

  // ---------------------------------------------------------------- formatting

  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** 6.98 → "6h 59m" */
  function hm(hours) {
    const total = Math.round(hours * 60);
    const h = Math.floor(total / 60), m = total % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  /** Clock time from "hours after 18:00" (the sleep chart's scale): 5.5 → "23:30". */
  function clockFromSixPm(value) {
    const minutes = Math.round((18 + value) * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  /** Clock time from hours since midnight: 15.25 → "15:15". */
  const clock = hours => clockFromSixPm(hours - 18 + 24);

  /** '2026-09-24' → 'Thu 24' (dates are calendar dates, so format in UTC to avoid shifting). */
  const dayLabel = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  // Own month names: some browsers' en-GB locale says "Sept", the server-rendered pages say "Sep".
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = iso => `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]}`;

  /** Drops items before the first one that has data, so a range that starts before you began logging doesn't open with blank space. */
  function dropLeading(items, hasData) {
    const first = items.findIndex(hasData);
    return first < 0 ? [] : items.slice(first);
  }

  // ---------------------------------------------------------------- shared chart setup

  function theme() {
    return {
      text: cssVar('--text-2'),
      muted: cssVar('--muted'),
      grid: cssVar('--grid'),
      surface: cssVar('--surface'),
      s1: cssVar('--series-1'),
      s2: cssVar('--series-2'),
      family: key => cssVar(`--fam-${key}`),
    };
  }

  function applyDefaults(t) {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = t.text;
    Chart.defaults.borderColor = t.grid;
    Chart.defaults.maintainAspectRatio = false;
    // Change only the duration. Replacing the whole `animation` object drops Chart.js's default
    // easing, and every animation frame then throws "this._fn is not a function".
    if (reduceMotion) Chart.defaults.animation = false;
    else Chart.defaults.animation.duration = 400;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.elements.bar.borderRadius = 4;
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.elements.point.radius = 4;      // 8px markers
    Chart.defaults.elements.point.hoverRadius = 6;
  }

  /** A recessive axis: hairline grid, no axis border, muted ticks. */
  const axis = (t, extra = {}) => ({
    grid: { color: t.grid, drawTicks: false },
    border: { display: false },
    ticks: { color: t.muted, padding: 6 },
    ...extra,
  });

  const ratingAxis = (t, title) => axis(t, {
    min: 0, max: 5,
    ticks: { color: t.muted, padding: 6, stepSize: 1 },
    title: title ? { display: true, text: title, color: t.muted } : undefined,
  });

  function make(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return; // server rendered no chart (no data)
    charts.push(new Chart(canvas, config));
  }

  // ---------------------------------------------------------------- the charts

  function build() {
    charts.forEach(c => c.destroy());
    charts = [];
    const t = theme();
    applyDefaults(t);

    // 1. Sleep: one floating bar per night, from bedtime (top) to wake time (bottom).
    //    The bar's length is the sleep duration, so one chart shows all three.
    const nights = data.nights;
    if (nights.length) {
      // Whole, even hours so the 2-hourly clock ticks land exactly on the axis.
      const lo = Math.floor(Math.min(...nights.map(n => n.bed)) / 2) * 2;
      const hi = Math.ceil(Math.max(...nights.map(n => n.wake)) / 2) * 2;
      make('chart-sleep', {
        type: 'bar',
        data: {
          labels: nights.map(n => dayLabel(n.date)),
          datasets: [{
            label: 'Sleep',
            data: nights.map(n => [n.bed, n.wake]),
            backgroundColor: t.s1,
            borderSkipped: false,
            maxBarThickness: 22,
          }],
        },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: items => `Night ending ${dayLabel(nights[items[0].dataIndex].date)}`,
                label: item => {
                  const n = nights[item.dataIndex];
                  return `${n.bedTime} → ${n.wakeTime} · ${hm(n.hours)} · quality ${n.quality}/5`;
                },
              },
            },
          },
          scales: {
            x: axis(t, { grid: { display: false }, ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 10 } }),
            y: axis(t, {
              reverse: true, min: lo, max: hi,
              ticks: { color: t.muted, padding: 6, stepSize: 1, callback: v => (Number.isInteger(v) && v % 2 === 0 ? clockFromSixPm(v) : '') },
            }),
          },
        },
      });
    }

    // 2. Energy and sleepiness by hour. Linear x axis so missing hours leave real gaps.
    const hourly = data.hourly;
    if (hourly.length) {
      const counts = Object.fromEntries(hourly.map(h => [h.hour, h.checkIns]));
      make('chart-hourly', {
        type: 'line',
        data: {
          datasets: [
            { label: 'Energy', data: hourly.map(h => ({ x: h.hour, y: h.energy })), borderColor: t.s1, backgroundColor: t.s1, tension: 0.25 },
            { label: 'Sleepiness', data: hourly.map(h => ({ x: h.hour, y: h.sleepiness })), borderColor: t.s2, backgroundColor: t.s2, tension: 0.25 },
          ],
        },
        options: {
          interaction: { mode: 'nearest', axis: 'x', intersect: false },
          plugins: {
            legend: { position: 'top', align: 'start' },
            tooltip: {
              callbacks: {
                title: items => `${String(items[0].parsed.x).padStart(2, '0')}:00–${String(items[0].parsed.x).padStart(2, '0')}:59`,
                label: item => `${item.dataset.label}: ${item.parsed.y.toFixed(1)}`,
                footer: items => `${counts[items[0].parsed.x]} check-ins`,
              },
            },
          },
          scales: {
            x: axis(t, {
              type: 'linear',
              min: Math.max(0, Math.floor((Math.min(...hourly.map(h => h.hour)) - 1) / 2) * 2),
              max: Math.min(24, Math.ceil((Math.max(...hourly.map(h => h.hour)) + 1) / 2) * 2),
              ticks: { color: t.muted, padding: 6, stepSize: 2, callback: v => `${String(v).padStart(2, '0')}:00` },
            }),
            y: axis(t, { min: 1, max: 5, ticks: { color: t.muted, padding: 6, stepSize: 1 } }),
          },
        },
      });
    }

    // Grouped bars for the "compare groups of days" charts. Each label carries its day count.
    const groupLabel = (label, days) => [label, `${days} day${days === 1 ? '' : 's'}`];

    // 3. Energy and sleepiness the day after short vs long nights.
    const buckets = data.sleepBuckets;
    if (buckets.some(b => b.days > 0)) {
      make('chart-sleepenergy', {
        type: 'bar',
        data: {
          labels: buckets.map(b => groupLabel(b.label, b.days)),
          datasets: [
            { label: 'Energy', data: buckets.map(b => b.energy), backgroundColor: t.s1, maxBarThickness: 36 },
            { label: 'Sleepiness', data: buckets.map(b => b.sleepiness), backgroundColor: t.s2, maxBarThickness: 36 },
          ],
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', align: 'start' },
            tooltip: { callbacks: { label: item => `${item.dataset.label}: ${item.parsed.y?.toFixed(1) ?? 'no data'}` } },
          },
          scales: { x: axis(t, { grid: { display: false } }), y: ratingAxis(t, 'avg (1–5)') },
          datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9 } },
        },
      });
    }

    // 4. Last caffeine vs that night's sleep: one dot per day.
    const points = data.caffeinePoints;
    if (points.length) {
      make('chart-caffeine', {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Days',
            data: points.map(p => ({ x: p.lastCaffeineHour, y: p.nightSleepHours })),
            backgroundColor: t.s1,
            borderColor: t.surface, // 2px surface ring keeps overlapping dots distinct
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
          }],
        },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: items => dayLabel(points[items[0].dataIndex].date),
                label: item => {
                  const p = points[item.dataIndex];
                  return `Last caffeine ${p.lastCaffeineTime} → slept ${hm(p.nightSleepHours)}, quality ${p.nightQuality}/5`;
                },
              },
            },
          },
          scales: {
            x: axis(t, {
              type: 'linear',
              min: Math.max(4, Math.floor((Math.min(...points.map(p => p.lastCaffeineHour)) - 1) / 2) * 2),
              max: Math.min(24, Math.ceil((Math.max(...points.map(p => p.lastCaffeineHour)) + 1) / 2) * 2),
              ticks: { color: t.muted, padding: 6, stepSize: 2, callback: v => clock(v) },
              title: { display: true, text: 'time of last caffeine', color: t.muted },
            }),
            y: axis(t, {
              ticks: { color: t.muted, padding: 6, callback: v => `${v}h` },
              title: { display: true, text: 'sleep that night', color: t.muted },
            }),
          },
        },
      });
    }

    // 5. Breakfast vs energy before noon: one series, two bars.
    const breakfast = data.breakfast;
    if (breakfast.some(b => b.days > 0)) {
      make('chart-breakfast', {
        type: 'bar',
        data: {
          labels: breakfast.map(b => groupLabel(b.label, b.days)),
          datasets: [{ label: 'Energy before noon', data: breakfast.map(b => b.morningEnergy), backgroundColor: t.s1, maxBarThickness: 48 }],
        },
        options: {
          indexAxis: 'y', // horizontal: long labels read better on a phone
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: item => `Energy before noon: ${item.parsed.x?.toFixed(1) ?? 'no data'}` } },
          },
          scales: { y: axis(t, { grid: { display: false } }), x: ratingAxis(t, 'avg energy (1–5)') },
        },
      });
    }

    // 6. Hours per week, stacked by activity family (same colours as the timeline).
    const weeks = dropLeading(data.weeks, w => Object.values(w.hoursByCategory).some(h => h > 0));
    if (weeks.some(w => Object.values(w.hoursByCategory).length)) {
      const families = data.families;
      make('chart-activity', {
        type: 'bar',
        data: {
          labels: weeks.map(w => `${shortDate(w.weekStart)}${w.partial ? '*' : ''}`),
          datasets: families.map(f => ({
            label: f.label,
            data: weeks.map(w => w.hoursByFamily[f.key] ?? 0),
            backgroundColor: t.family(f.key),
            borderColor: t.surface, // surface-coloured edge = 2px gap between stacked segments
            borderWidth: { top: 2 },
            borderSkipped: false,
            borderRadius: 0,
            maxBarThickness: 40,
          })),
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', align: 'start' },
            tooltip: {
              filter: item => item.parsed.y > 0,
              callbacks: {
                title: items => `Week of ${shortDate(weeks[items[0].dataIndex].weekStart)}${weeks[items[0].dataIndex].partial ? ' (partial)' : ''}`,
                label: item => `${item.dataset.label}: ${item.parsed.y.toFixed(1)}h`,
                footer: items => `Total: ${items.reduce((sum, i) => sum + i.parsed.y, 0).toFixed(1)}h`,
              },
            },
          },
          scales: {
            x: axis(t, { stacked: true, grid: { display: false } }),
            y: axis(t, { stacked: true, ticks: { color: t.muted, padding: 6, callback: v => `${v}h` } }),
          },
        },
      });
    }

    // 7. Day rating: each day as a muted dot, the 7-day average as the emphasised line.
    const ratings = dropLeading(data.ratings, r => r.rating !== null);
    if (ratings.some(r => r.rating !== null)) {
      make('chart-rating', {
        type: 'line',
        data: {
          labels: ratings.map(r => dayLabel(r.date)),
          datasets: [
            { label: 'Day rating', data: ratings.map(r => r.rating), showLine: false, backgroundColor: t.muted, borderColor: t.muted },
            { label: '7-day average', data: ratings.map(r => r.rollingAverage), borderColor: t.s1, backgroundColor: t.s1, pointRadius: 0, spanGaps: true, tension: 0.3 },
          ],
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', align: 'start' },
            tooltip: { callbacks: { label: item => (item.parsed.y === null ? null : `${item.dataset.label}: ${item.parsed.y.toFixed(1)}`) } },
          },
          scales: {
            x: axis(t, { grid: { display: false }, ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 12 } }),
            y: axis(t, { min: 1, max: 5, ticks: { color: t.muted, padding: 6, stepSize: 1 } }),
          },
        },
      });
    }
  }

  build();
  // Light/dark switch (the layout fires "themechange" after updating data-theme): redraw in the new palette.
  document.addEventListener('themechange', build);
})();
