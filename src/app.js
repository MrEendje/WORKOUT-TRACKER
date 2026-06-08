/* ============================================================
   Workout Tracker — app.js
   ============================================================ */

const STORE_KEY = 'workout-tracker:v1';

// Palette for routine colors
const ROUTINE_COLORS = [
  { name: 'Sky',    bg: '#0ea5e9', text: '#fff', light: '#e0f2fe' },
  { name: 'Green',  bg: '#22c55e', text: '#fff', light: '#dcfce7' },
  { name: 'Orange', bg: '#f97316', text: '#fff', light: '#ffedd5' },
  { name: 'Purple', bg: '#a855f7', text: '#fff', light: '#f3e8ff' },
  { name: 'Pink',   bg: '#ec4899', text: '#fff', light: '#fce7f3' },
  { name: 'Red',    bg: '#ef4444', text: '#fff', light: '#fee2e2' },
  { name: 'Teal',   bg: '#14b8a6', text: '#fff', light: '#ccfbf1' },
  { name: 'Amber',  bg: '#f59e0b', text: '#fff', light: '#fef3c7' },
];

const defaultState = {
  exercises: [],
  routines: [],   // {id, name, exercises:[], color: index into ROUTINE_COLORS}
  workouts: [],
  schedules: {},  // date (YYYY-MM-DD) -> routineId
  prs: {}         // exerciseId -> {weight, reps, date}
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultState));
  } catch (e) {
    console.error('Failed to load state', e);
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ── Utilities ───────────────────────────────────────────── */
function uid(prefix = 'id') { return prefix + '-' + Math.random().toString(36).slice(2, 9); }
function todayISO(d = new Date()) { return d.toISOString().slice(0, 10); }
function getRoutineColor(routine) {
  const idx = routine?.colorIndex ?? 0;
  return ROUTINE_COLORS[idx % ROUTINE_COLORS.length];
}

// Tracking types
const TRACKING_TYPES = [
  { value: 'reps',     label: 'Reps',     icon: '🔁', col1: 'Weight (kg)', col2: 'Reps',    ph1: 'kg',  ph2: 'reps', mode1: 'decimal', mode2: 'numeric' },
  { value: 'time',     label: 'Time',     icon: '⏱️', col1: 'Weight (kg)', col2: 'Seconds', ph1: 'kg',  ph2: 'sec',  mode1: 'decimal', mode2: 'numeric' },
  { value: 'distance', label: 'Distance', icon: '📏', col1: 'Distance (m)', col2: 'Seconds', ph1: 'm',   ph2: 'sec',  mode1: 'decimal', mode2: 'numeric' },
];

function getTrackingType(exercise) {
  const tt = exercise?.trackingType || 'reps';
  return TRACKING_TYPES.find(t => t.value === tt) || TRACKING_TYPES[0];
}

/* Emoji auto-pick */
const emojiMap = [
  // --- BORST & PUSH ---
  { k: /bench|press|benchpress|chestpress/i,  e: '🏋️' },
  { k: /pushup|opdrukken/i,                   e: '🤸' },
  { k: /dip|chest-dip|tricep-dip/i,           e: '📉' },
  { k: /fly|flys|pecdeck/i,                   e: '👐' },
  { k: /push|overhead|ohp|shoulderpress/i,    e: '⾾' }, // (Of 🏋️)

  // --- RUG & PULL ---
  { k: /dead|deadlift|rackpull/i,             e: '🏋️' },
  { k: /pullup|chinup|chin-up|pull-up/i,      e: '🧗' },
  { k: /row|rowing|latpulldown|pulldown/i,    e: '🚣' },
  { k: /shrug|traps/i,                        e: '🤷' },

  // --- BENEN (QUADS, HAMSTRINGS, KUITEN) ---
  { k: /squat|hacksquat|legpress/i,           e: '🦵' },
  { k: /lunge|split|bulgarian/i,              e: '🧎' },
  { k: /calf|calves|kuit/i,                   e: '🧍' },
  { k: /extension|leg-extension/i,            e: '🦵' },
  { k: /curl-leg|hamstring/i,                 e: '🫔' }, // Alternatief voor benen achterkant

  // --- ARMEN (BICEPS & TRICEPS) ---
  { k: /curl|bicep|hammer/i,                  e: '💪' },
  { k: /tricep|extension|pushdown|skull/i,    e: '💪' },

  // --- SCHOUDERS ---
  { k: /lateral|raise|delt|rear|front/i,      e: '🪽' },

  // --- BUIKSPIEREN & CORE ---
  { k: /abs|crunch|situp|plank|core|legraise/i, e: '🧱' }, // 'Muur' staat vaak voor 'Abs of steel'

  // --- OLYMPISCH & FUNCTIONEEL ---
  { k: /snatch|clean|jerk|thruster|crossfit/i, e: '🏋️' },
  { k: /kettlebell|swing|snatch-kb/i,         e: '⚱️' }, // Lijkt op een kettlebell
  { k: /rope|battle-rope/i,                   e: '〰️' },
  { k: /slam|ball|slamball|wallball/i,        e: '🏐' },
  { k: /carry|farmer|walk/i,                  e: '🧳' },

  // --- CARDIO ---
  { k: /run|jog|sprint|treadmill|hardlopen/i, e: '🏃' },
  { k: /bike|cycling|cycle|fietsen|spinning/i,e: '🚴' },
  { k: /swim|swimming|zwemmen/i,              e: '🏊' },
  { k: /stair|stepper|stairmaster/i,          e: '🪜' },
  { k: /jump|rope|skipping|touwtjespringen/i, e: '🪢' },
  { k: /elliptical|crosstrainer/i,            e: '⛷️' },
  { k: /walk|wandelen|hike/i,                 e: '🥾' },
  { k: /rower|ergometer/i,                    e: '🚣' },

  // --- BOKSEN & VECHTSPORT ---
  { k: /box|boxing|punch|bag|sparring|kick/i, e: '🥊' },

  // --- FLEXIBILITEIT & METINGEN ---
  { k: /yoga|stretch|mobility|flexibility/i,  e: '🧘' },
  { k: /pilates/i,                            e: '🤸' },

  // --- STANDAARD / RECOVERY ---
  { k: /rest|break|rust/i,                    e: '😴' },
  { k: /sauna|steam/i,                        e: '🧖' }
];
function pickEmoji(name) {
  for (const m of emojiMap) if (m.k.test(name)) return m.e;
  if (/cardio|run|row|bike/i.test(name)) return '🏃';
  return '🏋️';
}

/* ── DOM helpers ─────────────────────────────────────────── */
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

/* ── Navigation ──────────────────────────────────────────── */
let currentView = 'view-dashboard';

function showView(id) {
  document.querySelectorAll('#views > section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  currentView = id;

  // Update bottom nav active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    const isActive = btn.dataset.view === id;
    btn.classList.toggle('active', isActive);
    const icon = btn.querySelector('.nav-icon');
    const label = btn.querySelector('.nav-label');
    if (icon) icon.style.color = isActive ? '#0ea5e9' : '#94a3b8';
    if (label) label.style.color = isActive ? '#0ea5e9' : '#94a3b8';
  });

  // Show/hide FAB
  const fab = document.getElementById('btn-new-workout');
  fab.style.display = id === 'view-dashboard' ? 'flex' : 'none';

  // Render view-specific content
  if (id === 'view-prs') renderPRs();
  if (id === 'view-catalog') { renderCatalog(); renderRoutines(); }
}

/* ── Calendar ────────────────────────────────────────────── */
let calendarDate = new Date();

function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const start = startOfMonth(calendarDate);
  const end = endOfMonth(calendarDate);
  const todayStr = todayISO();

  document.getElementById('month-label').textContent =
    start.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  // Render legend for routines that appear this month
  renderCalendarLegend(start, end);

  const firstDay = start.getDay();
  for (let i = 0; i < firstDay; i++) grid.appendChild(el('div', ''));

  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), d);
    const iso = todayISO(date);
    const isToday = iso === todayStr;
    const workout = state.workouts.find(w => w.date === iso);
    const scheduledRoutineId = state.schedules[iso];
    const routine = scheduledRoutineId
      ? state.routines.find(r => r.id === scheduledRoutineId)
      : null;
    const color = routine ? getRoutineColor(routine) : null;

    const cell = el('button',
      `calendar-day rounded-xl p-1.5 text-left flex flex-col relative overflow-hidden
       ${isToday ? 'ring-2 ring-sky-400' : ''}
       ${workout ? '' : 'bg-slate-50 hover:bg-slate-100'}
       active:scale-95 transition-transform`
    );
    cell.setAttribute('type', 'button');

    // Background tint for scheduled/done
    if (color) {
      cell.style.backgroundColor = color.light;
    }
    if (workout && color) {
      cell.style.backgroundColor = color.bg;
    } else if (workout) {
      cell.style.backgroundColor = '#bae6fd'; // sky-200 fallback
    }

    // Day number
    const dayNum = el('div',
      `text-xs font-semibold leading-none mb-1
       ${isToday ? 'text-sky-600' : workout ? 'text-white' : 'text-slate-700'}`
    );
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    // Indicator dot / icon
    if (workout) {
      const dot = el('div', 'w-2 h-2 rounded-full bg-white/80 mx-auto mt-auto');
      cell.appendChild(dot);
    } else if (routine) {
      const dot = el('div', 'w-2 h-2 rounded-full mx-auto mt-auto');
      dot.style.backgroundColor = color.bg;
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => onDayClick(iso));
    grid.appendChild(cell);
  }
}

function renderCalendarLegend(start, end) {
  const legend = document.getElementById('calendar-legend');
  legend.innerHTML = '';

  const seen = new Set();
  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), d);
    const iso = todayISO(date);
    const rId = state.schedules[iso];
    if (rId && !seen.has(rId)) {
      seen.add(rId);
      const routine = state.routines.find(r => r.id === rId);
      if (!routine) continue;
      const color = getRoutineColor(routine);
      const item = el('div', 'flex items-center gap-1.5 text-xs text-slate-600');
      const dot = el('span', 'inline-block w-2.5 h-2.5 rounded-full shrink-0');
      dot.style.backgroundColor = color.bg;
      const label = el('span', ''); label.textContent = routine.name;
      item.append(dot, label);
      legend.appendChild(item);
    }
  }
}

function onDayClick(iso) {
  const isPastOrToday = iso <= todayISO();
  const workout = state.workouts.find(w => w.date === iso);
  const scheduled = state.schedules[iso];

  if (isPastOrToday && workout) {
    showWorkoutSummaryModal(workout);
    return;
  }
  showScheduleModal(iso, scheduled);
}

/* ── Modals ──────────────────────────────────────────────── */
function showModal(content, title) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const overlay = el('div',
    'fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-30'
  );
  const panel = el('div',
    'bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col'
  );

  // Drag handle (mobile)
  const handle = el('div', 'flex justify-center pt-3 pb-1 sm:hidden');
  const bar = el('div', 'w-10 h-1 bg-slate-300 rounded-full');
  handle.appendChild(bar);
  panel.appendChild(handle);

  // Header
  if (title) {
    const header = el('div', 'px-4 pb-2 border-b flex items-center justify-between');
    const h = el('h3', 'text-base font-semibold'); h.textContent = title;
    const closeBtn = el('button', 'w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeModal);
    header.append(h, closeBtn);
    panel.appendChild(header);
  }

  // Scrollable body
  const body = el('div', 'flex-1 overflow-y-auto modal-scroll p-4');
  body.appendChild(content);
  panel.appendChild(body);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  root.appendChild(overlay);
}

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function showScheduleModal(iso, scheduled) {
  const content = el('div', 'space-y-3');

  const label = el('p', 'text-sm text-slate-500 mb-1');
  label.textContent = `Pick a routine for ${iso}`;
  content.appendChild(label);

  if (state.routines.length === 0) {
    const msg = el('p', 'text-sm text-slate-400 py-4 text-center');
    msg.textContent = 'No routines yet. Create one in Catalog.';
    content.appendChild(msg);
  } else {
    const grid = el('div', 'grid gap-2');
    state.routines.forEach(r => {
      const color = getRoutineColor(r);
      const btn = el('button',
        `p-3 rounded-xl border-2 flex items-center gap-3 w-full text-left transition-all touch-btn
         ${scheduled === r.id ? 'border-slate-800' : 'border-transparent'}`
      );
      btn.style.backgroundColor = color.light;
      const dot = el('span', 'w-4 h-4 rounded-full shrink-0');
      dot.style.backgroundColor = color.bg;
      const name = el('span', 'font-medium text-sm'); name.textContent = r.name;
      btn.append(dot, name);
      btn.addEventListener('click', () => {
        state.schedules[iso] = r.id;
        saveState(state);
        closeModal();
        renderCalendar();
      });
      grid.appendChild(btn);
    });
    content.appendChild(grid);
  }

  // Clear button
  if (scheduled) {
    const clearBtn = el('button',
      'mt-2 w-full py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium touch-btn'
    );
    clearBtn.textContent = 'Remove scheduled routine';
    clearBtn.addEventListener('click', () => {
      delete state.schedules[iso];
      saveState(state);
      closeModal();
      renderCalendar();
    });
    content.appendChild(clearBtn);
  }

  showModal(content, `Schedule — ${iso}`);
}

function showWorkoutSummaryModal(workout) {
  const content = el('div', 'space-y-2');
  workout.exercises.forEach(ex => {
    const exercise = state.exercises.find(e => e.id === ex.exerciseId) || { name: 'Unknown', emoji: '🏋️', trackingType: 'reps' };
    const tt = getTrackingType(exercise);
    const wrap = el('div', 'border-b pb-3');
    const title = el('div', 'flex items-center gap-2 mb-1');
    title.innerHTML = `
      <div class="text-2xl">${exercise.emoji}</div>
      <div>
        <div class="font-semibold">${exercise.name}</div>
        <div class="text-xs text-slate-400">${tt.icon} ${tt.label}</div>
      </div>`;
    wrap.appendChild(title);
    ex.sets.forEach((s, i) => {
      const set = el('div', 'text-sm text-slate-600 ml-10');
      set.textContent = formatSet(s, tt, i + 1);
      wrap.appendChild(set);
    });
    content.appendChild(wrap);
  });

  const closeBtn = el('button',
    'mt-2 w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn'
  );
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', closeModal);
  content.appendChild(closeBtn);

  showModal(content, `Workout — ${workout.date}`);
}

function formatSet(s, tt, setNum) {
  const prefix = `Set ${setNum}: `;
  if (tt.value === 'distance') {
    return prefix + `${s.distance ?? 0} m` + (s.seconds ? ` · ${formatSeconds(s.seconds)}` : '');
  } else if (tt.value === 'time') {
    return prefix + (s.weight ? `${s.weight} kg · ` : '') + formatSeconds(s.seconds ?? 0);
  } else {
    return prefix + `${s.weight ?? 0} kg × ${s.reps ?? 0} reps`;
  }
}

function formatSeconds(sec) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ── Catalog ─────────────────────────────────────────────── */
function renderCatalog(filter = '') {
  const list = document.getElementById('catalog-list');
  list.innerHTML = '';
  const exercises = filter
    ? state.exercises.filter(ex => ex.name.toLowerCase().includes(filter.toLowerCase()))
    : state.exercises;

  if (exercises.length === 0) {
    const empty = el('div', 'text-center text-slate-400 py-6 text-sm');
    empty.textContent = filter ? 'No exercises match your search.' : 'No exercises yet.';
    list.appendChild(empty);
    return;
  }

  exercises.forEach(ex => {
    const tt = getTrackingType(ex);
    const row = el('div', 'bg-white p-3 rounded-xl flex items-center justify-between shadow-sm');
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-2xl w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl">${ex.emoji}</div>
        <div>
          <div class="font-medium">${ex.name}</div>
          <div class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">${tt.icon} <span>${tt.label}</span></div>
        </div>
      </div>`;
    const del = el('button', 'p-2 rounded-xl bg-red-50 text-red-500 touch-btn');
    del.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    del.addEventListener('click', () => {
      state.exercises = state.exercises.filter(e => e.id !== ex.id);
      saveState(state);
      renderCatalog(document.getElementById('catalog-search').value);
      renderRoutines();
    });
    row.appendChild(del);
    list.appendChild(row);
  });
}

/* ── Routines ────────────────────────────────────────────── */
function renderRoutines() {
  const list = document.getElementById('routines-list');
  list.innerHTML = '';

  if (state.routines.length === 0) {
    const empty = el('div', 'text-center text-slate-400 py-4 text-sm');
    empty.textContent = 'No routines yet.';
    list.appendChild(empty);
    return;
  }

  state.routines.forEach(r => {
    const color = getRoutineColor(r);
    const card = el('div', 'rounded-xl shadow-sm overflow-hidden');
    card.style.backgroundColor = color.light;

    const inner = el('div', 'p-3 flex items-start justify-between gap-2');

    // Color bar on left
    const bar = el('div', 'w-1 rounded-full shrink-0 self-stretch');
    bar.style.backgroundColor = color.bg;

    const left = el('div', 'flex-1 min-w-0');
    const title = el('div', 'font-semibold text-sm'); title.textContent = r.name;
    const details = el('div', 'text-xs text-slate-500 mt-0.5 truncate');
    details.textContent = r.exercises
      .map(eid => { const ex = state.exercises.find(x => x.id === eid); return ex ? `${ex.emoji} ${ex.name}` : ''; })
      .filter(Boolean).join(' · ') || 'No exercises';
    left.append(title, details);

    const btns = el('div', 'flex gap-2 shrink-0');
    const start = el('button', 'px-3 py-1.5 text-white rounded-xl text-sm font-medium touch-btn');
    start.style.backgroundColor = color.bg;
    start.textContent = 'Start';
    start.addEventListener('click', () => startWorkoutFromRoutine(r.id));

    const del = el('button', 'px-2 py-1.5 rounded-xl bg-white/60 text-red-500 touch-btn');
    del.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    del.addEventListener('click', () => {
      state.routines = state.routines.filter(rr => rr.id !== r.id);
      saveState(state);
      renderRoutines();
    });

    btns.append(start, del);
    inner.append(bar, left, btns);
    card.appendChild(inner);
    list.appendChild(card);
  });
}

/* ── New Exercise Modal ──────────────────────────────────── */
function showNewExerciseModal() {
  const content = el('div', 'space-y-3');

  // Name
  const nameInput = el('input',
    'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400'
  );
  nameInput.placeholder = 'e.g. Bench Press';
  content.appendChild(nameInput);

  // Emoji preview
  const preview = el('div', 'text-2xl text-center py-2 bg-slate-50 rounded-xl');
  preview.textContent = '🏋️';
  content.appendChild(preview);

  nameInput.addEventListener('input', () => {
    preview.textContent = pickEmoji(nameInput.value) + '  ' + (nameInput.value || '');
  });

  // Tracking type selector
  const typeLabel = el('p', 'text-sm font-medium text-slate-600');
  typeLabel.textContent = 'Tracking type';
  content.appendChild(typeLabel);

  let selectedType = 'reps';
  const typeGrid = el('div', 'grid grid-cols-3 gap-2');
  TRACKING_TYPES.forEach(t => {
    const btn = el('button',
      `flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-sm font-medium transition-all touch-btn
       ${t.value === selectedType ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-600'}`
    );
    btn.setAttribute('type', 'button');
    btn.innerHTML = `<span class="text-xl">${t.icon}</span><span>${t.label}</span>`;
    btn.addEventListener('click', () => {
      selectedType = t.value;
      typeGrid.querySelectorAll('button').forEach((b, j) => {
        const active = TRACKING_TYPES[j].value === selectedType;
        b.className = b.className
          .replace(/border-\S+ bg-\S+ text-\S+/g, '')
          .trim();
        b.classList.add(
          ...(active
            ? ['border-slate-800', 'bg-slate-800', 'text-white']
            : ['border-slate-200', 'bg-slate-50', 'text-slate-600'])
        );
      });
    });
    typeGrid.appendChild(btn);
  });
  content.appendChild(typeGrid);

  // Save
  const saveBtn = el('button',
    'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn'
  );
  saveBtn.textContent = 'Create Exercise';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    state.exercises.push({ id: uid('ex'), name, emoji: pickEmoji(name), trackingType: selectedType });
    saveState(state);
    closeModal();
    renderCatalog();
    renderRoutines();
  });
  content.appendChild(saveBtn);

  showModal(content, 'New Exercise');
  setTimeout(() => nameInput.focus(), 100);
}

/* ── New Routine Modal ───────────────────────────────────── */
function showNewRoutineModal() {
  const content = el('div', 'space-y-3');

  const nameInput = el('input',
    'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400'
  );
  nameInput.placeholder = 'Routine name';
  content.appendChild(nameInput);

  // Color picker
  const colorLabel = el('p', 'text-sm font-medium text-slate-600'); colorLabel.textContent = 'Color';
  content.appendChild(colorLabel);
  const colorGrid = el('div', 'flex flex-wrap gap-2');
  let selectedColorIndex = 0;
  ROUTINE_COLORS.forEach((c, i) => {
    const swatch = el('button', 'color-swatch touch-btn' + (i === 0 ? ' selected' : ''));
    swatch.style.backgroundColor = c.bg;
    swatch.title = c.name;
    swatch.setAttribute('type', 'button');
    swatch.addEventListener('click', () => {
      selectedColorIndex = i;
      colorGrid.querySelectorAll('.color-swatch').forEach((s, j) => {
        s.classList.toggle('selected', j === i);
      });
    });
    colorGrid.appendChild(swatch);
  });
  content.appendChild(colorGrid);

  // Exercise picker
  const exLabel = el('p', 'text-sm font-medium text-slate-600'); exLabel.textContent = 'Exercises';
  content.appendChild(exLabel);

  const exList = el('div', 'grid gap-2 max-h-52 overflow-y-auto modal-scroll');
  state.exercises.forEach(ex => {
    const rowLabel = el('label', 'flex items-center gap-3 p-2.5 border border-slate-100 bg-slate-50 rounded-xl cursor-pointer active:bg-slate-100');
    const cb = el('input', 'w-5 h-5 accent-slate-800'); cb.type = 'checkbox'; cb.value = ex.id;
    const emojiDiv = el('div', 'text-xl'); emojiDiv.textContent = ex.emoji;
    const nameDiv = el('div', 'font-medium text-sm'); nameDiv.textContent = ex.name;
    rowLabel.append(cb, emojiDiv, nameDiv);
    exList.appendChild(rowLabel);
  });
  if (state.exercises.length === 0) {
    const msg = el('p', 'text-sm text-slate-400 text-center py-3');
    msg.textContent = 'Add exercises first in the Catalog.';
    exList.appendChild(msg);
  }
  content.appendChild(exList);

  const saveBtn = el('button',
    'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn'
  );
  saveBtn.textContent = 'Create Routine';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const checked = Array.from(exList.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
    state.routines.push({ id: uid('rt'), name, exercises: checked, colorIndex: selectedColorIndex });
    saveState(state);
    closeModal();
    renderRoutines();
  });
  content.appendChild(saveBtn);

  showModal(content, 'New Routine');
  setTimeout(() => nameInput.focus(), 100);
}

/* ── Workout Flow ────────────────────────────────────────── */
function startWorkoutFromRoutine(routineId) {
  const routine = state.routines.find(r => r.id === routineId);
  openWorkoutEditor(routine ? routine.exercises : []);
}

function openWorkoutEditor(exerciseIds = []) {
  const content = el('div', 'space-y-3');

  const container = el('div', 'space-y-3');
  content.appendChild(container);

  function createSetRow(tt) {
    const row = el('div', 'flex gap-2 items-center');
    // col1: weight or distance
    const c1 = el('input', 'flex-1 p-2.5 border border-slate-200 rounded-xl text-center');
    c1.type = 'number'; c1.placeholder = tt.ph1; c1.inputMode = tt.mode1;
    c1.dataset.col = 'col1';
    // col2: reps or seconds
    const c2 = el('input', 'flex-1 p-2.5 border border-slate-200 rounded-xl text-center');
    c2.type = 'number'; c2.placeholder = tt.ph2; c2.inputMode = tt.mode2;
    c2.dataset.col = 'col2';
    const rem = el('button', 'w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-400');
    rem.innerHTML = '×';
    rem.addEventListener('click', () => row.remove());
    row.append(c1, c2, rem);
    return row;
  }

  function addExerciseBlock(exId) {
    const ex = state.exercises.find(e => e.id === exId) || { name: 'Custom', emoji: '🏋️', trackingType: 'reps' };
    const tt = getTrackingType(ex);
    const block = el('div', 'p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-2');
    block.dataset.exId = ex.id;

    const header = el('div', 'flex items-center justify-between');
    header.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="text-2xl">${ex.emoji}</div>
        <div>
          <div class="font-semibold text-sm">${ex.name}</div>
          <div class="text-xs text-slate-400">${tt.icon} ${tt.label}</div>
        </div>
      </div>`;
    const removeBtn = el('button', 'text-xs text-red-500 px-2 py-1 bg-red-50 rounded-lg');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => block.remove());
    header.appendChild(removeBtn);
    block.appendChild(header);

    const setsWrap = el('div', 'space-y-2');
    block.appendChild(setsWrap);

    // Column headers
    const setHeader = el('div', 'flex gap-2 text-xs text-slate-400 px-0.5');
    setHeader.innerHTML = `
      <span class="flex-1 text-center">${tt.col1}</span>
      <span class="flex-1 text-center">${tt.col2}</span>
      <span class="w-9"></span>`;
    setsWrap.appendChild(setHeader);

    const addSetBtn = el('button', 'w-full py-2 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400');
    addSetBtn.textContent = '+ Add Set';
    addSetBtn.addEventListener('click', () => { setsWrap.insertBefore(createSetRow(tt), addSetBtn); });

    setsWrap.appendChild(createSetRow(tt));
    setsWrap.appendChild(addSetBtn);
    container.appendChild(block);
  }

  exerciseIds.forEach(id => addExerciseBlock(id));

  // Add exercise selector
  const addExSel = el('select',
    'w-full p-3 border border-slate-200 rounded-xl bg-white text-sm'
  );
  addExSel.innerHTML = `<option value="">+ Add exercise…</option>` +
    state.exercises.map(e => `<option value="${e.id}">${e.emoji} ${e.name}</option>`).join('');
  addExSel.addEventListener('change', () => {
    if (addExSel.value) { addExerciseBlock(addExSel.value); addExSel.value = ''; }
  });
  content.appendChild(addExSel);

  const saveBtn = el('button',
    'w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn mt-2'
  );
  saveBtn.textContent = '💾 Save Workout';
  saveBtn.addEventListener('click', () => {
    const blocks = Array.from(container.children);
    if (blocks.length === 0) { alert('Add at least one exercise'); return; }

    const workout = { id: uid('wo'), date: todayISO(), exercises: [] };

    for (const b of blocks) {
      const exId = b.dataset.exId;
      const ex = state.exercises.find(e => e.id === exId) || { id: uid('ex'), name: 'Custom', emoji: '🏋️', trackingType: 'reps' };
      const tt = getTrackingType(ex);

      const collectedSets = [];
      for (const sr of b.querySelectorAll('div.flex.gap-2.items-center')) {
        const inputs = sr.querySelectorAll('input');
        if (inputs.length < 2) continue;
        const v1 = parseFloat(inputs[0].value) || 0;
        const v2 = parseFloat(inputs[1].value) || 0;
        if (v1 > 0 || v2 > 0) {
          if (tt.value === 'distance') {
            collectedSets.push({ distance: v1, seconds: v2, trackingType: tt.value });
          } else if (tt.value === 'time') {
            collectedSets.push({ weight: v1, seconds: v2, trackingType: tt.value });
          } else {
            collectedSets.push({ weight: v1, reps: v2, trackingType: tt.value });
          }
        }
      }
      if (collectedSets.length > 0) {
        workout.exercises.push({ exerciseId: ex.id, sets: collectedSets });
      }
    }

    if (workout.exercises.length === 0) { alert('Log at least one set'); return; }

    state.workouts.push(workout);
    checkAndUpdatePRs(workout);
    saveState(state);
    closeModal();
    renderCalendar();
    renderTodayWorkouts();
  });
  content.appendChild(saveBtn);

  showModal(content, 'Active Workout');
}

function checkAndUpdatePRs(workout) {
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      const prev = state.prs[ex.exerciseId];
      if (!prev || s.weight > prev.weight) {
        state.prs[ex.exerciseId] = { weight: s.weight, reps: s.reps, date: workout.date };
      }
    }
  }
}

/* ── Recent Workouts ─────────────────────────────────────── */
function renderTodayWorkouts() {
  const wrap = document.getElementById('today-workouts');
  wrap.innerHTML = '';

  if (state.workouts.length === 0) return;

  const heading = el('h3', 'text-sm font-semibold text-slate-500 mb-2 px-1');
  heading.textContent = 'Recent Workouts';
  wrap.appendChild(heading);

  const recent = state.workouts.slice(-5).reverse();
  recent.forEach(w => {
    const card = el('button',
      'workout-card w-full bg-white p-3 rounded-xl shadow-sm mb-2 flex items-center justify-between text-left touch-btn'
    );
    const left = el('div', '');
    const date = el('div', 'text-sm font-medium'); date.textContent = w.date;
    const exNames = el('div', 'text-xs text-slate-400 mt-0.5');
    exNames.textContent = w.exercises
      .map(ex => { const e = state.exercises.find(x => x.id === ex.exerciseId); return e ? e.emoji : ''; })
      .join(' ');
    left.append(date, exNames);

    const right = el('div', 'text-xs text-slate-400');
    right.textContent = `${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}`;

    card.append(left, right);
    card.addEventListener('click', () => showWorkoutSummaryModal(w));
    wrap.appendChild(card);
  });
}

/* ── PRs ─────────────────────────────────────────────────── */
function renderPRs() {
  const list = document.getElementById('prs-list');
  list.innerHTML = '';
  const entries = Object.entries(state.prs);

  if (entries.length === 0) {
    const empty = el('div', 'text-center text-slate-400 py-8 text-sm');
    empty.textContent = 'No personal records yet. Complete a workout to set your first PR!';
    list.appendChild(empty);
    return;
  }

  entries.forEach(([exId, pr]) => {
    const ex = state.exercises.find(e => e.id === exId) || { name: 'Unknown', emoji: '🏋️' };
    const row = el('div', 'bg-white p-3 rounded-xl flex items-center justify-between shadow-sm');
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-2xl w-11 h-11 flex items-center justify-center bg-amber-50 rounded-xl">${ex.emoji}</div>
        <div>
          <div class="font-semibold text-sm">${ex.name}</div>
          <div class="text-xs text-slate-400">${pr.date} · ${pr.reps} reps</div>
        </div>
      </div>
      <div class="text-lg font-bold text-slate-800">${pr.weight}<span class="text-sm font-normal text-slate-400 ml-1">kg</span></div>`;
    list.appendChild(row);
  });
}

/* ── Search ──────────────────────────────────────────────── */
function bindSearch() {
  const input = document.getElementById('catalog-search');
  const clearBtn = document.getElementById('catalog-search-clear');

  input.addEventListener('input', () => {
    const val = input.value;
    clearBtn.classList.toggle('visible', val.length > 0);
    renderCatalog(val);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('visible');
    renderCatalog('');
    input.focus();
  });
}

/* ── Init ────────────────────────────────────────────────── */
function bindUI() {
  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('btn-new-exercise').addEventListener('click', showNewExerciseModal);
  document.getElementById('btn-new-routine').addEventListener('click', showNewRoutineModal);
  document.getElementById('btn-new-workout').addEventListener('click', () => openWorkoutEditor());

  document.getElementById('prev-month').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });

  bindSearch();
}

function start() {
  bindUI();
  renderCatalog();
  renderRoutines();
  renderCalendar();
  renderTodayWorkouts();
}

start();
