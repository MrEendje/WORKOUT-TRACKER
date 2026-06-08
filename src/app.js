/* ============================================================
   Workout Tracker — app.js
   ============================================================ */

const STORE_KEY = 'workout-tracker:v1';

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

const TRACKING_TYPES = [
  { value: 'reps',     label: 'Reps',     icon: '🔁', col1: 'Weight (kg)', col2: 'Reps',    ph1: 'kg',  ph2: 'reps', mode1: 'decimal', mode2: 'numeric' },
  { value: 'time',     label: 'Time',     icon: '⏱️', col1: 'Weight (kg)', col2: 'Seconds', ph1: 'kg',  ph2: 'sec',  mode1: 'decimal', mode2: 'numeric' },
  { value: 'distance', label: 'Distance', icon: '📏', col1: 'Distance (m)', col2: 'Seconds', ph1: 'm',   ph2: 'sec',  mode1: 'decimal', mode2: 'numeric' },
];

const defaultState = {
  exercises: [],
  categories: [],  // { id, name }
  routines: [],    // { id, name, exercises:[], colorIndex }
  workouts: [],
  schedules: {},   // YYYY-MM-DD -> routineId
  prs: {}          // exerciseId -> { weight, reps, date }
};

/* ── State ───────────────────────────────────────────────── */
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultState));
    // migrate: ensure categories array exists
    if (!s.categories) s.categories = [];
    return s;
  } catch (e) {
    console.error('Failed to load state', e);
    return JSON.parse(JSON.stringify(defaultState));
  }
}
function saveState(state) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
let state = loadState();

/* ── Utilities ───────────────────────────────────────────── */
function uid(p = 'id') { return p + '-' + Math.random().toString(36).slice(2, 9); }
function todayISO(d = new Date()) { return d.toISOString().slice(0, 10); }
function getRoutineColor(r) { return ROUTINE_COLORS[(r?.colorIndex ?? 0) % ROUTINE_COLORS.length]; }
function getTrackingType(ex) {
  return TRACKING_TYPES.find(t => t.value === (ex?.trackingType || 'reps')) || TRACKING_TYPES[0];
}
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

/* ── Emoji auto-pick ─────────────────────────────────────── */
const emojiMap = [
  { k: /bench|press|benchpress|chestpress/i, e: '🏋️' },
  { k: /pushup|opdrukken/i,                  e: '🤸' },
  { k: /dip/i,                               e: '📉' },
  { k: /fly|flys|pecdeck/i,                  e: '👐' },
  { k: /dead|deadlift/i,                     e: '🏋️' },
  { k: /pullup|chinup|chin-up|pull-up/i,     e: '🧗' },
  { k: /row|rowing|latpulldown|pulldown/i,   e: '🚣' },
  { k: /shrug|traps/i,                       e: '🤷' },
  { k: /squat|hacksquat|legpress/i,          e: '🦵' },
  { k: /lunge|split|bulgarian/i,             e: '🧎' },
  { k: /calf|calves/i,                       e: '🧍' },
  { k: /curl|bicep|hammer/i,                 e: '💪' },
  { k: /tricep|pushdown|skull/i,             e: '💪' },
  { k: /lateral|raise|delt/i,               e: '🪽' },
  { k: /abs|crunch|situp|plank|core/i,       e: '🧱' },
  { k: /snatch|clean|jerk|kettlebell/i,      e: '🏋️' },
  { k: /run|jog|sprint|treadmill/i,          e: '🏃' },
  { k: /bike|cycling|cycle|spinning/i,       e: '🚴' },
  { k: /swim|swimming/i,                     e: '🏊' },
  { k: /stair|stepper/i,                     e: '🪜' },
  { k: /jump|skipping/i,                     e: '🪢' },
  { k: /elliptical|crosstrainer/i,           e: '⛷️' },
  { k: /walk|hike/i,                         e: '🥾' },
  { k: /box|boxing|punch|kick/i,             e: '🥊' },
  { k: /yoga|stretch|mobility/i,             e: '🧘' },
  { k: /rest|break/i,                        e: '😴' },
];
function pickEmoji(name) {
  for (const m of emojiMap) if (m.k.test(name)) return m.e;
  return '🏋️';
}

/* ── Format helpers ──────────────────────────────────────── */
function formatSeconds(sec) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function formatSet(s, tt, num) {
  const p = `Set ${num}: `;
  if (tt.value === 'distance') return p + `${s.distance ?? 0}m` + (s.seconds ? ` · ${formatSeconds(s.seconds)}` : '');
  if (tt.value === 'time')     return p + (s.weight ? `${s.weight}kg · ` : '') + formatSeconds(s.seconds ?? 0);
  return p + `${s.weight ?? 0} kg × ${s.reps ?? 0} reps`;
}

/* ── Navigation ──────────────────────────────────────────── */
let currentView = 'view-dashboard';
function showView(id) {
  document.querySelectorAll('#views > section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  currentView = id;
  document.querySelectorAll('.nav-item').forEach(btn => {
    const active = btn.dataset.view === id;
    const icon = btn.querySelector('.nav-icon');
    const lbl  = btn.querySelector('.nav-label');
    if (icon) icon.style.color  = active ? '#0ea5e9' : '#94a3b8';
    if (lbl)  lbl.style.color   = active ? '#0ea5e9' : '#94a3b8';
  });
  document.getElementById('btn-new-workout').style.display = id === 'view-dashboard' ? 'flex' : 'none';
  if (id === 'view-prs')     renderPRs();
  if (id === 'view-catalog') { renderCatalog(); renderRoutines(); }
}

/* ── Calendar ────────────────────────────────────────────── */
let calendarDate = new Date();
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const start = startOfMonth(calendarDate);
  const end   = endOfMonth(calendarDate);
  const todayStr = todayISO();
  document.getElementById('month-label').textContent =
    start.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  renderCalendarLegend(start, end);

  const firstDay = start.getDay();
  for (let i = 0; i < firstDay; i++) grid.appendChild(el('div', ''));

  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), d);
    const iso  = todayISO(date);
    const isToday = iso === todayStr;
    const workout = state.workouts.find(w => w.date === iso);
    const routineId = state.schedules[iso];
    const routine = routineId ? state.routines.find(r => r.id === routineId) : null;
    const color = routine ? getRoutineColor(routine) : null;

    const cell = el('button',
      `calendar-day rounded-xl p-1.5 text-left flex flex-col relative overflow-hidden active:scale-95 transition-transform
       ${isToday ? 'ring-2 ring-sky-400' : ''}`
    );
    cell.setAttribute('type', 'button');
    if (color) cell.style.backgroundColor = workout ? color.bg : color.light;
    else if (workout) cell.style.backgroundColor = '#bae6fd';
    else cell.style.backgroundColor = '#f8fafc';

    const dayNum = el('div', `text-xs font-semibold leading-none mb-1 ${isToday ? 'text-sky-600' : workout ? 'text-white' : 'text-slate-700'}`);
    dayNum.textContent = d;
    cell.appendChild(dayNum);

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
    const iso = todayISO(new Date(start.getFullYear(), start.getMonth(), d));
    const rId = state.schedules[iso];
    if (rId && !seen.has(rId)) {
      seen.add(rId);
      const r = state.routines.find(x => x.id === rId); if (!r) continue;
      const c = getRoutineColor(r);
      const item = el('div', 'flex items-center gap-1.5 text-xs text-slate-600');
      const dot = el('span', 'inline-block w-2.5 h-2.5 rounded-full shrink-0');
      dot.style.backgroundColor = c.bg;
      const lbl = el('span'); lbl.textContent = r.name;
      item.append(dot, lbl);
      legend.appendChild(item);
    }
  }
}

function onDayClick(iso) {
  const workout = state.workouts.find(w => w.date === iso);
  if (iso <= todayISO() && workout) { showWorkoutSummaryModal(workout); return; }
  showScheduleModal(iso, state.schedules[iso]);
}

/* ── Modals ──────────────────────────────────────────────── */
function showModal(content, title) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const overlay = el('div', 'fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-30');
  const panel   = el('div', 'bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col');

  const handle = el('div', 'flex justify-center pt-3 pb-1 sm:hidden');
  handle.appendChild(el('div', 'w-10 h-1 bg-slate-300 rounded-full'));
  panel.appendChild(handle);

  if (title) {
    const hdr = el('div', 'px-4 pb-3 pt-1 border-b flex items-center justify-between');
    const h   = el('h3', 'text-base font-semibold'); h.textContent = title;
    const x   = el('button', 'w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg');
    x.textContent = '×'; x.addEventListener('click', closeModal);
    hdr.append(h, x); panel.appendChild(hdr);
  }

  const body = el('div', 'flex-1 overflow-y-auto modal-scroll p-4');
  body.appendChild(content);
  panel.appendChild(body);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  root.appendChild(overlay);
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ── Schedule modal ──────────────────────────────────────── */
function showScheduleModal(iso, scheduled) {
  const content = el('div', 'space-y-3');
  const lbl = el('p', 'text-sm text-slate-500'); lbl.textContent = `Pick a routine for ${iso}`;
  content.appendChild(lbl);

  if (!state.routines.length) {
    const msg = el('p', 'text-sm text-slate-400 py-4 text-center');
    msg.textContent = 'No routines yet. Create one in Catalog.';
    content.appendChild(msg);
  } else {
    const grid = el('div', 'grid gap-2');
    state.routines.forEach(r => {
      const c   = getRoutineColor(r);
      const btn = el('button', `p-3 rounded-xl border-2 flex items-center gap-3 w-full text-left touch-btn ${scheduled === r.id ? 'border-slate-800' : 'border-transparent'}`);
      btn.style.backgroundColor = c.light;
      const dot = el('span', 'w-4 h-4 rounded-full shrink-0'); dot.style.backgroundColor = c.bg;
      const nm  = el('span', 'font-medium text-sm'); nm.textContent = r.name;
      btn.append(dot, nm);
      btn.addEventListener('click', () => { state.schedules[iso] = r.id; saveState(state); closeModal(); renderCalendar(); });
      grid.appendChild(btn);
    });
    content.appendChild(grid);
  }
  if (scheduled) {
    const clr = el('button', 'mt-2 w-full py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium touch-btn');
    clr.textContent = 'Remove scheduled routine';
    clr.addEventListener('click', () => { delete state.schedules[iso]; saveState(state); closeModal(); renderCalendar(); });
    content.appendChild(clr);
  }
  showModal(content, `Schedule — ${iso}`);
}

/* ── Workout summary modal ───────────────────────────────── */
function showWorkoutSummaryModal(workout) {
  const content = el('div', 'space-y-2');
  workout.exercises.forEach(ex => {
    const exercise = state.exercises.find(e => e.id === ex.exerciseId) || { name: 'Unknown', emoji: '🏋️', trackingType: 'reps' };
    const tt  = getTrackingType(exercise);
    const wrap = el('div', 'border-b pb-3');
    const ttl  = el('div', 'flex items-center gap-2 mb-1');
    ttl.innerHTML = `<div class="text-2xl">${exercise.emoji}</div><div><div class="font-semibold">${exercise.name}</div><div class="text-xs text-slate-400">${tt.icon} ${tt.label}</div></div>`;
    wrap.appendChild(ttl);
    ex.sets.forEach((s, i) => { const row = el('div', 'text-sm text-slate-600 ml-10'); row.textContent = formatSet(s, tt, i + 1); wrap.appendChild(row); });
    content.appendChild(wrap);
  });
  const closeBtn = el('button', 'mt-2 w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  closeBtn.textContent = 'Close'; closeBtn.addEventListener('click', closeModal);
  content.appendChild(closeBtn);
  showModal(content, `Workout — ${workout.date}`);
}

/* ── Categories ──────────────────────────────────────────── */
function renderCatalog(filter = '') {
  const list = document.getElementById('catalog-list');
  list.innerHTML = '';

  const allExercises = filter
    ? state.exercises.filter(ex => ex.name.toLowerCase().includes(filter.toLowerCase()))
    : state.exercises;

  // Uncategorized exercises
  const uncategorized = allExercises.filter(ex => !ex.categoryId);

  // Render categories as collapsible groups
  state.categories.forEach(cat => {
    const catExercises = allExercises.filter(ex => ex.categoryId === cat.id);
    if (filter && catExercises.length === 0) return; // hide empty categories when searching

    const section = el('div', 'rounded-xl overflow-hidden border border-slate-200');

    // Category header
    const catHeader = el('button', 'w-full flex items-center justify-between px-3 py-2.5 bg-slate-100 text-left');
    const left = el('div', 'flex items-center gap-2');
    const arrow = el('span', 'text-slate-400 text-xs transition-transform duration-200'); arrow.textContent = '▼';
    const catName = el('span', 'font-semibold text-sm text-slate-700'); catName.textContent = cat.name;
    const count = el('span', 'text-xs text-slate-400 ml-1'); count.textContent = `(${catExercises.length})`;
    left.append(arrow, catName, count);

    const catBtns = el('div', 'flex items-center gap-1');
    const editCat = el('button', 'p-1.5 rounded-lg text-slate-400 hover:text-slate-600');
    editCat.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
    editCat.addEventListener('click', e => { e.stopPropagation(); showEditCategoryModal(cat); });

    const delCat = el('button', 'p-1.5 rounded-lg text-red-300 hover:text-red-500');
    delCat.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    delCat.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete category "${cat.name}"? Exercises will become uncategorized.`)) return;
      state.exercises.forEach(ex => { if (ex.categoryId === cat.id) delete ex.categoryId; });
      state.categories = state.categories.filter(c => c.id !== cat.id);
      saveState(state); renderCatalog(document.getElementById('catalog-search').value);
    });
    catBtns.append(editCat, delCat);
    catHeader.append(left, catBtns);

    // Toggle collapse
    let collapsed = false;
    const body = el('div', 'divide-y divide-slate-100');
    catHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : '';
      arrow.style.transform = collapsed ? 'rotate(-90deg)' : '';
    });
    section.append(catHeader, body);

    catExercises.forEach(ex => body.appendChild(buildExerciseRow(ex, filter)));
    if (catExercises.length === 0 && !filter) {
      const empty = el('div', 'px-3 py-3 text-xs text-slate-400'); empty.textContent = 'No exercises in this category.';
      body.appendChild(empty);
    }
    list.appendChild(section);
  });

  // Uncategorized section
  if (uncategorized.length > 0 || (!filter && state.categories.length === 0)) {
    const section = el('div', 'space-y-1.5');
    if (state.categories.length > 0) {
      const lbl = el('p', 'text-xs font-semibold text-slate-400 px-1 mt-2'); lbl.textContent = 'Uncategorized';
      section.appendChild(lbl);
    }
    uncategorized.forEach(ex => section.appendChild(buildExerciseRow(ex, filter)));
    if (uncategorized.length === 0 && !filter) {
      const empty = el('div', 'text-center text-slate-400 py-6 text-sm'); empty.textContent = 'No exercises yet.';
      section.appendChild(empty);
    }
    list.appendChild(section);
  }

  if (filter && allExercises.length === 0) {
    const empty = el('div', 'text-center text-slate-400 py-6 text-sm'); empty.textContent = 'No exercises match your search.';
    list.appendChild(empty);
  }
}

function buildExerciseRow(ex, filter = '') {
  const tt  = getTrackingType(ex);
  const row = el('div', 'bg-white p-3 flex items-center justify-between');
  row.innerHTML = `
    <div class="flex items-center gap-3 min-w-0">
      <div class="text-2xl w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl shrink-0">${ex.emoji}</div>
      <div class="min-w-0">
        <div class="font-medium text-sm truncate">${ex.name}</div>
        <div class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">${tt.icon} <span>${tt.label}</span></div>
      </div>
    </div>`;
  const btns = el('div', 'flex gap-1.5 shrink-0 ml-2');

  const editBtn = el('button', 'p-2 rounded-xl bg-sky-50 text-sky-500 touch-btn');
  editBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
  editBtn.addEventListener('click', () => showEditExerciseModal(ex));

  const delBtn = el('button', 'p-2 rounded-xl bg-red-50 text-red-500 touch-btn');
  delBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
  delBtn.addEventListener('click', () => {
    state.exercises = state.exercises.filter(e => e.id !== ex.id);
    saveState(state);
    renderCatalog(document.getElementById('catalog-search').value);
    renderRoutines();
  });
  btns.append(editBtn, delBtn);
  row.appendChild(btns);
  return row;
}

/* ── Edit Category Modal ─────────────────────────────────── */
function showEditCategoryModal(cat) {
  const content = el('div', 'space-y-3');
  const input = el('input', 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');
  input.value = cat.name;
  content.appendChild(input);
  const saveBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const name = input.value.trim(); if (!name) return;
    cat.name = name; saveState(state); closeModal();
    renderCatalog(document.getElementById('catalog-search').value);
  });
  content.appendChild(saveBtn);
  showModal(content, 'Rename Category');
  setTimeout(() => input.focus(), 100);
}

/* ── New Category Modal ──────────────────────────────────── */
function showNewCategoryModal() {
  const content = el('div', 'space-y-3');
  const input = el('input', 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');
  input.placeholder = 'e.g. Chest, Legs, Cardio…';
  content.appendChild(input);
  const saveBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  saveBtn.textContent = 'Create Category';
  saveBtn.addEventListener('click', () => {
    const name = input.value.trim(); if (!name) { input.focus(); return; }
    state.categories.push({ id: uid('cat'), name });
    saveState(state); closeModal();
    renderCatalog(document.getElementById('catalog-search').value);
  });
  content.appendChild(saveBtn);
  showModal(content, 'New Category');
  setTimeout(() => input.focus(), 100);
}

/* ── Exercise modal (shared for create + edit) ───────────── */
function showExerciseModal(existing = null) {
  const isEdit = !!existing;
  const content = el('div', 'space-y-3');

  // Name
  const nameInput = el('input', 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');
  nameInput.placeholder = 'e.g. Bench Press';
  if (isEdit) nameInput.value = existing.name;
  content.appendChild(nameInput);

  // Emoji preview
  const preview = el('div', 'text-2xl text-center py-2 bg-slate-50 rounded-xl');
  preview.textContent = (isEdit ? existing.emoji : '🏋️') + (isEdit ? '  ' + existing.name : '');
  nameInput.addEventListener('input', () => {
    preview.textContent = pickEmoji(nameInput.value) + '  ' + (nameInput.value || '');
  });
  content.appendChild(preview);

  // Category selector
  const catLabel = el('p', 'text-sm font-medium text-slate-600'); catLabel.textContent = 'Category';
  content.appendChild(catLabel);
  const catSel = el('select', 'w-full p-3 border border-slate-200 rounded-xl bg-white');
  catSel.innerHTML = `<option value="">— None —</option>` +
    state.categories.map(c => `<option value="${c.id}" ${isEdit && existing.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  content.appendChild(catSel);

  // Tracking type
  const typeLabel = el('p', 'text-sm font-medium text-slate-600'); typeLabel.textContent = 'Tracking type';
  content.appendChild(typeLabel);
  let selectedType = isEdit ? (existing.trackingType || 'reps') : 'reps';
  const typeGrid = el('div', 'grid grid-cols-3 gap-2');
  TRACKING_TYPES.forEach((t, i) => {
    const btn = el('button', 'flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-sm font-medium transition-all touch-btn');
    btn.setAttribute('type', 'button');
    btn.innerHTML = `<span class="text-xl">${t.icon}</span><span>${t.label}</span>`;
    const setActive = () => {
      typeGrid.querySelectorAll('button').forEach((b, j) => {
        const a = TRACKING_TYPES[j].value === selectedType;
        b.style.borderColor    = a ? '#1e293b' : '#e2e8f0';
        b.style.backgroundColor = a ? '#1e293b' : '#f8fafc';
        b.style.color          = a ? '#fff'    : '#475569';
      });
    };
    btn.addEventListener('click', () => { selectedType = t.value; setActive(); });
    typeGrid.appendChild(btn);
  });
  content.appendChild(typeGrid);
  // trigger initial highlight after DOM insertion via microtask
  setTimeout(() => {
    typeGrid.querySelectorAll('button').forEach((b, j) => {
      const a = TRACKING_TYPES[j].value === selectedType;
      b.style.borderColor     = a ? '#1e293b' : '#e2e8f0';
      b.style.backgroundColor = a ? '#1e293b' : '#f8fafc';
      b.style.color           = a ? '#fff'    : '#475569';
    });
  }, 0);

  // Save
  const saveBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Exercise';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim(); if (!name) { nameInput.focus(); return; }
    const emoji = pickEmoji(name);
    const catId = catSel.value || undefined;
    if (isEdit) {
      existing.name = name; existing.emoji = emoji;
      existing.trackingType = selectedType;
      if (catId) existing.categoryId = catId; else delete existing.categoryId;
    } else {
      const obj = { id: uid('ex'), name, emoji, trackingType: selectedType };
      if (catId) obj.categoryId = catId;
      state.exercises.push(obj);
    }
    saveState(state); closeModal();
    renderCatalog(document.getElementById('catalog-search').value);
    renderRoutines();
  });
  content.appendChild(saveBtn);

  showModal(content, isEdit ? 'Edit Exercise' : 'New Exercise');
  setTimeout(() => nameInput.focus(), 100);
}
function showNewExerciseModal()      { showExerciseModal(null); }
function showEditExerciseModal(ex)   { showExerciseModal(ex); }

/* ── Routines ────────────────────────────────────────────── */
function renderRoutines() {
  const list = document.getElementById('routines-list');
  list.innerHTML = '';
  if (!state.routines.length) {
    const empty = el('div', 'text-center text-slate-400 py-4 text-sm'); empty.textContent = 'No routines yet.';
    list.appendChild(empty); return;
  }
  state.routines.forEach(r => {
    const c    = getRoutineColor(r);
    const card = el('div', 'rounded-xl shadow-sm overflow-hidden'); card.style.backgroundColor = c.light;
    const inner = el('div', 'p-3 flex items-start justify-between gap-2');
    const bar   = el('div', 'w-1 rounded-full shrink-0 self-stretch'); bar.style.backgroundColor = c.bg;
    const left  = el('div', 'flex-1 min-w-0');
    const title = el('div', 'font-semibold text-sm'); title.textContent = r.name;
    const det   = el('div', 'text-xs text-slate-500 mt-0.5 truncate');
    det.textContent = r.exercises.map(eid => { const ex = state.exercises.find(x => x.id === eid); return ex ? `${ex.emoji} ${ex.name}` : ''; }).filter(Boolean).join(' · ') || 'No exercises';
    left.append(title, det);
    const btns  = el('div', 'flex gap-2 shrink-0');
    const start = el('button', 'px-3 py-1.5 text-white rounded-xl text-sm font-medium touch-btn'); start.style.backgroundColor = c.bg; start.textContent = 'Start';
    start.addEventListener('click', () => startWorkoutFromRoutine(r.id));
    const del = el('button', 'px-2 py-1.5 rounded-xl bg-white/60 text-red-500 touch-btn');
    del.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    del.addEventListener('click', () => { state.routines = state.routines.filter(rr => rr.id !== r.id); saveState(state); renderRoutines(); });
    btns.append(start, del); inner.append(bar, left, btns); card.appendChild(inner); list.appendChild(card);
  });
}

/* ── New Routine Modal ───────────────────────────────────── */
function showNewRoutineModal() {
  const content = el('div', 'space-y-3');

  // Name
  const nameInput = el('input', 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');
  nameInput.placeholder = 'Routine name';
  content.appendChild(nameInput);

  // Color picker
  const colorLabel = el('p', 'text-sm font-medium text-slate-600'); colorLabel.textContent = 'Color';
  content.appendChild(colorLabel);
  let selectedColorIndex = 0;
  const colorGrid = el('div', 'flex flex-wrap gap-2');
  ROUTINE_COLORS.forEach((c, i) => {
    const sw = el('button', 'color-swatch touch-btn' + (i === 0 ? ' selected' : ''));
    sw.style.backgroundColor = c.bg; sw.title = c.name; sw.setAttribute('type', 'button');
    sw.addEventListener('click', () => {
      selectedColorIndex = i;
      colorGrid.querySelectorAll('.color-swatch').forEach((s, j) => s.classList.toggle('selected', j === i));
    });
    colorGrid.appendChild(sw);
  });
  content.appendChild(colorGrid);

  // Exercise search
  const searchLabel = el('p', 'text-sm font-medium text-slate-600'); searchLabel.textContent = 'Exercises';
  content.appendChild(searchLabel);
  const searchWrap = el('div', 'relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 mb-1');
  const searchIcon = el('span', 'text-slate-400 text-sm shrink-0'); searchIcon.textContent = '🔍';
  const searchInput = el('input', 'flex-1 py-2.5 px-2 bg-transparent outline-none text-sm');
  searchInput.placeholder = 'Search exercises…';
  searchWrap.append(searchIcon, searchInput);
  content.appendChild(searchWrap);

  // Exercise list
  const exList = el('div', 'grid gap-1.5 max-h-56 overflow-y-auto modal-scroll');
  content.appendChild(exList);

  function renderExList(filter = '') {
    exList.innerHTML = '';
    const filtered = filter
      ? state.exercises.filter(ex => ex.name.toLowerCase().includes(filter.toLowerCase()))
      : state.exercises;

    if (!filtered.length) {
      const empty = el('p', 'text-sm text-slate-400 text-center py-3');
      empty.textContent = filter ? 'No exercises match.' : 'Add exercises first in the Catalog.';
      exList.appendChild(empty); return;
    }

    // Group by category for clarity
    const byCategory = {};
    filtered.forEach(ex => {
      const key = ex.categoryId || '__none__';
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(ex);
    });

    // Render categories
    [...state.categories, { id: '__none__', name: 'Other' }].forEach(cat => {
      const exs = byCategory[cat.id]; if (!exs || !exs.length) return;
      if (state.categories.length > 0) {
        const catHdr = el('div', 'text-xs font-semibold text-slate-400 pt-1 pb-0.5 px-1');
        catHdr.textContent = cat.id === '__none__' ? 'Uncategorized' : cat.name;
        exList.appendChild(catHdr);
      }
      exs.forEach(ex => {
        // preserve checked state across re-renders
        const existing = exList.parentElement?.querySelector(`input[value="${ex.id}"]`);
        const wasChecked = existing?.checked || false;
        const rowLabel = el('label', 'flex items-center gap-3 p-2.5 border border-slate-100 bg-slate-50 rounded-xl cursor-pointer active:bg-slate-100');
        const cb = el('input', 'w-5 h-5 accent-slate-800 shrink-0'); cb.type = 'checkbox'; cb.value = ex.id; if (wasChecked) cb.checked = true;
        const emojiDiv = el('div', 'text-xl shrink-0'); emojiDiv.textContent = ex.emoji;
        const nameDiv  = el('div', 'font-medium text-sm'); nameDiv.textContent = ex.name;
        rowLabel.append(cb, emojiDiv, nameDiv);
        exList.appendChild(rowLabel);
      });
    });
  }

  renderExList();
  searchInput.addEventListener('input', () => {
    // save current checks before re-render
    const checked = new Set(Array.from(exList.querySelectorAll('input:checked')).map(i => i.value));
    renderExList(searchInput.value);
    exList.querySelectorAll('input[type=checkbox]').forEach(cb => { if (checked.has(cb.value)) cb.checked = true; });
  });

  // Save
  const saveBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  saveBtn.textContent = 'Create Routine';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim(); if (!name) { nameInput.focus(); return; }
    const checked = Array.from(exList.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
    state.routines.push({ id: uid('rt'), name, exercises: checked, colorIndex: selectedColorIndex });
    saveState(state); closeModal(); renderRoutines();
  });
  content.appendChild(saveBtn);

  showModal(content, 'New Routine');
  setTimeout(() => nameInput.focus(), 100);
}

/* ── Workout Flow ────────────────────────────────────────── */
function startWorkoutFromRoutine(routineId) {
  const r = state.routines.find(r => r.id === routineId);
  openWorkoutEditor(r ? r.exercises : []);
}

function openWorkoutEditor(exerciseIds = []) {
  const content = el('div', 'space-y-3');
  const container = el('div', 'space-y-3');
  content.appendChild(container);

  // ── Each exercise block keeps its own set rows in an array ──
  function createSetRow(tt, setsContainer) {
    const row = el('div', 'flex gap-2 items-center');
    row.dataset.setRow = '1'; // marker to identify set rows

    const c1 = el('input', 'flex-1 min-w-0 p-3 border border-slate-200 rounded-xl text-center bg-white');
    c1.type = 'number'; c1.placeholder = tt.ph1; c1.inputMode = tt.mode1; c1.autocomplete = 'off';

    const c2 = el('input', 'flex-1 min-w-0 p-3 border border-slate-200 rounded-xl text-center bg-white');
    c2.type = 'number'; c2.placeholder = tt.ph2; c2.inputMode = tt.mode2; c2.autocomplete = 'off';

    const rem = el('button', 'w-11 h-11 flex items-center justify-center rounded-xl bg-red-50 text-red-400 shrink-0 touch-btn');
    rem.setAttribute('type', 'button');
    rem.textContent = '×';
    rem.addEventListener('click', () => row.remove());

    row.append(c1, c2, rem);
    return row;
  }

  function addExerciseBlock(exId) {
    const ex = state.exercises.find(e => e.id === exId) || { id: exId, name: 'Custom', emoji: '🏋️', trackingType: 'reps' };
    const tt = getTrackingType(ex);
    const block = el('div', 'p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-2');
    block.dataset.exId = ex.id;

    // Header
    const hdr = el('div', 'flex items-center justify-between');
    hdr.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="text-2xl">${ex.emoji}</div>
        <div>
          <div class="font-semibold text-sm">${ex.name}</div>
          <div class="text-xs text-slate-400">${tt.icon} ${tt.label}</div>
        </div>
      </div>`;
    const removeBtn = el('button', 'text-xs text-red-500 px-2.5 py-1.5 bg-red-50 rounded-lg touch-btn');
    removeBtn.setAttribute('type', 'button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => block.remove());
    hdr.appendChild(removeBtn);
    block.appendChild(hdr);

    // Column labels
    const colHdr = el('div', 'flex gap-2 text-xs text-slate-400 px-0.5');
    colHdr.innerHTML = `<span class="flex-1 text-center">${tt.col1}</span><span class="flex-1 text-center">${tt.col2}</span><span class="w-11"></span>`;
    block.appendChild(colHdr);

    // Sets container — only holds set rows + the add button
    const setsContainer = el('div', 'space-y-2');
    block.appendChild(setsContainer);

    const addSetBtn = el('button', 'w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 touch-btn');
    addSetBtn.setAttribute('type', 'button');
    addSetBtn.textContent = '+ Add Set';
    addSetBtn.addEventListener('click', () => setsContainer.insertBefore(createSetRow(tt, setsContainer), addSetBtn));

    setsContainer.appendChild(createSetRow(tt, setsContainer)); // default first set
    setsContainer.appendChild(addSetBtn);

    container.appendChild(block);
  }

  exerciseIds.forEach(id => addExerciseBlock(id));

  // Add exercise dropdown
  const addExSel = el('select', 'w-full p-3 border border-slate-200 rounded-xl bg-white text-sm');
  addExSel.innerHTML = `<option value="">+ Add exercise…</option>` +
    state.exercises.map(e => `<option value="${e.id}">${e.emoji} ${e.name}</option>`).join('');
  addExSel.addEventListener('change', () => { if (addExSel.value) { addExerciseBlock(addExSel.value); addExSel.value = ''; } });
  content.appendChild(addExSel);

  // Save button
  const saveBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn mt-1');
  saveBtn.setAttribute('type', 'button');
  saveBtn.textContent = '💾 Save Workout';
  saveBtn.addEventListener('click', () => {
    const blocks = Array.from(container.querySelectorAll('[data-ex-id]'));
    if (!blocks.length) { alert('Add at least one exercise'); return; }

    const workout = { id: uid('wo'), date: todayISO(), exercises: [] };

    for (const b of blocks) {
      const ex = state.exercises.find(e => e.id === b.dataset.exId) || { id: b.dataset.exId, trackingType: 'reps' };
      const tt = getTrackingType(ex);
      const collectedSets = [];

      // Only grab rows that have data-set-row marker (not the "+ Add Set" button)
      for (const row of b.querySelectorAll('[data-set-row]')) {
        const inputs = row.querySelectorAll('input');
        if (inputs.length < 2) continue;
        const v1 = parseFloat(inputs[0].value);
        const v2 = parseFloat(inputs[1].value);
        if (isNaN(v1) && isNaN(v2)) continue;
        const a = isNaN(v1) ? 0 : v1;
        const b2 = isNaN(v2) ? 0 : v2;
        if (tt.value === 'distance') collectedSets.push({ distance: a, seconds: b2, trackingType: tt.value });
        else if (tt.value === 'time') collectedSets.push({ weight: a, seconds: b2, trackingType: tt.value });
        else collectedSets.push({ weight: a, reps: b2, trackingType: tt.value });
      }
      if (collectedSets.length) workout.exercises.push({ exerciseId: ex.id, sets: collectedSets });
    }

    if (!workout.exercises.length) { alert('Log at least one set'); return; }
    state.workouts.push(workout);
    checkAndUpdatePRs(workout);
    saveState(state); closeModal(); renderCalendar(); renderTodayWorkouts();
  });
  content.appendChild(saveBtn);

  showModal(content, 'Active Workout');
}

function checkAndUpdatePRs(workout) {
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      const prev = state.prs[ex.exerciseId];
      if (!prev || (s.weight ?? 0) > (prev.weight ?? 0))
        state.prs[ex.exerciseId] = { weight: s.weight, reps: s.reps, seconds: s.seconds, distance: s.distance, date: workout.date };
    }
  }
}

/* ── Recent Workouts ─────────────────────────────────────── */
function renderTodayWorkouts() {
  const wrap = document.getElementById('today-workouts'); wrap.innerHTML = '';
  if (!state.workouts.length) return;
  const heading = el('h3', 'text-sm font-semibold text-slate-500 mb-2 px-1'); heading.textContent = 'Recent Workouts';
  wrap.appendChild(heading);
  state.workouts.slice(-5).reverse().forEach(w => {
    const card = el('button', 'workout-card w-full bg-white p-3 rounded-xl shadow-sm mb-2 flex items-center justify-between text-left touch-btn');
    const left = el('div'); const date = el('div', 'text-sm font-medium'); date.textContent = w.date;
    const icons = el('div', 'text-xs text-slate-400 mt-0.5');
    icons.textContent = w.exercises.map(ex => { const e = state.exercises.find(x => x.id === ex.exerciseId); return e ? e.emoji : ''; }).join(' ');
    left.append(date, icons);
    const right = el('div', 'text-xs text-slate-400');
    right.textContent = `${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}`;
    card.append(left, right); card.addEventListener('click', () => showWorkoutSummaryModal(w));
    wrap.appendChild(card);
  });
}

/* ── PRs ─────────────────────────────────────────────────── */
function renderPRs() {
  const list = document.getElementById('prs-list'); list.innerHTML = '';
  const entries = Object.entries(state.prs);
  if (!entries.length) {
    const empty = el('div', 'text-center text-slate-400 py-8 text-sm');
    empty.textContent = 'No personal records yet. Complete a workout to set your first PR!';
    list.appendChild(empty); return;
  }
  entries.forEach(([exId, pr]) => {
    const ex  = state.exercises.find(e => e.id === exId) || { name: 'Unknown', emoji: '🏋️', trackingType: 'reps' };
    const tt  = getTrackingType(ex);
    const row = el('div', 'bg-white p-3 rounded-xl flex items-center justify-between shadow-sm');
    let valueHtml;
    if (tt.value === 'distance') valueHtml = `<div class="font-bold text-slate-800">${pr.distance ?? 0}<span class="text-sm font-normal text-slate-400 ml-1">m</span></div>`;
    else if (tt.value === 'time') valueHtml = `<div class="font-bold text-slate-800">${formatSeconds(pr.seconds ?? 0)}</div>`;
    else valueHtml = `<div class="text-lg font-bold text-slate-800">${pr.weight ?? 0}<span class="text-sm font-normal text-slate-400 ml-1">kg</span></div>`;
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-2xl w-11 h-11 flex items-center justify-center bg-amber-50 rounded-xl">${ex.emoji}</div>
        <div><div class="font-semibold text-sm">${ex.name}</div><div class="text-xs text-slate-400">${pr.date}</div></div>
      </div>${valueHtml}`;
    list.appendChild(row);
  });
}

/* ── Search (catalog) ────────────────────────────────────── */
function bindSearch() {
  const input    = document.getElementById('catalog-search');
  const clearBtn = document.getElementById('catalog-search-clear');
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', input.value.length > 0);
    renderCatalog(input.value);
  });
  clearBtn.addEventListener('click', () => {
    input.value = ''; clearBtn.classList.remove('visible'); renderCatalog(''); input.focus();
  });
}

/* ── Init ────────────────────────────────────────────────── */
function bindUI() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.getElementById('btn-new-exercise').addEventListener('click', showNewExerciseModal);
  document.getElementById('btn-new-category').addEventListener('click', showNewCategoryModal);
  document.getElementById('btn-new-routine').addEventListener('click', showNewRoutineModal);
  document.getElementById('btn-new-workout').addEventListener('click', () => openWorkoutEditor());
  document.getElementById('prev-month').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
  document.getElementById('next-month').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
  bindSearch();
}

function start() { bindUI(); renderCatalog(); renderRoutines(); renderCalendar(); renderTodayWorkouts(); }
start();
