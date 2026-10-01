// DayLog: shared behaviour for the Today and History pages.
//
// The server renders all the HTML. This script only:
//   1. opens the entry sheets, either empty with sensible defaults (add) or pre-filled (edit),
//   2. sends the entry to the JSON API,
//   3. re-fetches the page's rendered content (?handler=Content) and swaps it in.
// Click and submit handlers are attached to `document` (event delegation), so they keep
// working after the content is replaced.
(() => {
  'use strict';

  const content = document.getElementById('day-content');

  /** Page data embedded by the server (see DayClientState.cs). Re-read each time: it changes after a refresh. */
  const state = () => JSON.parse(document.getElementById('day-state').textContent);

  // ---------------------------------------------------------------- time helpers

  /**
   * Current date and time in the app's configured zone (Asia/Dubai), as 'yyyy-MM-dd' and 'HH:mm'.
   * Uses Intl instead of the phone's local clock zone, so a phone set to another zone still logs Dubai time.
   */
  function zonedNow() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: state().timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }

  /** The day new entries go on: today's real date on the Today page, the selected day on History. */
  const pageDate = () => (state().isToday ? zonedNow().date : state().date);

  /** Default time for a new entry: now on today, midday on a past day (you'll usually change it). */
  const defaultTime = () => (state().isToday ? zonedNow().time : '12:00');

  /** The local, offset-free format the API expects: '2026-10-01T13:05:00'. */
  const localIso = (date, time) => `${date}T${time}:00`;

  function addDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  /** Minutes since epoch for a wall-clock date+time, ignoring zones (only used for differences). */
  function wallMinutes(date, time) {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    return Date.UTC(y, mo - 1, d, h, mi) / 60000;
  }

  function formatDuration(minutes) {
    minutes = Math.max(0, Math.round(minutes));
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  // ---------------------------------------------------------------- API

  class ValidationError extends Error {
    constructor(errors) {
      super('Please check the highlighted fields.');
      this.errors = errors;
    }
  }

  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Typical on the metro: no signal. The sheet stays open so nothing typed is lost.
      throw new Error("Couldn't reach Daywise. Check your connection and try again.");
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    if (res.status === 400) throw new ValidationError((await res.json()).errors ?? {});
    if (res.status === 404) throw new Error('That entry no longer exists. It may have been deleted.');
    throw new Error(`Something went wrong (HTTP ${res.status}).`);
  }

  /** Re-renders this page's dynamic content from the server. */
  async function refresh() {
    const url = new URL(location.href);
    url.searchParams.set('handler', 'Content');
    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' } });
      if (res.ok) {
        content.innerHTML = await res.text();
        tickElapsed();
      }
    } catch { /* offline: keep showing what we have */ }
  }

  // ---------------------------------------------------------------- toast

  const toast = document.getElementById('toast');
  let toastTimer;

  function showToast(text, undo) {
    toast.querySelector('[data-toast-text]').textContent = text;
    const button = toast.querySelector('[data-toast-action]');
    button.hidden = !undo;
    button.onclick = undo ? async () => { hideToast(); await undo(); } : null;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 6000 : 2500);
  }

  function hideToast() { toast.hidden = true; }

  // ---------------------------------------------------------------- form helpers

  const field = (form, name) => form.elements.namedItem(name);
  const val = (form, name) => field(form, name)?.value ?? '';
  const checked = (form, name) => !!field(form, name)?.checked;

  /** Sets one field by name, whatever its kind (radio group, checkbox, text/number/time). */
  function setField(form, name, value) {
    const el = field(form, name);
    if (!el) return;
    if (el instanceof RadioNodeList || el.type === 'radio') {
      const radio = form.querySelector(`input[name="${name}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else if (el.type === 'checkbox') {
      el.checked = !!value;
    } else {
      el.value = value ?? '';
    }
  }

  /** Fills a form from an object whose keys match field names (that's how DayClientState is shaped). */
  const fill = (form, values) => Object.entries(values).forEach(([name, value]) => setField(form, name, value));

  function guessMealType(time) {
    if (time < '10:30') return 'Breakfast';
    if (time < '15:30') return 'Lunch';
    if (time < '18:00') return 'Snack';
    return 'Dinner';
  }

  const autoMg = form => {
    const type = form.querySelector('input[name="type"]:checked');
    return type ? Math.round(type.dataset.mg * (Number(val(form, 'servings')) || 1)) : null;
  };

  function updateCaffeineEstimate(form) {
    const mg = autoMg(form);
    field(form, 'caffeineMg').placeholder = mg === null ? 'auto' : `auto (~${mg})`;
  }

  function updateSleepDuration(form) {
    const bed = val(form, 'bedTime'), wake = val(form, 'wakeTime');
    const out = form.querySelector('[data-sleep-duration]');
    if (!bed || !wake || bed === wake) { out.textContent = ''; return; }
    // Same rule as the server: a bedtime later on the clock than the wake time was the evening before.
    const minutes = wallMinutes('2000-01-02', wake) - wallMinutes(bed > wake ? '2000-01-01' : '2000-01-02', bed);
    out.textContent = `That's ${formatDuration(minutes)} of sleep.`;
  }

  function updateActivityMode(form) {
    if (form.closest('dialog').classList.contains('editing')) return; // edit mode keeps "Save changes"
    form.querySelector('.btn-save').textContent = checked(form, 'finished') ? 'Log activity' : 'Start';
  }

  function clearErrors(form) {
    form.querySelector('.form-errors').replaceChildren();
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  }

  function showErrors(form, error) {
    const box = form.querySelector('.form-errors');
    const messages = error instanceof ValidationError
      ? Object.entries(error.errors).flatMap(([name, list]) => {
          form.querySelectorAll(`[name="${name}"]`).forEach(el => el.setAttribute('aria-invalid', 'true'));
          return list;
        })
      : [error.message];
    box.replaceChildren(...messages.map(m => Object.assign(document.createElement('p'), { textContent: m })));
  }

  // ---------------------------------------------------------------- sheets: open

  /** Defaults for a NEW entry: the page's day, "now", your last values, a guessed meal type. */
  const defaults = {
    checkin(form, s) {
      const [energy, sleepiness, mood] = s.lastCheckIn;
      fill(form, { energy, sleepiness, mood, time: defaultTime() });
    },
    meal(form) {
      const time = defaultTime();
      fill(form, { mealType: guessMealType(time), size: 'Normal', time });
    },
    caffeine(form) {
      fill(form, { type: 'Espresso', servings: 1, time: defaultTime() });
    },
    water(form) {
      fill(form, { glasses: 1, time: defaultTime() });
    },
    activity(form, s) {
      // On a past day you're logging something that already happened, so it's "finished" by default.
      const time = defaultTime();
      fill(form, { startTime: time, endTime: s.isToday ? time : '13:00', finished: !s.isToday });
    },
    sleep(form, s) {
      const now = zonedNow().time;
      fill(form, { bedTime: '23:30', wakeTime: s.isToday && now < '11:00' ? now : '07:00', quality: 3, timesWoken: 0 });
    },
    reflection(form) {
      fill(form, { dayRating: 3 });
    },
  };

  /**
   * Opens a sheet. `key` ("meal-12") means edit that entry. Sleep and reflection are one per day,
   * so they're in edit mode automatically when the day already has one.
   */
  function openSheet(name, key) {
    const s = state();
    const dialog = document.getElementById(`sheet-${name}`);
    const form = dialog.querySelector('form');
    form.reset();
    clearErrors(form);

    let values = key ? s.entries[key] : null;
    let deleteKey = key ?? null;
    if (name === 'sleep' && s.sleep) { values = s.sleep; deleteKey = `sleep-${s.sleep.id}`; }
    if (name === 'reflection' && s.reflection) { values = s.reflection; deleteKey = `reflection-${s.reflection.id}`; }

    if (values) {
      fill(form, values);
      // Show a stored caffeine amount only if it was overridden; otherwise leave it on "auto",
      // so changing the type or servings while editing re-estimates it.
      if (name === 'caffeine' && values.caffeineMg === autoMg(form)) setField(form, 'caffeineMg', '');
      // Hidden-but-required fields need a value, or the browser blocks saving:
      // a running activity has no end time yet, a skipped meal has no size.
      if (name === 'activity' && !val(form, 'endTime')) setField(form, 'endTime', defaultTime());
      if (name === 'meal' && !val(form, 'size')) setField(form, 'size', 'Normal');
    } else {
      defaults[name](form, s);
    }

    const editing = !!values;
    dialog.classList.toggle('editing', editing);
    dialog.dataset.key = key ?? '';
    dialog.dataset.deleteKey = deleteKey ?? '';
    dialog.dataset.date = values?.date ?? pageDate();
    const title = dialog.querySelector('[data-title-add]');
    title.textContent = editing ? title.dataset.titleEdit : title.dataset.titleAdd;
    const save = form.querySelector('.btn-save');
    save.textContent = editing ? save.dataset.saveEdit : save.dataset.saveAdd;

    if (name === 'caffeine') updateCaffeineEstimate(form);
    if (name === 'sleep') updateSleepDuration(form);
    if (name === 'activity') updateActivityMode(form);
    dialog.showModal();
  }

  // ---------------------------------------------------------------- sheets: submit

  /**
   * Builds [method, url, body] from a sheet. `ctx` has the entry's date and, when editing, its id.
   * New entries POST to the collection; edits PUT to /api/{type}/{id}.
   */
  const target = (path, id) => (id ? ['PUT', `${path}/${id}`] : ['POST', path]);

  const requests = {
    checkin: (f, { date, id }) => [...target('/api/checkins', id), {
      time: localIso(date, val(f, 'time')),
      energy: +val(f, 'energy'), sleepiness: +val(f, 'sleepiness'), mood: +val(f, 'mood'),
      note: val(f, 'note') || null,
    }],

    meal: (f, { date, id }) => [...target('/api/meals', id), {
      time: localIso(date, val(f, 'time')),
      mealType: val(f, 'mealType'),
      skipped: checked(f, 'skipped'),
      description: val(f, 'description') || null,
      size: val(f, 'size') || null,
    }],

    caffeine: (f, { date, id }) => [...target('/api/caffeine', id), {
      time: localIso(date, val(f, 'time')),
      type: val(f, 'type'),
      servings: Number(val(f, 'servings')) || 1,
      caffeineMg: val(f, 'caffeineMg') === '' ? null : Number(val(f, 'caffeineMg')),
    }],

    water: (f, { date, id }) => [...target('/api/water', id), {
      time: localIso(date, val(f, 'time')),
      glasses: Number(val(f, 'glasses')) || 1,
    }],

    activity: (f, { date, id }) => {
      const start = val(f, 'startTime'), end = val(f, 'endTime');
      // An end time earlier on the clock than the start means it ran past midnight.
      const endDate = end < start ? addDays(date, 1) : date;
      return [...target('/api/activities', id), {
        startTime: localIso(date, start),
        endTime: checked(f, 'finished') ? localIso(endDate, end) : null,
        category: val(f, 'category'),
        notes: val(f, 'notes') || null,
      }];
    },

    // Sleep and reflection are "one per day", so the same PUT creates or updates.
    sleep: (f, { date }) => ['PUT', '/api/sleep', {
      wakeDate: date,
      bedTime: `${val(f, 'bedTime')}:00`,
      wakeTime: `${val(f, 'wakeTime')}:00`,
      quality: +val(f, 'quality'),
      timesWoken: Number(val(f, 'timesWoken')) || 0,
      notes: val(f, 'notes') || null,
    }],

    reflection: (f, { date }) => ['PUT', '/api/reflections', {
      date,
      wentWell: val(f, 'wentWell') || null,
      didntGoWell: val(f, 'didntGoWell') || null,
      doDifferently: val(f, 'doDifferently') || null,
      dayRating: +val(f, 'dayRating'),
    }],
  };

  const savedMessages = {
    checkin: 'Check-in saved', meal: 'Meal saved', caffeine: 'Caffeine logged', water: 'Water saved',
    activity: 'Activity saved', sleep: 'Sleep saved', reflection: 'Reflection saved',
  };

  document.addEventListener('submit', async event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    clearErrors(form);

    // Browser-side check for empty required fields first, so obvious mistakes don't need a round trip.
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const dialog = form.closest('dialog');
    const name = form.dataset.form;
    const id = dialog.dataset.key ? dialog.dataset.key.split('-')[1] : null;
    const button = form.querySelector('.btn-save');
    button.disabled = true;
    try {
      const [method, url, body] = requests[name](form, { date: dialog.dataset.date, id });
      await api(method, url, body);
      dialog.close();
      showToast(dialog.classList.contains('editing') ? 'Changes saved' : savedMessages[name]);
      await refresh();
    } catch (error) {
      showErrors(form, error);
    } finally {
      button.disabled = false;
    }
  });

  // Live hints inside sheets.
  document.addEventListener('input', event => {
    const form = event.target.form;
    if (!form) return;
    if (form.dataset.form === 'caffeine') updateCaffeineEstimate(form);
    if (form.dataset.form === 'sleep') updateSleepDuration(form);
    if (form.dataset.form === 'activity') updateActivityMode(form);
  });

  // ---------------------------------------------------------------- delete

  /** key = "meal-12" → DELETE /api/entries/meal/12 */
  async function deleteByKey(key, dialog) {
    if (!key || !confirm('Delete this entry? This can\'t be undone.')) return;
    const [kind, id] = key.split('-');
    try {
      await api('DELETE', `/api/entries/${kind}/${id}`);
      dialog?.close();
      showToast('Deleted');
      await refresh();
    } catch (error) {
      showToast(error.message);
    }
  }

  // ---------------------------------------------------------------- timeline detail sheet

  function showDetail(item) {
    const dialog = document.getElementById('sheet-detail');
    dialog.querySelector('[data-detail-text]').textContent = item.dataset.detail;
    // EntryKind names ("CheckIn") lower-cased match the sheet names and the API's kind names.
    dialog.dataset.kind = item.dataset.kind.toLowerCase();
    dialog.dataset.id = item.dataset.id;
    dialog.showModal();
  }

  function editFromDetail() {
    const dialog = document.getElementById('sheet-detail');
    const { kind, id } = dialog.dataset;
    dialog.close();
    openSheet(kind, kind === 'sleep' ? null : `${kind}-${id}`);
  }

  // ---------------------------------------------------------------- one-tap actions (Today page)

  async function addWater() {
    const now = zonedNow();
    try {
      const { id } = await api('POST', '/api/water', { time: localIso(now.date, now.time), glasses: 1 });
      await refresh();
      showToast('💧 +1 glass', async () => {
        await api('DELETE', `/api/entries/water/${id}`);
        await refresh();
      });
    } catch (error) {
      showToast(error.message);
    }
  }

  async function stopActivity(id) {
    const now = zonedNow();
    try {
      await api('POST', `/api/activities/${id}/stop`, { endTime: localIso(now.date, now.time) });
      showToast('Activity stopped');
      await refresh();
    } catch (error) {
      showToast(error instanceof ValidationError ? Object.values(error.errors).flat()[0] : error.message);
    }
  }

  // ---------------------------------------------------------------- click routing

  document.addEventListener('click', event => {
    const target = event.target;

    // Tapping the dimmed backdrop closes a sheet (the click lands on the <dialog> itself).
    if (target instanceof HTMLDialogElement) { target.close(); return; }

    const el = target.closest('[data-open], [data-close], [data-action], .tl-item');
    if (!el) return;

    if (el.matches('[data-open]')) openSheet(el.dataset.open, el.dataset.key);
    else if (el.matches('[data-close]')) el.closest('dialog').close();
    else if (el.matches('.tl-item')) showDetail(el);
    else switch (el.dataset.action) {
      case 'water': addWater(); break;
      case 'stop-activity': stopActivity(el.dataset.id); break;
      case 'edit-detail': editFromDetail(); break;
      case 'delete-detail': {
        const d = document.getElementById('sheet-detail');
        deleteByKey(`${d.dataset.kind}-${d.dataset.id}`, d);
        break;
      }
      case 'delete-current': {
        const d = el.closest('dialog');
        deleteByKey(d.dataset.deleteKey, d);
        break;
      }
    }
  });

  // ---------------------------------------------------------------- running activity timer

  function tickElapsed() {
    const now = zonedNow();
    document.querySelectorAll('[data-elapsed]').forEach(el => {
      const [date, time] = el.dataset.elapsed.split('T');
      el.textContent = formatDuration(wallMinutes(now.date, now.time) - wallMinutes(date, time.slice(0, 5)));
    });
  }

  tickElapsed();
  setInterval(tickElapsed, 30_000);

  // ---------------------------------------------------------------- home-screen shortcuts
  // The installed app's long-press shortcuts open /?quick=checkin (or meal, caffeine, water).
  // Remove the parameter first, so reloading the page doesn't log a second glass of water.
  const quick = new URLSearchParams(location.search).get('quick');
  if (quick && state().isToday) {
    history.replaceState(null, '', location.pathname);
    if (quick === 'water') addWater();
    else if (defaults[quick]) openSheet(quick);
  }

  // When you come back to the tab (e.g. unlock your phone), refresh so totals and "now" are current.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) refresh();
  });

  // Phone browsers keep recently left pages frozen in memory ("back/forward cache"), so pressing
  // Back can show a snapshot taken before you logged something on another page. Refresh then too,
  // and close any sheet that was left open.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    refresh();
  });
})();
