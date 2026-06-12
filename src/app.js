/* ============================================================
   Workout Tracker — app.js
   ============================================================ */
const STORE_KEY = 'workout-tracker:v1';

const ROUTINE_COLORS = [
  { name:'Sky',    bg:'#0ea5e9', text:'#fff', light:'#e0f2fe' },
  { name:'Green',  bg:'#22c55e', text:'#fff', light:'#dcfce7' },
  { name:'Orange', bg:'#f97316', text:'#fff', light:'#ffedd5' },
  { name:'Purple', bg:'#a855f7', text:'#fff', light:'#f3e8ff' },
  { name:'Pink',   bg:'#ec4899', text:'#fff', light:'#fce7f3' },
  { name:'Red',    bg:'#ef4444', text:'#fff', light:'#fee2e2' },
  { name:'Teal',   bg:'#14b8a6', text:'#fff', light:'#ccfbf1' },
  { name:'Amber',  bg:'#f59e0b', text:'#fff', light:'#fef3c7' },
];

const TRACKING_TYPES = [
  { value:'reps',     label:'Reps',     icon:'🔁', col1:'Weight (kg)', col2:'Reps',    ph1:'kg',  ph2:'reps',  mode1:'decimal', mode2:'numeric' },
  { value:'time',     label:'Time',     icon:'⏱️', col1:'Weight (kg)', col2:'Seconds', ph1:'kg',  ph2:'sec',   mode1:'decimal', mode2:'numeric' },
  { value:'distance', label:'Distance', icon:'📏', col1:'Distance (m)', col2:'Seconds', ph1:'m',   ph2:'sec',   mode1:'decimal', mode2:'numeric' },
];

const defaultState = {
  exercises: [], categories: [], routines: [],
  workouts: [], schedules: {}, prs: {},
  settings: { darkMode: false },
};

/* ── State ───────────────────────────────────────────────── */
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultState));
    if (!s.categories) s.categories = [];
    if (!s.settings)   s.settings   = { darkMode: false };
    return s;
  } catch(e) { return JSON.parse(JSON.stringify(defaultState)); }
}
function saveState(st) { localStorage.setItem(STORE_KEY, JSON.stringify(st)); }
let state = loadState();

/* ── Utilities ───────────────────────────────────────────── */
function uid(p='id') { return p+'-'+Math.random().toString(36).slice(2,9); }
function todayISO(d=new Date()) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function getRoutineColor(r) { return ROUTINE_COLORS[(r?.colorIndex??0) % ROUTINE_COLORS.length]; }
function getTrackingType(ex) { return TRACKING_TYPES.find(t=>t.value===(ex?.trackingType||'reps'))||TRACKING_TYPES[0]; }
function el(tag,cls) { const e=document.createElement(tag); if(cls) e.className=cls; return e; }
function formatSeconds(sec) {
  if(!sec) return '0s';
  const m=Math.floor(sec/60), s=sec%60;
  return m>0?`${m}m ${s}s`:`${s}s`;
}
function formatSet(s,tt,num) {
  const p=`Set ${num}: `;
  if(tt.value==='distance') return p+`${s.distance??0}m`+(s.seconds?` · ${formatSeconds(s.seconds)}`:'');
  if(tt.value==='time') return p+(s.weight?`${s.weight}kg · `:'')+formatSeconds(s.seconds??0);
  return p+`${s.weight??0} kg × ${s.reps??0} reps`;
}

/* ── Emoji auto-pick ─────────────────────────────────────── */
const emojiMap = [
  {k:/bench|press|benchpress|chestpress/i,e:'🏋️'},{k:/pushup|opdrukken/i,e:'🤸'},
  {k:/dip/i,e:'📉'},{k:/fly|flys|pecdeck/i,e:'👐'},{k:/dead|deadlift/i,e:'🏋️'},
  {k:/pullup|chinup|chin-up|pull-up/i,e:'🧗'},{k:/row|rowing|latpulldown|pulldown/i,e:'🚣'},
  {k:/shrug|traps/i,e:'🤷'},{k:/squat|hacksquat|legpress/i,e:'🦵'},
  {k:/lunge|split|bulgarian/i,e:'🧎'},{k:/calf|calves/i,e:'🧍'},
  {k:/curl|bicep|hammer/i,e:'💪'},{k:/tricep|pushdown|skull/i,e:'💪'},
  {k:/lateral|raise|delt/i,e:'🪽'},{k:/abs|crunch|situp|plank|core/i,e:'🧱'},
  {k:/snatch|clean|jerk|kettlebell/i,e:'🏋️'},{k:/run|jog|sprint|treadmill/i,e:'🏃'},
  {k:/bike|cycling|cycle|spinning/i,e:'🚴'},{k:/swim|swimming/i,e:'🏊'},
  {k:/stair|stepper/i,e:'🪜'},{k:/jump|skipping/i,e:'🪢'},
  {k:/elliptical|crosstrainer/i,e:'⛷️'},{k:/walk|hike/i,e:'🥾'},
  {k:/box|boxing|punch|kick/i,e:'🥊'},{k:/yoga|stretch|mobility/i,e:'🧘'},
  {k:/rest|break/i,e:'😴'},
];
function pickEmoji(name) { for(const m of emojiMap) if(m.k.test(name)) return m.e; return '🏋️'; }

/* ── Dark mode ───────────────────────────────────────────── */
function applyDarkMode(on) {
  document.documentElement.classList.toggle('dark', on);
  document.getElementById('btn-dark-mode').textContent = on ? '☀️' : '🌙';
  state.settings.darkMode = on;
}

/* ── Navigation ──────────────────────────────────────────── */
let currentView = 'view-dashboard';
let isWorkoutActive = false;

function showView(id) {
  if (currentView === 'view-workout' && id !== 'view-workout') {
    if (workoutTimerInterval) { clearInterval(workoutTimerInterval); workoutTimerInterval = null; }
    isWorkoutActive = false;
  }
  document.querySelectorAll('#views > section').forEach(s=>s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  currentView = id;
  document.querySelectorAll('.nav-item').forEach(btn=>{
    const active = btn.dataset.view===id;
    const icon = btn.querySelector('.nav-icon');
    const lbl  = btn.querySelector('.nav-label');
    if(icon) icon.style.color = active?'#0ea5e9':'#94a3b8';
    if(lbl)  lbl.style.color  = active?'#0ea5e9':'#94a3b8';
  });
  if (id==='view-prs')      renderPRs();
  if (id==='view-catalog')  { renderCatalog(); renderRoutines(); }
}

/* ── Today's Plan ────────────────────────────────────────── */
function renderTodayPlan() {
  const wrap = document.getElementById('today-plan'); wrap.innerHTML = '';
  const today = todayISO();
  const routineId = state.schedules[today];
  const routine = routineId ? state.routines.find(r => r.id === routineId) : null;
  const hasWorkout = state.workouts.some(w => w.date === today);

  const card = el('div', 'rounded-2xl overflow-hidden shadow-sm slide-up');
  card.style.backgroundColor = routine ? getRoutineColor(routine).light : '#f8fafc';

  if (routine && !hasWorkout) {
    const c = getRoutineColor(routine);
    const inner = el('div', 'p-4 space-y-3');
    const top = el('div', 'flex items-center gap-3');
    const dot = el('div', 'w-4 h-4 rounded-full shrink-0'); dot.style.backgroundColor = c.bg;
    const title = el('div', 'font-bold text-lg'); title.textContent = routine.name;
    top.append(dot, title); inner.appendChild(top);

    const exList = el('div', 'space-y-1.5');
    routine.exercises.forEach(eid => {
      const ex = state.exercises.find(x => x.id === eid); if (!ex) return;
      const row = el('div', 'flex items-center gap-2 text-sm');
      row.innerHTML = `<span>${ex.emoji}</span><span>${ex.name}</span>`;
      exList.appendChild(row);
    });
    inner.appendChild(exList);

    const startBtn = el('button', `w-full py-3.5 rounded-xl text-white font-bold text-base touch-btn start-pulse`);
    startBtn.style.backgroundColor = c.bg;
    startBtn.textContent = '▶ Start Workout';
    startBtn.addEventListener('click', () => openWorkoutView(routine));
    inner.appendChild(startBtn);
    card.appendChild(inner);
  } else if (routine && hasWorkout) {
    const c = getRoutineColor(routine);
    const inner = el('div', 'p-4 flex items-center gap-3');
    const dot = el('div', 'w-4 h-4 rounded-full shrink-0'); dot.style.backgroundColor = c.bg;
    const txt = el('div', 'flex-1');
    txt.innerHTML = `<div class="font-semibold">${routine.name}</div><div class="text-sm text-slate-500">Done for today! ✓</div>`;
    inner.append(dot, txt); card.appendChild(inner);
  } else {
    const inner = el('div', 'p-4 space-y-3');
    const title = el('div', 'font-semibold text-sm text-slate-500'); title.textContent = today;
    const msg = el('div', 'text-base'); msg.textContent = 'Nothing planned today';
    inner.appendChild(title);
    inner.appendChild(msg);
    const planBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn text-sm');
    planBtn.textContent = '📋 Plan Today';
    planBtn.addEventListener('click', () => showScheduleModal(today, null));
    inner.appendChild(planBtn);
    card.appendChild(inner);
  }
  wrap.appendChild(card);
}

/* ── Stats ────────────────────────────────────────────────── */
function renderStats() {
  const row = document.getElementById('stats-row'); row.innerHTML = '';
  const total = state.workouts.length;
  const streak = calcStreak();
  const vol = weeklyVolume();

  const cards = [
    { val: `${total}`, lbl: 'Workouts' },
    { val: vol >= 1000 ? `${(vol/1000).toFixed(1)}t` : `${Math.round(vol)}`, lbl: 'Kg / week' },
    { val: `${streak}🔥`, lbl: 'Day streak' },
  ];
  cards.forEach(c => {
    const d = el('div', 'bg-white rounded-xl p-3 shadow-sm text-center');
    d.innerHTML = `<div class="text-xl font-bold text-slate-800">${c.val}</div><div class="text-xs text-slate-400 mt-0.5">${c.lbl}</div>`;
    row.appendChild(d);
  });
}

function calcStreak() {
  const dates = [...new Set(state.workouts.map(w=>w.date))].sort().reverse();
  if(!dates.length) return 0;
  let streak=0, cur=new Date();
  for(const d of dates) {
    const diff = Math.round((cur - new Date(d)) / 86400000);
    if(diff<=1) { streak++; cur=new Date(d); }
    else break;
  }
  return streak;
}

function weeklyVolume() {
  const mon = new Date(); mon.setDate(mon.getDate()-mon.getDay());
  const monISO = todayISO(mon);
  return state.workouts
    .filter(w=>w.date>=monISO)
    .flatMap(w=>w.exercises.flatMap(ex=>ex.sets.map(s=>(s.weight||0)*(s.reps||1))))
    .reduce((a,b)=>a+b,0);
}

/* ── Calendar ────────────────────────────────────────────── */
let calendarDate = new Date();
function startOfMonth(d) { return new Date(d.getFullYear(),d.getMonth(),1); }
function endOfMonth(d)   { return new Date(d.getFullYear(),d.getMonth()+1,0); }

function renderCalendar() {
  const grid=document.getElementById('calendar-grid'); grid.innerHTML='';
  const start=startOfMonth(calendarDate), end=endOfMonth(calendarDate);
  const todayStr=todayISO();
  document.getElementById('month-label').textContent=start.toLocaleString(undefined,{month:'long',year:'numeric'});
  renderCalendarLegend(start,end);
  const firstDay=start.getDay();
  for(let i=0;i<firstDay;i++) grid.appendChild(el('div',''));
  for(let d=1;d<=end.getDate();d++){
    const date=new Date(start.getFullYear(),start.getMonth(),d);
    const iso=todayISO(date);
    const isToday=iso===todayStr;
    const workout=state.workouts.find(w=>w.date===iso);
    const routineId=state.schedules[iso];
    const routine=routineId?state.routines.find(r=>r.id===routineId):null;
    const color=routine?getRoutineColor(routine):null;
    const cell=el('button',`calendar-day rounded-xl p-1.5 text-left flex flex-col relative overflow-hidden active:scale-95 transition-transform ${isToday?'ring-2 ring-sky-400':''}`);
    cell.setAttribute('type','button');
    if(workout) cell.style.backgroundColor=color?color.bg:'#bae6fd';
    else if(routine) cell.style.backgroundColor=color.light;
    else cell.style.backgroundColor='#f8fafc';
    const dayNum=el('div',`text-xs font-semibold leading-none mb-1 ${isToday?'text-sky-600':(workout||routine)?'text-slate-700':'text-slate-400'}`);
    dayNum.textContent=d; cell.appendChild(dayNum);
    if(workout) { const dot=el('div','w-2 h-2 rounded-full mx-auto mt-auto'); dot.style.backgroundColor='white'; cell.appendChild(dot); }
    else if(routine) { const dot=el('div','w-2 h-2 rounded-full mx-auto mt-auto'); dot.style.backgroundColor=color.bg; cell.appendChild(dot); }
    cell.addEventListener('click',()=>onDayClick(iso));
    grid.appendChild(cell);
  }
}
function renderCalendarLegend(start,end) {
  const legend=document.getElementById('calendar-legend'); legend.innerHTML='';
  const seen=new Set();
  for(let d=1;d<=end.getDate();d++){
    const iso=todayISO(new Date(start.getFullYear(),start.getMonth(),d));
    const rId=state.schedules[iso];
    if(rId&&!seen.has(rId)){ seen.add(rId);
      const r=state.routines.find(x=>x.id===rId); if(!r) continue;
      const c=getRoutineColor(r);
      const item=el('div','flex items-center gap-1.5 text-xs text-slate-600');
      const dot=el('span','inline-block w-2.5 h-2.5 rounded-full shrink-0'); dot.style.backgroundColor=c.bg;
      const lbl=el('span'); lbl.textContent=r.name; item.append(dot,lbl); legend.appendChild(item);
    }
  }
}
function onDayClick(iso) {
  const workout=state.workouts.find(w=>w.date===iso);
  if(iso<=todayISO()&&workout){ showWorkoutSummaryModal(workout); return; }
  showScheduleModal(iso,state.schedules[iso]);
}

/* ── Modals ──────────────────────────────────────────────── */
function showModal(content,title) {
  const root=document.getElementById('modal-root'); root.innerHTML='';
  const overlay=el('div','fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-30');
  const panel=el('div','bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col');
  const handle=el('div','flex justify-center pt-3 pb-1 sm:hidden');
  handle.appendChild(el('div','w-10 h-1 bg-slate-300 rounded-full')); panel.appendChild(handle);
  if(title){
    const hdr=el('div','px-4 pb-3 pt-1 border-b flex items-center justify-between');
    const h=el('h3','text-base font-semibold'); h.textContent=title;
    const x=el('button','w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg touch-btn');
    x.textContent='×'; x.addEventListener('click',closeModal); hdr.append(h,x); panel.appendChild(hdr);
  }
  const body=el('div','flex-1 overflow-y-auto modal-scroll p-4'); body.appendChild(content); panel.appendChild(body);
  overlay.appendChild(panel);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) closeModal(); });
  root.appendChild(overlay);
}
function closeModal() { document.getElementById('modal-root').innerHTML=''; }

/* ── Schedule modal ──────────────────────────────────────── */
function showScheduleModal(iso,scheduled) {
  const content=el('div','space-y-3');
  const lbl=el('p','text-sm text-slate-500'); lbl.textContent=`Pick a routine for ${iso}`; content.appendChild(lbl);
  if(!state.routines.length){
    const msg=el('p','text-sm text-slate-400 py-4 text-center'); msg.textContent='No routines yet. Create one in Catalog.'; content.appendChild(msg);
  } else {
    const grid=el('div','grid gap-2');
    state.routines.forEach(r=>{
      const c=getRoutineColor(r);
      const btn=el('button',`p-3 rounded-xl border-2 flex items-center gap-3 w-full text-left touch-btn ${scheduled===r.id?'border-slate-800':'border-transparent'}`);
      btn.style.backgroundColor=c.light;
      const dot=el('span','w-4 h-4 rounded-full shrink-0'); dot.style.backgroundColor=c.bg;
      const nm=el('span','font-medium text-sm'); nm.textContent=r.name; btn.append(dot,nm);
      btn.addEventListener('click',()=>{ state.schedules[iso]=r.id; saveState(state); closeModal(); renderCalendar(); renderTodayPlan(); });
      grid.appendChild(btn);
    }); content.appendChild(grid);
  }
  if(scheduled){
    const clr=el('button','mt-2 w-full py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium touch-btn');
    clr.textContent='Remove scheduled routine';
    clr.addEventListener('click',()=>{ delete state.schedules[iso]; saveState(state); closeModal(); renderCalendar(); renderTodayPlan(); });
    content.appendChild(clr);
  }
  showModal(content,`Schedule — ${iso}`);
}

/* ── Workout Full-Screen View ────────────────────────────── */
let workoutTimerInterval = null;
let workoutStartTime = null;

function openWorkoutView(routine) {
  const section = document.getElementById('view-workout');
  section.innerHTML = '';
  const today = todayISO();
  workoutStartTime = Date.now();
  isWorkoutActive = true;

  // Validate exercise IDs
  const validIds = routine.exercises.filter(id => state.exercises.some(e => e.id === id));
  if (!validIds.length) {
    alert('This routine has no valid exercises. Add exercises first.');
    return;
  }

  const c = getRoutineColor(routine);
  let timerSeconds = 0;

  // Timer update
  function updateTimer() {
    const sec = Math.floor((Date.now() - workoutStartTime) / 1000);
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Build header
  const header = el('div', 'flex items-center justify-between bg-white rounded-xl p-3 shadow-sm');
  const cancelBtn = el('button', 'text-sm text-slate-500 font-medium touch-btn px-2');
  cancelBtn.textContent = '← Cancel';
  cancelBtn.addEventListener('click', () => {
    if (confirm('Cancel this workout? Progress will be lost.')) {
      if (workoutTimerInterval) { clearInterval(workoutTimerInterval); workoutTimerInterval = null; }
      showView('view-dashboard');
    }
  });
  const title = el('div', 'font-bold text-sm'); title.textContent = routine.name;
  const timerEl = el('div', 'text-sm font-mono tabular-nums text-slate-500');
  timerEl.textContent = '0:00';
  header.append(cancelBtn, title, timerEl);

  // Timer
  if (workoutTimerInterval) clearInterval(workoutTimerInterval);
  workoutTimerInterval = setInterval(() => {
    timerEl.textContent = updateTimer();
  }, 1000);

  // Progress bar
  const progressWrap = el('div', 'space-y-1');
  const progressText = el('div', 'text-xs text-slate-400 font-medium');
  const progressBar = el('div', 'w-full h-1.5 bg-slate-200 rounded-full overflow-hidden');
  const progressFill = el('div', 'h-full rounded-full transition-all duration-300');
  progressFill.style.width = '0%';
  progressFill.style.backgroundColor = c.bg;
  progressBar.appendChild(progressFill);
  progressWrap.append(progressText, progressBar);

  // Exercises container
  const exContainer = el('div', 'space-y-3');

  // Track completed exercises (have at least one filled set)
  const completedStatus = validIds.map(() => false);

  function updateProgress() {
    const done = completedStatus.filter(Boolean).length;
    const total = validIds.length;
    progressText.textContent = `${done}/${total} exercises done`;
    progressFill.style.width = `${(done / total) * 100}%`;
  }
  updateProgress();

  function buildExerciseBlock(exId, index) {
    const ex = state.exercises.find(e => e.id === exId) || { id: exId, name: 'Custom', emoji: '🏋️', trackingType: 'reps' };
    const tt = getTrackingType(ex);

    // Get previous workout data for this exercise
    const prevWorkout = state.workouts.filter(w => w.exercises.some(e => e.exerciseId === exId)).slice(-1)[0];
    const prevSets = prevWorkout ? prevWorkout.exercises.find(e => e.exerciseId === exId)?.sets || [] : [];

    const block = el('div', 'bg-white rounded-xl p-3 shadow-sm space-y-2');
    block.dataset.exId = ex.id;

    // Exercise header
    const hdr = el('div', 'flex items-center gap-2');
    hdr.innerHTML = `<div class="text-2xl">${ex.emoji}</div><div><div class="font-semibold text-sm">${ex.name}</div><div class="text-xs text-slate-400">${tt.icon} ${tt.label}</div></div>`;
    block.appendChild(hdr);

    // Previous workout hint
    if (prevSets.length) {
      const hint = el('div', 'text-xs bg-sky-50 text-sky-600 rounded-lg px-2 py-1');
      hint.textContent = 'Last: ' + prevSets.slice(0, 3).map((s, i) => formatSet(s, tt, i + 1).replace(`Set ${i+1}: `, '')).join(' · ');
      block.appendChild(hint);
    }

    // Column headers
    const colHdr = el('div', 'flex gap-2 text-xs text-slate-400 px-0.5');
    colHdr.innerHTML = `<span class="flex-1 text-center">${tt.col1}</span><span class="flex-1 text-center">${tt.col2}</span><span class="w-11"></span>`;
    block.appendChild(colHdr);

    // Sets container
    const setsDiv = el('div', 'space-y-1.5');
    block.appendChild(setsDiv);

    function createSetRow(prevSet = null) {
      const row = el('div', 'flex gap-2 items-center');
      row.dataset.setRow = '1';
      const c1 = el('input', 'flex-1 p-2.5 border border-slate-200 rounded-xl text-center bg-white');
      c1.type = 'number'; c1.placeholder = tt.ph1; c1.inputMode = tt.mode1; c1.autocomplete = 'off';
      if (prevSet && (prevSet.weight || prevSet.distance)) c1.value = prevSet.weight || prevSet.distance;
      const c2 = el('input', 'flex-1 p-2.5 border border-slate-200 rounded-xl text-center bg-white');
      c2.type = 'number'; c2.placeholder = tt.ph2; c2.inputMode = tt.mode2; c2.autocomplete = 'off';
      if (prevSet && (prevSet.reps || prevSet.seconds)) c2.value = prevSet.reps || prevSet.seconds;
      const doneBtn = el('button', 'w-11 h-11 flex items-center justify-center rounded-xl shrink-0 touch-btn');
      doneBtn.setAttribute('type', 'button');
      doneBtn.textContent = '○';
      doneBtn.style.color = '#94a3b8';
      doneBtn.style.backgroundColor = '#f1f5f9';
      doneBtn.addEventListener('click', () => {
        if (doneBtn.textContent === '○') {
          doneBtn.textContent = '✓';
          doneBtn.style.color = '#fff';
          doneBtn.style.backgroundColor = '#22c55e';
        } else {
          doneBtn.textContent = '○';
          doneBtn.style.color = '#94a3b8';
          doneBtn.style.backgroundColor = '#f1f5f9';
        }
        checkExerciseDone(block, index);
      });
      const rem = el('button', 'w-9 h-9 flex items-center justify-center rounded-lg text-red-300 shrink-0 touch-btn text-sm');
      rem.setAttribute('type', 'button');
      rem.textContent = '×';
      rem.addEventListener('click', () => { row.remove(); checkExerciseDone(block, index); });
      row.append(c1, c2, doneBtn, rem);
      return row;
    }

    function checkExerciseDone(block, idx) {
      const rows = block.querySelectorAll('[data-set-row]');
      let anyFilled = false;
      rows.forEach(r => {
        const inputs = r.querySelectorAll('input');
        if (inputs.length >= 2) {
          const v1 = parseFloat(inputs[0].value);
          const v2 = parseFloat(inputs[1].value);
          if (!isNaN(v1) || !isNaN(v2)) anyFilled = true;
        }
      });
      // Also check if any set is marked done
      const doneBtns = block.querySelectorAll('[data-set-row] button:first-of-type');
      doneBtns.forEach(b => { if (b.textContent === '✓') anyFilled = true; });
      completedStatus[idx] = anyFilled;
      updateProgress();
    }

    // Pre-fill from previous workout
    if (prevSets.length) prevSets.forEach(s => setsDiv.appendChild(createSetRow(s)));
    else setsDiv.appendChild(createSetRow());

    const addSetBtn = el('button', 'w-full py-2 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 touch-btn mt-1');
    addSetBtn.setAttribute('type', 'button');
    addSetBtn.textContent = '+ Add Set';
    addSetBtn.addEventListener('click', () => setsDiv.insertBefore(createSetRow(), addSetBtn));
    block.appendChild(addSetBtn);

    return block;
  }

  validIds.forEach((id, i) => exContainer.appendChild(buildExerciseBlock(id, i)));

  // Notes
  const notesInput = el('textarea', 'w-full p-3 border border-slate-200 rounded-xl text-sm resize-none outline-none bg-white');
  notesInput.rows = 2; notesInput.placeholder = 'Notes (optional)…';

  // Save button
  const saveBtn = el('button', `w-full py-3.5 rounded-xl text-white font-bold text-base touch-btn`);
  saveBtn.style.backgroundColor = c.bg;
  saveBtn.textContent = '💾 Finish Workout';
  saveBtn.addEventListener('click', () => {
    const blocks = Array.from(exContainer.querySelectorAll('[data-ex-id]'));
    if (!blocks.length) { alert('No exercises found'); return; }
    const durationMin = Math.round((Date.now() - workoutStartTime) / 60000);
    const workout = { id: uid('wo'), date: today, exercises: [], durationMin, notes: notesInput.value.trim() || undefined };
    for (const b of blocks) {
      const ex = state.exercises.find(e => e.id === b.dataset.exId) || { id: b.dataset.exId, trackingType: 'reps' };
      const tt = getTrackingType(ex);
      const sets = [];
      for (const row of b.querySelectorAll('[data-set-row]')) {
        const inputs = row.querySelectorAll('input');
        if (inputs.length < 2) continue;
        const v1 = parseFloat(inputs[0].value), v2 = parseFloat(inputs[1].value);
        if (isNaN(v1) && isNaN(v2)) continue;
        const a = isNaN(v1) ? 0 : v1, b2 = isNaN(v2) ? 0 : v2;
        if (tt.value === 'distance') sets.push({ distance: a, seconds: b2, trackingType: tt.value });
        else if (tt.value === 'time') sets.push({ weight: a, seconds: b2, trackingType: tt.value });
        else sets.push({ weight: a, reps: b2, trackingType: tt.value });
      }
      if (sets.length) workout.exercises.push({ exerciseId: ex.id, sets });
    }
    if (!workout.exercises.length) { alert('Log at least one set'); return; }
    const newPRs = checkAndUpdatePRs(workout);
    state.workouts.push(workout); saveState(state);
    if (workoutTimerInterval) { clearInterval(workoutTimerInterval); workoutTimerInterval = null; }
    showView('view-dashboard');
    renderCalendar(); renderTodayPlan(); renderStats(); renderRecentWorkouts();
    if (newPRs.length) {
      setTimeout(() => showPRCelebration(newPRs[0].name, newPRs[0].val, newPRs[0].unit), 300);
    }
  });

  section.append(header, progressWrap, exContainer, notesInput, saveBtn);
  showView('view-workout');
}

function checkAndUpdatePRs(workout) {
  const newPRs = [];
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      const prev = state.prs[ex.exerciseId];
      const exercise = state.exercises.find(e => e.id === ex.exerciseId) || { trackingType: 'reps' };
      const tt = getTrackingType(exercise);
      const val = tt.value === 'distance' ? (s.distance || 0) : tt.value === 'time' ? (s.seconds || 0) : (s.weight || 0);
      const prevVal = prev ? (tt.value === 'distance' ? (prev.distance || 0) : tt.value === 'time' ? (prev.seconds || 0) : (prev.weight || 0)) : 0;
      if (val > prevVal) {
        state.prs[ex.exerciseId] = { weight: s.weight, reps: s.reps, seconds: s.seconds, distance: s.distance, date: workout.date };
        const unit = tt.value === 'distance' ? 'm' : tt.value === 'time' ? 's' : 'kg';
        newPRs.push({ name: exercise.name || 'Exercise', val, unit });
      }
    }
  }
  return newPRs;
}

/* ── PR celebration ──────────────────────────────────────── */
function showPRCelebration(exName, value, unit) {
  const existing = document.getElementById('pr-celebration');
  if (existing) existing.remove();
  const overlay = el('div', 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center pointer-events-none');
  overlay.id = 'pr-celebration';
  const box = el('div', 'bg-white rounded-2xl p-8 text-center pr-pop mx-6');
  box.innerHTML = `<div class="text-5xl mb-2">🏆</div><div class="text-xl font-bold text-slate-800">New PR!</div><div class="text-slate-500 text-sm mt-1">${exName}: ${value}${unit}</div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2500);
}

/* ── Workout summary modal ───────────────────────────────── */
function showWorkoutSummaryModal(workout) {
  const content=el('div','space-y-3');
  if(workout.durationMin){
    const dur=el('div','flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2');
    dur.innerHTML=`⏱️ <span>${workout.durationMin} min</span>`; content.appendChild(dur);
  }
  if(workout.notes){
    const note=el('div','text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2 italic');
    note.textContent=`"${workout.notes}"`; content.appendChild(note);
  }
  workout.exercises.forEach(ex=>{
    const exercise=state.exercises.find(e=>e.id===ex.exerciseId)||{name:'Unknown',emoji:'🏋️',trackingType:'reps'};
    const tt=getTrackingType(exercise);
    const wrap=el('div','border-b pb-3');
    const ttl=el('div','flex items-center gap-2 mb-1');
    ttl.innerHTML=`<div class="text-2xl">${exercise.emoji}</div><div><div class="font-semibold">${exercise.name}</div></div>`;
    wrap.appendChild(ttl);
    ex.sets.forEach((s,i)=>{ const row=el('div','text-sm text-slate-600 ml-10'); row.textContent=formatSet(s,tt,i+1); wrap.appendChild(row); });
    content.appendChild(wrap);
  });
  const closeBtn=el('button','mt-2 w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  closeBtn.textContent='Close'; closeBtn.addEventListener('click',closeModal);
  content.appendChild(closeBtn);
  showModal(content,`Workout — ${workout.date}`);
}

/* ── Recent Workouts ─────────────────────────────────────── */
function renderRecentWorkouts() {
  const wrap=document.getElementById('recent-workouts'); wrap.innerHTML='';
  if(!state.workouts.length) return;
  const heading=el('h3','text-sm font-semibold text-slate-500 mb-2 px-1'); heading.textContent='Recent Workouts'; wrap.appendChild(heading);
  state.workouts.slice(-5).reverse().forEach(w=>{
    const card=el('button','workout-card w-full bg-white p-3 rounded-xl shadow-sm mb-2 flex items-center justify-between text-left touch-btn');
    const left=el('div');
    const date=el('div','text-sm font-medium'); date.textContent=w.date;
    const icons=el('div','text-xs text-slate-400 mt-0.5');
    icons.textContent=w.exercises.map(ex=>{ const e=state.exercises.find(x=>x.id===ex.exerciseId); return e?e.emoji:''; }).join(' ');
    left.append(date,icons);
    const right=el('div','text-xs text-slate-400');
    const exCount=el('div'); exCount.textContent=`${w.exercises.length} exercises`;
    const dur=el('div','text-xs text-slate-300');
    if(w.durationMin) dur.textContent=`${w.durationMin} min`;
    right.append(exCount,dur);
    card.append(left,right);
    card.addEventListener('click',()=>showWorkoutSummaryModal(w));
    wrap.appendChild(card);
  });
}

/* ── Categories ──────────────────────────────────────────── */
const collapsedCategories = new Set();

function renderCatalog(filter='') {
  const list=document.getElementById('catalog-list'); list.innerHTML='';
  const allExercises=filter?state.exercises.filter(ex=>ex.name.toLowerCase().includes(filter.toLowerCase())):state.exercises;
  const uncategorized=allExercises.filter(ex=>!ex.categoryId);
  state.categories.forEach(cat=>{
    const catExercises=allExercises.filter(ex=>ex.categoryId===cat.id);
    if(filter&&catExercises.length===0) return;
    const section=el('div','rounded-xl overflow-hidden border border-slate-200');
    const catHeader=el('button','w-full flex items-center justify-between px-3 py-2.5 bg-slate-100 text-left');
    const leftH=el('div','flex items-center gap-2');
    const arrow=el('span','text-slate-400 text-xs transition-transform duration-200'); arrow.textContent='▼';
    const catName=el('span','font-semibold text-sm text-slate-700'); catName.textContent=cat.name;
    const count=el('span','text-xs text-slate-400 ml-1'); count.textContent=`(${catExercises.length})`;
    leftH.append(arrow,catName,count);
    const catBtns=el('div','flex items-center gap-1');
    const editCat=el('button','p-1.5 rounded-lg text-slate-400');
    editCat.innerHTML=`<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
    editCat.addEventListener('click',e=>{ e.stopPropagation(); showEditCategoryModal(cat); });
    const delCat=el('button','p-1.5 rounded-lg text-red-300');
    delCat.innerHTML=`<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    delCat.addEventListener('click',e=>{ e.stopPropagation(); if(!confirm(`Delete category "${cat.name}"?`)) return;
      state.exercises.forEach(ex=>{ if(ex.categoryId===cat.id) delete ex.categoryId; });
      state.categories=state.categories.filter(c=>c.id!==cat.id); saveState(state);
      renderCatalog(document.getElementById('catalog-search').value); });
    catBtns.append(editCat,delCat); catHeader.append(leftH,catBtns);
    let collapsed=collapsedCategories.has(cat.id);
    const body=el('div','divide-y divide-slate-100');
    if(collapsed){ body.style.display='none'; arrow.style.transform='rotate(-90deg)'; }
    catHeader.addEventListener('click',()=>{ collapsed=!collapsed;
      if(collapsed) collapsedCategories.add(cat.id); else collapsedCategories.delete(cat.id);
      body.style.display=collapsed?'none':''; arrow.style.transform=collapsed?'rotate(-90deg)':''; });
    section.append(catHeader,body);
    catExercises.forEach(ex=>body.appendChild(buildExerciseRow(ex)));
    if(!catExercises.length&&!filter){ const e=el('div','px-3 py-3 text-xs text-slate-400'); e.textContent='No exercises in this category.'; body.appendChild(e); }
    list.appendChild(section);
  });
  if(uncategorized.length>0||(!filter&&state.categories.length===0)){
    const section=el('div','space-y-1.5');
    if(state.categories.length>0){ const lbl=el('p','text-xs font-semibold text-slate-400 px-1 mt-2'); lbl.textContent='Uncategorized'; section.appendChild(lbl); }
    uncategorized.forEach(ex=>section.appendChild(buildExerciseRow(ex)));
    if(!uncategorized.length&&!filter){ const e=el('div','text-center text-slate-400 py-6 text-sm'); e.textContent='No exercises yet. You can also use the Catalog tab to create exercises.'; section.appendChild(e); }
    list.appendChild(section);
  }
  if(filter&&allExercises.length===0){ const e=el('div','text-center text-slate-400 py-6 text-sm'); e.textContent='No exercises match your search.'; list.appendChild(e); }
}

function buildExerciseRow(ex) {
  const tt=getTrackingType(ex);
  const row=el('div','bg-white p-3 flex items-center justify-between');
  row.innerHTML=`<div class="flex items-center gap-3 min-w-0"><div class="text-2xl w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl shrink-0">${ex.emoji}</div><div class="min-w-0"><div class="font-medium text-sm truncate">${ex.name}</div><div class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">${tt.icon} <span>${tt.label}</span></div></div></div>`;
  const btns=el('div','flex gap-1.5 shrink-0 ml-2');
  const editBtn=el('button','p-2 rounded-xl bg-sky-50 text-sky-500 touch-btn');
  editBtn.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
  editBtn.addEventListener('click',()=>showExerciseModal(ex));
  const delBtn=el('button','p-2 rounded-xl bg-red-50 text-red-500 touch-btn');
  delBtn.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
  delBtn.addEventListener('click',()=>{ state.exercises=state.exercises.filter(e=>e.id!==ex.id); saveState(state); renderCatalog(document.getElementById('catalog-search').value); renderRoutines(); });
  btns.append(editBtn,delBtn); row.appendChild(btns); return row;
}

/* ── Category modals ─────────────────────────────────────── */
function showEditCategoryModal(cat) {
  const content=el('div','space-y-3');
  const input=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400'); input.value=cat.name;
  content.appendChild(input);
  const saveBtn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn'); saveBtn.textContent='Save';
  saveBtn.addEventListener('click',()=>{ const name=input.value.trim(); if(!name) return; cat.name=name; saveState(state); closeModal(); renderCatalog(document.getElementById('catalog-search').value); });
  content.appendChild(saveBtn); showModal(content,'Rename Category'); setTimeout(()=>input.focus(),100);
}
function showNewCategoryModal() {
  const content=el('div','space-y-3');
  const input=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400'); input.placeholder='e.g. Chest, Legs, Cardio…';
  content.appendChild(input);
  const saveBtn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn'); saveBtn.textContent='Create Category';
  saveBtn.addEventListener('click',()=>{ const name=input.value.trim(); if(!name){ input.focus(); return; } state.categories.push({id:uid('cat'),name}); saveState(state); closeModal(); renderCatalog(document.getElementById('catalog-search').value); });
  content.appendChild(saveBtn); showModal(content,'New Category'); setTimeout(()=>input.focus(),100);
}

/* ── Exercise modal (create + edit) ─────────────────────── */
function showExerciseModal(existing=null) {
  const isEdit=!!existing;
  const content=el('div','space-y-3');
  const nameInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');
  nameInput.placeholder='e.g. Bench Press'; if(isEdit) nameInput.value=existing.name; content.appendChild(nameInput);
  const preview=el('div','text-2xl text-center py-2 bg-slate-50 rounded-xl');
  preview.textContent=(isEdit?existing.emoji:'🏋️')+(isEdit?'  '+existing.name:'');
  nameInput.addEventListener('input',()=>{ preview.textContent=pickEmoji(nameInput.value)+'  '+(nameInput.value||''); }); content.appendChild(preview);
  const catLabel=el('p','text-sm font-medium text-slate-600'); catLabel.textContent='Category'; content.appendChild(catLabel);
  const catSel=el('select','w-full p-3 border border-slate-200 rounded-xl bg-white');
  catSel.innerHTML=`<option value="">— None —</option>`+state.categories.map(c=>`<option value="${c.id}" ${isEdit&&existing.categoryId===c.id?'selected':''}>${c.name}</option>`).join('');
  content.appendChild(catSel);
  const typeLabel=el('p','text-sm font-medium text-slate-600'); typeLabel.textContent='Tracking type'; content.appendChild(typeLabel);
  let selectedType=isEdit?(existing.trackingType||'reps'):'reps';
  const typeGrid=el('div','grid grid-cols-3 gap-2');
  TRACKING_TYPES.forEach((t)=>{
    const btn=el('button','flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-sm font-medium transition-all touch-btn');
    btn.setAttribute('type','button'); btn.innerHTML=`<span class="text-xl">${t.icon}</span><span>${t.label}</span>`;
    btn.addEventListener('click',()=>{ selectedType=t.value; refreshTypeGrid(); }); typeGrid.appendChild(btn);
  });
  const refreshTypeGrid=()=>{ typeGrid.querySelectorAll('button').forEach((b,j)=>{ const a=TRACKING_TYPES[j].value===selectedType; b.style.borderColor=a?'#1e293b':'#e2e8f0'; b.style.backgroundColor=a?'#1e293b':'#f8fafc'; b.style.color=a?'#fff':'#475569'; }); };
  content.appendChild(typeGrid); setTimeout(refreshTypeGrid,0);
  const saveBtn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  saveBtn.textContent=isEdit?'Save Changes':'Create Exercise';
  saveBtn.addEventListener('click',()=>{
    const name=nameInput.value.trim(); if(!name){ nameInput.focus(); return; }
    const emoji=pickEmoji(name); const catId=catSel.value||undefined;
    if(isEdit){ existing.name=name; existing.emoji=emoji; existing.trackingType=selectedType; if(catId) existing.categoryId=catId; else delete existing.categoryId; }
    else { const obj={id:uid('ex'),name,emoji,trackingType:selectedType}; if(catId) obj.categoryId=catId; state.exercises.push(obj); }
    saveState(state); closeModal(); renderCatalog(document.getElementById('catalog-search').value); renderRoutines();
  });
  content.appendChild(saveBtn); showModal(content,isEdit?'Edit Exercise':'New Exercise'); setTimeout(()=>nameInput.focus(),100);
}

/* ── Routines ────────────────────────────────────────────── */
function renderRoutines() {
  const list=document.getElementById('routines-list'); list.innerHTML='';
  if(!state.routines.length){ const e=el('div','text-center text-slate-400 py-4 text-sm'); e.textContent='No routines yet.'; list.appendChild(e); return; }
  state.routines.forEach(r=>{
    const c=getRoutineColor(r);
    const card=el('div','rounded-xl shadow-sm overflow-hidden'); card.style.backgroundColor=c.light;
    const inner=el('div','p-3 flex items-start justify-between gap-2');
    const bar=el('div','w-1 rounded-full shrink-0 self-stretch'); bar.style.backgroundColor=c.bg;
    const left=el('div','flex-1 min-w-0');
    const title=el('div','font-semibold text-sm'); title.textContent=r.name;
    const det=el('div','text-xs text-slate-500 mt-0.5 truncate');
    det.textContent=r.exercises.map(eid=>{ const ex=state.exercises.find(x=>x.id===eid); return ex?`${ex.emoji} ${ex.name}`:''; }).filter(Boolean).join(' · ')||'No exercises';
    left.append(title,det);
    const btns=el('div','flex gap-2 shrink-0');
    const start=el('button','px-3 py-1.5 text-white rounded-xl text-sm font-medium touch-btn');
    start.setAttribute('type','button');
    start.style.backgroundColor=c.bg; start.textContent='▶ Start';
    start.addEventListener('click',(e)=>{ e.stopPropagation(); const r2=state.routines.find(x=>x.id===r.id); if(r2) openWorkoutView(r2); });
    const editBtn=el('button','px-2 py-1.5 rounded-xl bg-white/60 text-sky-500 touch-btn');
    editBtn.setAttribute('type','button');
    editBtn.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
    editBtn.addEventListener('click',(e)=>{ e.stopPropagation(); showRoutineModal(r); });
    const del=el('button','px-2 py-1.5 rounded-xl bg-white/60 text-red-500 touch-btn');
    del.setAttribute('type','button');
    del.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    del.addEventListener('click',(e)=>{ e.stopPropagation(); state.routines=state.routines.filter(rr=>rr.id!==r.id); saveState(state); renderRoutines(); });
    btns.append(start,editBtn,del); inner.append(bar,left,btns); card.appendChild(inner); list.appendChild(card);
  });
}

/* ── Routine modal (create + edit) ──────────────────────── */
function showRoutineModal(existing=null) {
  const isEdit=!!existing;
  const content=el('div','space-y-3');
  const nameInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');
  nameInput.placeholder='Routine name'; if(isEdit) nameInput.value=existing.name; content.appendChild(nameInput);
  const colorLabel=el('p','text-sm font-medium text-slate-600'); colorLabel.textContent='Color'; content.appendChild(colorLabel);
  let selectedColorIndex=isEdit?(existing.colorIndex??0):0;
  const colorGrid=el('div','flex flex-wrap gap-2');
  ROUTINE_COLORS.forEach((c,i)=>{
    const sw=el('button','color-swatch touch-btn'+(i===selectedColorIndex?' selected':''));
    sw.style.backgroundColor=c.bg; sw.title=c.name; sw.setAttribute('type','button');
    sw.addEventListener('click',()=>{ selectedColorIndex=i; colorGrid.querySelectorAll('.color-swatch').forEach((s,j)=>s.classList.toggle('selected',j===i)); });
    colorGrid.appendChild(sw);
  }); content.appendChild(colorGrid);
  const searchLabel=el('p','text-sm font-medium text-slate-600'); searchLabel.textContent='Exercises'; content.appendChild(searchLabel);
  const searchWrap=el('div','flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 mb-1');
  const searchIcon=el('span','text-slate-400 text-sm shrink-0'); searchIcon.textContent='🔍';
  const searchInput=el('input','flex-1 py-2.5 px-2 bg-transparent outline-none text-sm'); searchInput.placeholder='Search exercises…';
  searchWrap.append(searchIcon,searchInput); content.appendChild(searchWrap);
  const exList=el('div','grid gap-1.5 max-h-56 overflow-y-auto modal-scroll'); content.appendChild(exList);
  function renderExList(filter=''){
    const checked=new Set(Array.from(exList.querySelectorAll('input:checked')).map(i=>i.value));
    exList.innerHTML='';
    const filtered=filter?state.exercises.filter(ex=>ex.name.toLowerCase().includes(filter.toLowerCase())):state.exercises;
    if(!filtered.length){ const e=el('p','text-sm text-slate-400 text-center py-3'); e.textContent=filter?'No exercises match.':'No exercises yet.'; exList.appendChild(e); return; }
    const byCategory={};
    filtered.forEach(ex=>{ const k=ex.categoryId||'__none__'; if(!byCategory[k]) byCategory[k]=[]; byCategory[k].push(ex); });
    [...state.categories,{id:'__none__',name:'Uncategorized'}].forEach(cat=>{
      const exs=byCategory[cat.id]; if(!exs?.length) return;
      if(state.categories.length>0){ const hdr=el('div','text-xs font-semibold text-slate-400 pt-1 pb-0.5 px-1'); hdr.textContent=cat.id==='__none__'?'Uncategorized':cat.name; exList.appendChild(hdr); }
      exs.forEach(ex=>{
        const isChecked=checked.size?checked.has(ex.id):(isEdit?existing.exercises.includes(ex.id):false);
        const rowLabel=el('label','flex items-center gap-3 p-2.5 border border-slate-100 bg-slate-50 rounded-xl cursor-pointer');
        const cb=el('input','w-5 h-5 accent-slate-800 shrink-0'); cb.type='checkbox'; cb.value=ex.id; cb.checked=isChecked;
        const emojiDiv=el('div','text-xl shrink-0'); emojiDiv.textContent=ex.emoji;
        const nameDiv=el('div','font-medium text-sm'); nameDiv.textContent=ex.name;
        rowLabel.append(cb,emojiDiv,nameDiv); exList.appendChild(rowLabel);
      });
    });
  }
  renderExList(); searchInput.addEventListener('input',()=>renderExList(searchInput.value));
  const saveBtn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-medium touch-btn');
  saveBtn.textContent=isEdit?'Save Changes':'Create Routine';
  saveBtn.addEventListener('click',()=>{
    const name=nameInput.value.trim(); if(!name){ nameInput.focus(); return; }
    const checkedIds=Array.from(exList.querySelectorAll('input[type=checkbox]:checked')).map(i=>i.value);
    if(isEdit){ existing.name=name; existing.colorIndex=selectedColorIndex; existing.exercises=checkedIds; }
    else state.routines.push({id:uid('rt'),name,exercises:checkedIds,colorIndex:selectedColorIndex});
    saveState(state); closeModal(); renderRoutines(); if(isEdit) renderCalendar();
  });
  content.appendChild(saveBtn); showModal(content,isEdit?'Edit Routine':'New Routine'); setTimeout(()=>nameInput.focus(),100);
}

/* ── PRs ─────────────────────────────────────────────────── */
function renderPRs() {
  const list=document.getElementById('prs-list'); list.innerHTML='';
  const entries=Object.entries(state.prs);
  if(!entries.length){ const e=el('div','text-center text-slate-400 py-8 text-sm'); e.textContent='No PRs yet. Complete a workout!'; list.appendChild(e); return; }
  entries.forEach(([exId,pr])=>{
    const ex=state.exercises.find(e=>e.id===exId)||{name:'Unknown',emoji:'🏋️',trackingType:'reps'};
    const tt=getTrackingType(ex);
    const row=el('div','bg-white p-3 rounded-xl flex items-center justify-between shadow-sm');
    let valHtml;
    if(tt.value==='distance') valHtml=`<div class="font-bold text-slate-800">${pr.distance??0}<span class="text-sm font-normal text-slate-400 ml-1">m</span></div>`;
    else if(tt.value==='time') valHtml=`<div class="font-bold text-slate-800">${formatSeconds(pr.seconds??0)}</div>`;
    else valHtml=`<div class="text-lg font-bold text-slate-800">${pr.weight??0}<span class="text-sm font-normal text-slate-400 ml-1">kg</span></div>`;
    row.innerHTML=`<div class="flex items-center gap-3"><div class="text-2xl w-11 h-11 flex items-center justify-center bg-amber-50 rounded-xl">${ex.emoji}</div><div><div class="font-semibold text-sm">${ex.name}</div><div class="text-xs text-slate-400">${pr.date}</div></div></div>${valHtml}`;
    list.appendChild(row);
  });
}

/* ── Search ──────────────────────────────────────────────── */
function bindSearch() {
  const input=document.getElementById('catalog-search');
  const clearBtn=document.getElementById('catalog-search-clear');
  input.addEventListener('input',()=>{ clearBtn.classList.toggle('visible',input.value.length>0); renderCatalog(input.value); });
  clearBtn.addEventListener('click',()=>{ input.value=''; clearBtn.classList.remove('visible'); renderCatalog(''); input.focus(); });
}

/* ── Init ────────────────────────────────────────────────── */
function bindUI() {
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
    if (isWorkoutActive && !confirm('Leave this workout? Progress will be lost.')) return;
    showView(btn.dataset.view);
  }));
  document.getElementById('btn-new-exercise').addEventListener('click',()=>showExerciseModal(null));
  document.getElementById('btn-new-category').addEventListener('click',showNewCategoryModal);
  document.getElementById('btn-new-routine').addEventListener('click',()=>showRoutineModal(null));
  document.getElementById('btn-dark-mode').addEventListener('click',()=>{ applyDarkMode(!state.settings.darkMode); saveState(state); });
  document.getElementById('prev-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()-1); renderCalendar(); });
  document.getElementById('next-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()+1); renderCalendar(); });
  bindSearch();
}

function start() {
  applyDarkMode(state.settings.darkMode||false);
  bindUI();
  renderCatalog(); renderRoutines(); renderCalendar(); renderTodayPlan(); renderStats(); renderRecentWorkouts();
}
start();
