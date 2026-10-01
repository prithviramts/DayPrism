import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import * as repo from '../db/repo';
import { DateOnly, addDays, dateOf, fmtDate, hhmm, hoursBetween, startOf, timeZoneName, withOffset } from '../lib/time';
import { Takeaway, hm } from './insights';
import { ReviewReport, avgOf, avgPerLoggedDay, buildReview, daysLogged } from './review';
import { TrackerInsight, buildTrackerInsights } from './tracker-insights';
import { entriesIn, listTrackers } from './trackers';
import { cycleDaysIn } from './cycle';

// Exports leave the encrypted database only when you ask: the file is written to the app's
// private cache, handed to the Android share sheet, and you choose where it goes.

// ---------------------------------------------------------------- review markdown

/** A review summary meant to be pasted into an AI assistant (or read yourself). */
export function reviewMarkdown(r: ReviewReport, trackers: TrackerInsight[] = []): string {
  const out: string[] = [];
  const line = (t = '') => out.push(t);
  const i = r.insights;
  const one = (v: number | null) => (v == null ? '–' : v.toFixed(1));
  const hmOr = (v: number | null) => (v == null ? '–' : hm(v));
  const mins = (m: number) => (m === 0 ? '–' : m >= 60 ? hm(m / 60) : `${m}m`);
  const inline = (t: string) => t.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  const days = r.days;

  line(`# DayPrism review: ${fmtDate(r.from, 'd MMM')} – ${fmtDate(r.to, 'd MMM yyyy')}`);
  line();
  line('## What I\'d like from you');
  line();
  line('This is a summary of my own daily tracking (sleep, meals, caffeine, water, energy check-ins, activities and end-of-day reflections). Please give me an honest, specific review:');
  line();
  line('1. **What to change**: the few habits that seem to hurt my energy, sleep or day rating most, ranked by likely impact.');
  line('2. **What to improve**: things that are OK but could be better, with a concrete target for each.');
  line('3. **What I\'m doing well**: patterns worth keeping.');
  line('4. **Experiments for the next 30 days**: 2–3 small, measurable changes I can track in DayPrism.');
  line();
  line('Be direct. Use my reflections as well as the numbers. Where a group has only a few days, say the evidence is thin. These are correlations in my own data, not proof of cause and effect.');
  line();
  line('## Context');
  line();
  line(`- Period: ${fmtDate(r.from, 'ddd d MMM yyyy')} to ${fmtDate(r.to, 'ddd d MMM yyyy')} (${days.length} days, ${daysLogged(r)} with entries).`);
  line(`- Time zone: ${timeZoneName()}.`);
  line('- Energy, mood, sleep quality and day rating are 1–5 where **5 is best**. Sleepiness is 1–5 where **5 is very sleepy**.');
  line('- A night\'s sleep belongs to the day I woke up.');
  if (r.to >= r.today) line('- The last day is today and still in progress, so its numbers are incomplete.');
  if (r.demoRows > 0) line(`- ⚠️ **${r.demoRows} entries in this period are demo data, not real.**`);
  line();

  line('## Averages');
  line();
  line('| Measure | Value |');
  line('|---|---|');
  line(`| Sleep per night | ${hmOr(avgOf(r, (d) => d.sleepHours))} (${i.sleep.nights} nights logged) |`);
  line(`| Typical bedtime / wake time | ${i.sleep.avgBedTime ?? '–'} / ${i.sleep.avgWakeTime ?? '–'} |`);
  line(`| Nights under 6h / 7h or more | ${i.sleep.shortNights} / ${i.sleep.longNights} |`);
  line(`| Sleep quality | ${one(avgOf(r, (d) => d.sleepQuality))} / 5 |`);
  line(`| Energy (daily average) | ${one(avgOf(r, (d) => d.avgEnergy))} / 5 |`);
  line(`| Sleepiness | ${one(avgOf(r, (d) => d.avgSleepiness))} / 5 |`);
  line(`| Mood | ${one(avgOf(r, (d) => d.avgMood))} / 5 |`);
  line(`| Day rating | ${one(avgOf(r, (d) => d.dayRating))} / 5 (${days.filter((d) => d.dayRating != null).length} days rated) |`);
  line(`| Caffeine per logged day | ${one(avgPerLoggedDay(r, (d) => d.caffeineDrinks))} drinks, ~${Math.round(avgPerLoggedDay(r, (d) => d.caffeineMg) ?? 0)} mg |`);
  line(`| Days with caffeine after 15:00 | ${days.filter((d) => d.lastCaffeine != null && d.lastCaffeine >= '15:00').length} |`);
  line(`| Skipped meals | ${days.reduce((s, d) => s + d.mealsSkipped, 0)} (breakfast skipped on ${days.filter((d) => d.ateBreakfast === false).length} days) |`);
  line(`| Water per logged day | ${one(avgPerLoggedDay(r, (d) => d.waterGlasses))} glasses |`);
  line(`| Exercise | ${days.filter((d) => d.exerciseMinutes > 0).length} days, ${(days.reduce((s, d) => s + d.exerciseMinutes, 0) / 60).toFixed(1)}h total |`);
  line();

  line('## Patterns found in the data');
  line();
  const pattern = (name: string, t: Takeaway) => line(`- **${name}:** ${t.text}${t.enough ? '' : ' _(not enough data yet)_'}`);
  pattern('Sleep', i.sleepTakeaway);
  pattern('Energy through the day', i.hourlyTakeaway);
  pattern('Short vs long nights', i.sleepVsEnergyTakeaway);
  pattern('Caffeine timing vs sleep', i.caffeineTakeaway);
  pattern('Breakfast vs morning energy', i.breakfastTakeaway);
  pattern('Where the time goes', i.activityTakeaway);
  pattern('Day rating', i.ratingTakeaway);
  line();

  if (trackers.length) {
    line('## My custom trackers');
    line();
    for (const ti of trackers) {
      const goal = ti.goalDays ? `; goal (${ti.tracker.goalDirection === 'at_most' ? 'at most' : 'at least'} ${ti.tracker.goal}${ti.tracker.unit ? ` ${ti.tracker.unit}` : ''}) met on ${ti.goalDays.met} of ${ti.goalDays.counted} days` : '';
      line(`- **${ti.tracker.name}** (logged on ${ti.daysLogged} days; ${ti.summary}${goal}): ${ti.takeaway.text}${ti.takeaway.enough ? '' : ' _(not enough data yet)_'}`);
    }
    line();
  }

  line('## Streaks');
  line();
  line('| Habit | Current | Longest | Days met |');
  line('|---|---|---|---|');
  for (const s of r.streaks) {
    const longest = s.longest > 0 ? `${s.longest} (${fmtDate(s.longestFrom!, 'd MMM')}–${fmtDate(s.longestTo!, 'd MMM')})` : '0';
    line(`| ${s.name} (${s.description}) | ${s.current} | ${longest} | ${s.daysMet} of ${s.daysCounted} |`);
  }
  line();

  line('## Best and hardest days');
  line();
  for (const [title, list] of [['Best days', r.best], ['Hardest days', r.hardest]] as const) {
    line(`### ${title}`);
    line();
    if (list.length === 0) line('_Not enough rated days yet._');
    for (const n of list) {
      line(`- **${fmtDate(n.day.date, 'ddd d MMM')}**: ${n.why}`);
      if (n.day.reflection?.wentWell) line(`  - Went well: ${inline(n.day.reflection.wentWell)}`);
      if (n.day.reflection?.didntGoWell) line(`  - Didn't: ${inline(n.day.reflection.didntGoWell)}`);
    }
    line();
  }

  line('## Day by day');
  line();
  line('| Date | Sleep | Bed–wake | Sleep Q | Energy | Energy before noon | Caffeine (last) | Breakfast | Meals skipped | Water | Exercise | Deep work | Screen time | Day rating |');
  line('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const d of days.filter((x) => x.hasData)) {
    const bedWake = d.bedTime ? `${d.bedTime}–${d.wakeTime}` : '–';
    const caf = d.caffeineDrinks === 0 ? '0' : `${d.caffeineDrinks} (${d.lastCaffeine})`;
    const breakfast = d.ateBreakfast === true ? 'ate' : d.ateBreakfast === false ? 'skipped' : '–';
    line(`| ${fmtDate(d.date, 'ddd d MMM')} | ${hmOr(d.sleepHours)} | ${bedWake} | ${d.sleepQuality ?? '–'} | ${one(d.avgEnergy)} | ${one(d.morningEnergy)} | ${caf} | ${breakfast} | ${d.mealsSkipped} | ${d.waterGlasses} | ${mins(d.exerciseMinutes)} | ${mins(d.deepWorkMinutes)} | ${mins(d.screenTimeMinutes)} | ${d.dayRating ?? '–'} |`);
  }
  line();

  line('## Daily reflections');
  line();
  const withReflection = days.filter((d) => d.reflection);
  if (withReflection.length === 0) line('_No reflections written in this period._');
  for (const d of withReflection) {
    const refl = d.reflection!;
    line(`### ${fmtDate(d.date, 'ddd d MMM')}: day rating ${refl.dayRating}/5`);
    line();
    if (refl.wentWell) line(`- **Went well:** ${inline(refl.wentWell)}`);
    if (refl.didntGoWell) line(`- **Didn't go well:** ${inline(refl.didntGoWell)}`);
    if (refl.doDifferently) line(`- **Do differently tomorrow:** ${inline(refl.doDifferently)}`);
    line();
  }
  line('---');
  line('_Exported from DayPrism._');
  return out.join('\n');
}

// ---------------------------------------------------------------- CSV (one table, every entry type)

const COLUMNS = [
  'kind', 'date', 'start_time', 'end_time', 'start_iso', 'end_iso', 'duration_min',
  'type', 'description', 'size', 'skipped', 'servings', 'caffeine_mg', 'glasses',
  'energy', 'sleepiness', 'mood', 'sleep_quality', 'times_woken', 'day_rating',
  'went_well', 'didnt_go_well', 'do_differently', 'notes', 'tracker', 'value', 'unit', 'is_demo',
] as const;
type Col = (typeof COLUMNS)[number];

/**
 * RFC 4180 escaping. Also defuses "formula injection": text starting with = + - @ would run as
 * a formula in Excel, so it gets a leading apostrophe.
 */
export function csvEscape(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  let v = value;
  if (/^[=+\-@]/.test(v) && Number.isNaN(Number(v))) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Every entry in the range (or all time), in time order. */
export async function buildCsv(from?: DateOnly, to?: DateOnly): Promise<string> {
  const start = from ? startOf(from) : '0000';
  const end = to ? startOf(addDays(to, 1)) : '9999';
  const rows: { sort: string; v: Partial<Record<Col, string | null>> }[] = [];
  const b = (x: boolean) => (x ? 'true' : 'false');

  function add(kind: string, date: string, offset: number | null, s: string | null, e: string | null, v: Partial<Record<Col, string | null>>) {
    v.kind = kind;
    v.date = date;
    if (s) {
      v.start_time = hhmm(s);
      if (offset != null) v.start_iso = withOffset(s, offset);
    }
    if (e) {
      v.end_time = hhmm(e);
      if (offset != null) v.end_iso = withOffset(e, offset);
      if (s) v.duration_min = String(Math.round(hoursBetween(s, e) * 60));
    }
    rows.push({ sort: s ?? `${date}T23:59:59`, v });
  }

  for (const x of await repo.sleepsWaking(start, end))
    add('sleep', dateOf(x.wakeTime), x.utcOffsetMinutes, x.bedTime, x.wakeTime,
      { sleep_quality: String(x.quality), times_woken: String(x.timesWoken), notes: x.notes, is_demo: b(x.isSeed) });
  for (const x of await repo.mealsIn(start, end))
    add('meal', dateOf(x.time), x.utcOffsetMinutes, x.time, null,
      { type: x.mealType, description: x.description, size: x.size, skipped: b(x.skipped), is_demo: b(x.isSeed) });
  for (const x of await repo.caffeineIn(start, end))
    add('caffeine', dateOf(x.time), x.utcOffsetMinutes, x.time, null,
      { type: x.type, servings: String(x.servings), caffeine_mg: String(x.caffeineMg), is_demo: b(x.isSeed) });
  for (const x of await repo.waterIn(start, end))
    add('water', dateOf(x.time), x.utcOffsetMinutes, x.time, null, { glasses: String(x.glasses), is_demo: b(x.isSeed) });
  for (const x of await repo.checkInsIn(start, end))
    add('checkin', dateOf(x.time), x.utcOffsetMinutes, x.time, null,
      { energy: String(x.energy), sleepiness: String(x.sleepiness), mood: String(x.mood), notes: x.note, is_demo: b(x.isSeed) });
  for (const x of await repo.activitiesStarting(start, end))
    add('activity', dateOf(x.startTime), x.utcOffsetMinutes, x.startTime, x.endTime,
      { type: x.category, notes: x.notes, is_demo: b(x.isSeed) });
  for (const x of await repo.reflectionsIn(from ?? '0000-01-01', to ?? '9999-12-31'))
    add('reflection', x.date, null, null, null,
      { day_rating: String(x.dayRating), went_well: x.wentWell, didnt_go_well: x.didntGoWell, do_differently: x.doDifferently, is_demo: b(x.isSeed) });

  const trackers = new Map((await listTrackers(true)).map((t) => [t.id, t]));
  for (const x of await entriesIn(from ?? '0000-01-01', to ?? '9999-12-31')) {
    const tr = trackers.get(x.trackerId);
    if (!tr) continue;
    add('tracker', dateOf(x.time), x.utcOffsetMinutes, x.time, null,
      { tracker: tr.name, type: tr.kind, value: String(x.value), unit: tr.unit, notes: x.note, is_demo: b(x.isSeed) });
  }

  for (const c of await cycleDaysIn(from ?? '0000-01-01', to ?? '9999-12-31')) {
    add('cycle', c.date, null, null, null, { type: c.flow, description: c.symptoms.join('; ') || null, notes: c.note });
  }

  rows.sort((a, c) => (a.sort < c.sort ? -1 : a.sort > c.sort ? 1 : 0));
  const lines = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvEscape(r.v[c])).join(','))];
  // Byte-order mark so Excel shows accents, Arabic and emoji correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- share

async function shareText(fileName: string, content: string, mimeType: string) {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  } finally {
    // Don't leave a plain-text copy lying around once it's been handed over.
    setTimeout(() => { try { if (file.exists) file.delete(); } catch { /* already gone */ } }, 60_000);
  }
}

const stem = (from?: DateOnly, to?: DateOnly) => (from && to ? `dayprism-${from}_to_${to}` : 'dayprism-all-data');

export async function shareReview(from: DateOnly, to: DateOnly) {
  const [review, trackers] = await Promise.all([buildReview(from, to), buildTrackerInsights(from, to)]);
  await shareText(`${stem(from, to)}-review.md`, reviewMarkdown(review, trackers), 'text/markdown');
}

export async function shareCsv(from?: DateOnly, to?: DateOnly) {
  await shareText(`${stem(from, to)}.csv`, await buildCsv(from, to), 'text/csv');
}
