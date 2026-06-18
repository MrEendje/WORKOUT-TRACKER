/* ============================================================
   Workout Tracker — app.js (Firebase edition)
   ============================================================ */

import { initializeApp }                                    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         onAuthStateChanged, signOut,
         sendPasswordResetEmail }                           from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, addDoc,
         updateDoc, deleteDoc, collection, query,
         where, getDocs, onSnapshot, serverTimestamp,
         orderBy }                                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ── Firebase init ───────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyAZbcly46BkhWdJx_7Z4klDA8J4_fQtM2A',
  authDomain:        'gymcalendar-bddfd.firebaseapp.com',
  projectId:         'gymcalendar-bddfd',
  storageBucket:     'gymcalendar-bddfd.firebasestorage.app',
  messagingSenderId: '240213497038',
  appId:             '1:240213497038:web:2fdd71d7f61853ee6cec9f',
};
const firebaseApp  = initializeApp(firebaseConfig);
const auth         = getAuth(firebaseApp);
const db           = getFirestore(firebaseApp);

// Secondary app for creating client accounts without signing out
const secondaryApp  = initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

/* ── Constants ───────────────────────────────────────────── */
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
  { value:'reps',     label:'Herhalingen', icon:'🔁', col1:'Gewicht (kg)', col2:'Herh.',    ph1:'kg', ph2:'reps', mode1:'decimal', mode2:'numeric' },
  { value:'time',     label:'Tijd',        icon:'⏱️', col1:'Gewicht (kg)', col2:'Seconden', ph1:'kg', ph2:'sec',  mode1:'decimal', mode2:'numeric' },
  { value:'distance', label:'Afstand',     icon:'📏', col1:'Afstand (m)',  col2:'Seconden', ph1:'m',  ph2:'sec',  mode1:'decimal', mode2:'numeric' },
];

/* ── App state ───────────────────────────────────────────── */
let currentUser    = null;   // Firebase Auth user
let userProfile    = null;   // Firestore users/{uid}
let isTrainer      = false;

// Data (filled by Firestore listeners)
let exercises   = [];
let categories  = [];
let routines    = [];
let workouts    = [];        // current user's workouts
let schedules   = {};        // { [dateISO]: routineId }
let prs         = {};        // { [exId]: prObject }
let clients     = [];        // trainer only
let bodyStats   = [];        // current user's body measurements

// For client detail modal (trainer assigning schedule)
let selectedClientUid  = null;
let clientWorkouts     = [];
let clientSchedules    = {};

const unsubscribers = [];
let calendarDate    = new Date();

/* ── Utilities ───────────────────────────────────────────── */
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function uid(p = 'id') { return p + '-' + Math.random().toString(36).slice(2, 9); }
function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(iso) {
  const today = todayISO(), yesterday = todayISO(new Date(Date.now()-86400000));
  if (iso === today) return 'Vandaag';
  if (iso === yesterday) return 'Gisteren';
  return new Date(iso+'T00:00:00').toLocaleDateString('nl-NL', { weekday:'short', day:'numeric', month:'short' });
}
function getRoutineColor(r) { return ROUTINE_COLORS[(r?.colorIndex??0) % ROUTINE_COLORS.length]; }
function getTrackingType(ex) { return TRACKING_TYPES.find(t => t.value === (ex?.trackingType||'reps')) || TRACKING_TYPES[0]; }
function formatSeconds(sec) { if (!sec) return '0s'; const m = Math.floor(sec/60), s = sec%60; return m>0?`${m}m ${s}s`:`${s}s`; }
function formatSet(s, tt, num) {
  const p = `Set ${num}: `;
  if (tt.value==='distance') return p + `${s.distance??0}m` + (s.seconds ? ` · ${formatSeconds(s.seconds)}` : '');
  if (tt.value==='time')     return p + (s.weight ? `${s.weight}kg · ` : '') + formatSeconds(s.seconds??0);
  return p + `${s.weight??0} kg × ${s.reps??0} reps`;
}

const emojiMap = [
  {k:/bench|press|benchpress|chestpress/i,e:'🏋️'},{k:/pushup|opdrukken/i,e:'🤸'},
  {k:/dip/i,e:'💪'},{k:/fly|flys|pecdeck/i,e:'👐'},{k:/dead|deadlift/i,e:'🏋️'},
  {k:/pullup|chinup|chin-up|pull-up/i,e:'🧗'},{k:/row|rowing|latpulldown|pulldown/i,e:'🚣'},
  {k:/shrug|traps/i,e:'🤷'},{k:/squat|hacksquat|legpress/i,e:'🦵'},
  {k:/lunge|split|bulgarian/i,e:'🧎'},{k:/calf|calves/i,e:'🧍'},
  {k:/curl|bicep|hammer/i,e:'💪'},{k:/tricep|pushdown|skull/i,e:'💪'},
  {k:/lateral|raise|delt/i,e:'🪽'},{k:/abs|crunch|situp|plank|core/i,e:'🧱'},
  {k:/run|jog|sprint|treadmill/i,e:'🏃'},{k:/bike|cycling|cycle|spinning/i,e:'🚴'},
  {k:/swim|swimming/i,e:'🏊'},{k:/stair|stepper/i,e:'🪜'},
  {k:/box|boxing|punch|kick/i,e:'🥊'},{k:/yoga|stretch|mobility/i,e:'🧘'},
  {k:/glute|hip thrust|hipthrust|donkey|kickback|abductor|rdl|romanian/i,e:'🍑'},
];
function pickEmoji(name) { for (const m of emojiMap) if (m.k.test(name)) return m.e; return '🏋️'; }

/* ── Dark mode ───────────────────────────────────────────── */
function applyDarkMode(on) {
  document.documentElement.classList.toggle('dark', on);
  document.getElementById('btn-dark-mode').textContent = on ? '☀️' : '🌙';
}

/* ── Auth screens ────────────────────────────────────────── */
function showLoginScreen() {
  document.getElementById('app-loading').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}
function showApp() {
  document.getElementById('app-loading').classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('main-app').classList.add('flex', 'flex-col', 'min-h-screen');
}

// Fallback: if Firebase doesn't respond within 6s, show login
const loadingTimeout = setTimeout(() => {
  const loading = document.getElementById('app-loading');
  if (loading && !loading.classList.contains('hidden')) {
    console.warn('Firebase timeout — showing login screen');
    showLoginScreen();
  }
}, 6000);

/* ── Firestore helpers ───────────────────────────────────── */
// Global collections (trainer manages)
const colExercises  = () => collection(db, 'exercises');
const colCategories = () => collection(db, 'categories');
const colRoutines   = () => collection(db, 'routines');
const colUsers      = () => collection(db, 'users');

// User subcollections
const colWorkouts   = (uid) => collection(db, 'users', uid, 'workouts');
const colSchedules  = (uid) => collection(db, 'users', uid, 'schedules');
const colPRs        = (uid) => collection(db, 'users', uid, 'prs');
const colBodyStats  = (uid) => collection(db, 'users', uid, 'bodyStats');

async function saveExercise(ex) {
  if (ex.id && ex.id.startsWith('ex-')) {
    // Firestore id stored separately
    await setDoc(doc(db, 'exercises', ex._fid || ex.id), exToFS(ex));
  }
}
function exToFS(ex) {
  const o = { name: ex.name, emoji: ex.emoji, trackingType: ex.trackingType };
  if (ex.categoryId) o.categoryId = ex.categoryId;
  return o;
}

/* ── Load global data ────────────────────────────────────── */
function subscribeGlobal() {
  // exercises
  unsubscribers.push(onSnapshot(colExercises(), snap => {
    exercises = snap.docs.map(d => ({ _fid: d.id, id: d.id, ...d.data() }));
    renderCatalog(); renderRoutines();
  }));
  // categories
  unsubscribers.push(onSnapshot(colCategories(), snap => {
    categories = snap.docs.map(d => ({ _fid: d.id, id: d.id, ...d.data() }));
    renderCatalog();
  }));
  // routines
  unsubscribers.push(onSnapshot(colRoutines(), snap => {
    routines = snap.docs.map(d => ({ _fid: d.id, id: d.id, ...d.data() }));
    renderRoutines(); renderCalendar(); renderTodayPlan();
  }));
}

function subscribeUserData(uid) {
  unsubscribers.push(onSnapshot(colWorkouts(uid), snap => {
    workouts = snap.docs.map(d => ({ _fid: d.id, id: d.id, ...d.data() }));
    renderStats(); renderRecentWorkouts(); renderCalendar(); renderTodayPlan();
  }));
  unsubscribers.push(onSnapshot(colSchedules(uid), snap => {
    schedules = {};
    snap.docs.forEach(d => { schedules[d.id] = d.data().routineId; });
    renderCalendar(); renderTodayPlan();
  }));
  unsubscribers.push(onSnapshot(colPRs(uid), snap => {
    prs = {};
    snap.docs.forEach(d => { prs[d.id] = d.data(); });
    if (currentView === 'view-prs') renderPRs();
  }));
  unsubscribers.push(onSnapshot(query(colBodyStats(uid), orderBy('date', 'asc')), snap => {
    bodyStats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentView === 'view-progression') renderProgression();
  }));
}

async function loadClients() {
  const q = query(colUsers(), where('role', '==', 'client'));
  const snap = await getDocs(q);
  clients = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  renderClients();
}

function unsubscribeAll() { unsubscribers.forEach(u => u()); unsubscribers.length = 0; }

/* ── onAuthStateChanged ──────────────────────────────────── */
onAuthStateChanged(auth, async user => {
  clearTimeout(loadingTimeout);
  if (!user) { unsubscribeAll(); showLoginScreen(); return; }

  try {
    currentUser = user;
    const profileDoc = await getDoc(doc(db, 'users', user.uid));
    if (!profileDoc.exists()) {
      userProfile = { name: user.email.split('@')[0], email: user.email, role: 'trainer' };
      await setDoc(doc(db, 'users', user.uid), { ...userProfile, createdAt: serverTimestamp() });
    } else {
      userProfile = profileDoc.data();
    }

    isTrainer = userProfile.role === 'trainer';
    applyDarkMode(userProfile.darkMode || false);
    document.getElementById('header-username').textContent = `${userProfile.name} · ${isTrainer ? 'Trainer' : 'Klant'}`;
    setupNavForRole();
    showApp();
    bindUI();
    subscribeGlobal();
    subscribeUserData(user.uid);
    if (isTrainer) loadClients();
    showView('view-dashboard');
  } catch (err) {
    console.error('App init error:', err);
    showLoginScreen();
    setTimeout(() => {
      const errEl = document.getElementById('login-error');
      if (errEl) { errEl.textContent = 'Verbindingsfout: ' + err.message; errEl.classList.remove('hidden'); }
    }, 100);
  }
});

/* ── Navigation ──────────────────────────────────────────── */
let currentView = 'view-dashboard';
let isWorkoutActive = false;

function setupNavForRole() {
  const nav = document.getElementById('nav-bar');
  // Show catalog edit controls for trainer
  if (isTrainer) {
    document.getElementById('catalog-trainer-controls').classList.remove('hidden');
    document.getElementById('btn-new-routine').classList.remove('hidden');
    // Add clients tab
    nav.className = 'max-w-2xl mx-auto grid grid-cols-4';
    const clientBtn = el('button', 'nav-item flex flex-col items-center justify-center pt-3 pb-5 gap-1');
    clientBtn.dataset.view = 'view-clients';
    clientBtn.innerHTML = `
      <svg class="nav-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="9" cy="7" r="3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-1a6 6 0 0112 0v1"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 3.13a4 4 0 010 7.75"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21v-1a4 4 0 00-3-3.85"/>
      </svg>
      <span class="nav-label text-xs font-semibold">Klanten</span>
      <div class="nav-dot"></div>`;
    nav.appendChild(clientBtn);
    clientBtn.addEventListener('click', () => showView('view-clients'));
  } else {
    document.getElementById('catalog-client-header').classList.remove('hidden');
    // Add progression tab for clients
    nav.className = 'max-w-2xl mx-auto grid grid-cols-4';
    const progBtn = el('button', 'nav-item flex flex-col items-center justify-center pt-3 pb-5 gap-1');
    progBtn.dataset.view = 'view-progression';
    progBtn.innerHTML = `
      <svg class="nav-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z"/>
      </svg>
      <span class="nav-label text-xs font-semibold">Progressie</span>
      <div class="nav-dot"></div>`;
    nav.appendChild(progBtn);
    progBtn.addEventListener('click', () => showView('view-progression'));
  }
}

function showView(id) {
  if (currentView === 'view-workout' && id !== 'view-workout') {
    if (workoutTimerInterval) { clearInterval(workoutTimerInterval); workoutTimerInterval = null; }
    isWorkoutActive = false;
  }
  document.querySelectorAll('#views > section').forEach(s => s.classList.add('hidden'));
  const section = document.getElementById(id);
  if (section) section.classList.remove('hidden');
  currentView = id;
  document.querySelectorAll('.nav-item').forEach(btn => {
    const active = btn.dataset.view === id;
    btn.classList.toggle('active', active);
    btn.querySelector('.nav-icon')?.style.setProperty('color', active ? '#0ea5e9' : '');
    btn.querySelector('.nav-label')?.style.setProperty('color', active ? '#0ea5e9' : '');
  });
  if (id === 'view-prs')         renderPRs();
  if (id === 'view-catalog')     { renderCatalog(); renderRoutines(); }
  if (id === 'view-clients')     loadClients();
  if (id === 'view-progression') renderProgression();
}

/* ── Today's Plan ────────────────────────────────────────── */
function renderTodayPlan() {
  const wrap = document.getElementById('today-plan'); if (!wrap) return;
  wrap.innerHTML = '';
  const today      = todayISO();
  const routineId  = schedules[today];
  const routine    = routineId ? routines.find(r => r.id === routineId) : null;
  const hasWorkout = workouts.some(w => w.date === today);
  const card       = el('div', 'rounded-2xl overflow-hidden shadow-sm slide-up');

  if (routine && !hasWorkout) {
    const c = getRoutineColor(routine);
    card.style.cssText = `background:${c.light};border:1.5px solid ${c.bg}22`;
    const inner = el('div', 'p-4 space-y-3');
    const top = el('div', 'flex items-center gap-3');
    const dot = el('div', 'w-3 h-3 rounded-full shrink-0'); dot.style.backgroundColor = c.bg;
    const badge = el('span', 'text-xs font-bold px-2 py-0.5 rounded-full text-white'); badge.style.backgroundColor = c.bg; badge.textContent = 'Vandaag';
    const title = el('div', 'font-bold text-lg flex-1'); title.textContent = routine.name;
    top.append(dot, title, badge); inner.appendChild(top);
    const exList = el('div', 'space-y-1.5');
    (routine.exercises||[]).forEach(eid => {
      const ex = exercises.find(x => x.id === eid); if (!ex) return;
      const row = el('div', 'flex items-center gap-2 text-sm text-slate-600');
      row.innerHTML = `<span class="w-6 text-center">${ex.emoji}</span><span>${ex.name}</span>`;
      exList.appendChild(row);
    });
    inner.appendChild(exList);
    const startBtn = el('button', 'w-full py-3.5 rounded-xl text-white font-bold text-base touch-btn start-pulse');
    startBtn.style.backgroundColor = c.bg;
    startBtn.textContent = '▶  Start Workout';
    startBtn.addEventListener('click', () => openWorkoutView(routine));
    inner.appendChild(startBtn);
    card.appendChild(inner);
  } else if (routine && hasWorkout) {
    const c = getRoutineColor(routine);
    card.style.backgroundColor = c.light;
    const inner = el('div', 'p-4 flex items-center gap-3');
    const icon = el('div', 'w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0'); icon.style.backgroundColor = c.bg + '22'; icon.textContent = '✓';
    const txt = el('div', 'flex-1');
    txt.innerHTML = `<div class="font-semibold text-sm">${routine.name}</div><div class="text-sm font-medium" style="color:${c.bg}">Klaar voor vandaag!</div>`;
    inner.append(icon, txt); card.appendChild(inner);
  } else {
    card.className = 'rounded-2xl overflow-hidden shadow-sm slide-up bg-white border border-slate-100';
    const inner = el('div', 'p-4 space-y-3');
    const top = el('div', 'flex items-center gap-2');
    const calIcon = el('span', 'text-2xl'); calIcon.textContent = '📅';
    const lbl = el('div');
    lbl.innerHTML = `<div class="font-semibold text-sm text-slate-700">Niets gepland</div><div class="text-xs text-slate-400">${new Date().toLocaleDateString('nl-NL', {weekday:'long',day:'numeric',month:'long'})}</div>`;
    top.append(calIcon, lbl); inner.appendChild(top);
    if (routines.length) {
      const planBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn text-sm');
      planBtn.textContent = '📋  Plan vandaag';
      planBtn.addEventListener('click', () => showScheduleModal(today, null, currentUser.uid));
      inner.appendChild(planBtn);
    } else {
      const hint = el('p', 'text-sm text-slate-400 text-center py-2'); hint.textContent = isTrainer ? 'Maak eerst een routine aan in Catalogus.' : 'Je trainer heeft nog geen routine gepland.';
      inner.appendChild(hint);
    }
    card.appendChild(inner);
  }
  wrap.appendChild(card);
}

/* ── Stats ───────────────────────────────────────────────── */
function renderStats() {
  const row = document.getElementById('stats-row'); if (!row) return; row.innerHTML = '';
  const total  = workouts.length;
  const streak = calcStreak();
  const vol    = weeklyVolume();
  const volStr = vol >= 1000 ? `${(vol/1000).toFixed(1)}t` : `${Math.round(vol)}kg`;
  [
    { val: total,             lbl: 'Workouts',  accent: '#0ea5e9' },
    { val: volStr,            lbl: 'Vol/week',  accent: '#22c55e' },
    { val: `${streak}🔥`,    lbl: 'Streak',    accent: '#f97316' },
  ].forEach(c => {
    const d = el('div', 'bg-white rounded-2xl shadow-sm text-center overflow-hidden');
    const bar = el('div', 'stat-accent'); bar.style.backgroundColor = c.accent;
    const body = el('div', 'px-2 py-3');
    body.innerHTML = `<div class="text-xl font-bold text-slate-800 tabular-nums">${c.val}</div><div class="text-xs text-slate-400 mt-0.5 font-medium">${c.lbl}</div>`;
    d.append(bar, body); row.appendChild(d);
  });
}

function calcStreak() {
  const dates = [...new Set(workouts.map(w=>w.date))].sort().reverse();
  if (!dates.length) return 0;
  let streak = 0, cur = new Date();
  for (const d of dates) {
    const diff = Math.round((cur - new Date(d+'T00:00:00')) / 86400000);
    if (diff <= 1) { streak++; cur = new Date(d+'T00:00:00'); } else break;
  }
  return streak;
}

function weeklyVolume() {
  const now = new Date(), diff = (now.getDay()+6)%7;
  const monISO = todayISO(new Date(now.getTime() - diff*86400000));
  return workouts.filter(w => w.date >= monISO)
    .flatMap(w => w.exercises.flatMap(ex => ex.sets.map(s => (s.weight||0)*(s.reps||1))))
    .reduce((a,b) => a+b, 0);
}

/* ── Calendar ────────────────────────────────────────────── */
function renderCalendar() {
  const grid = document.getElementById('calendar-grid'); if (!grid) return; grid.innerHTML = '';
  const start = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const end   = new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1, 0);
  const todayStr = todayISO();
  document.getElementById('month-label').textContent = start.toLocaleString('nl-NL', {month:'long', year:'numeric'});
  renderCalendarLegend(start, end);
  const firstDay = (start.getDay()+6)%7;
  for (let i=0; i<firstDay; i++) grid.appendChild(el('div',''));
  for (let d=1; d<=end.getDate(); d++) {
    const date  = new Date(start.getFullYear(), start.getMonth(), d);
    const iso   = todayISO(date);
    const isToday  = iso === todayStr;
    const workout  = workouts.find(w => w.date === iso);
    const routineId = schedules[iso];
    const routine  = routineId ? routines.find(r => r.id === routineId) : null;
    const color    = routine ? getRoutineColor(routine) : null;
    const cell = el('button', `calendar-day rounded-xl p-1.5 text-left flex flex-col relative overflow-hidden active:scale-95 transition-transform ${isToday ? 'ring-2 ring-sky-400 ring-offset-1' : ''}`);
    cell.setAttribute('type','button');
    if (workout)      cell.style.backgroundColor = color ? color.bg : '#38bdf8';
    else if (routine) cell.style.backgroundColor = color.light;
    else              cell.style.backgroundColor = '#f8fafc';
    const dayNum = el('div', `text-xs font-bold leading-none ${isToday ? 'text-sky-500' : workout ? 'text-white' : routine ? 'text-slate-600' : 'text-slate-400'}`);
    dayNum.textContent = d; cell.appendChild(dayNum);
    if (workout) { const dot = el('div','w-1.5 h-1.5 rounded-full mx-auto mt-auto'); dot.style.backgroundColor='rgba(255,255,255,.8)'; cell.appendChild(dot); }
    else if (routine) { const dot = el('div','w-1.5 h-1.5 rounded-full mx-auto mt-auto'); dot.style.backgroundColor=color.bg; cell.appendChild(dot); }
    cell.addEventListener('click', () => onDayClick(iso));
    grid.appendChild(cell);
  }
}

function renderCalendarLegend(start, end) {
  const legend = document.getElementById('calendar-legend'); if (!legend) return; legend.innerHTML = '';
  const seen = new Set();
  for (let d=1; d<=end.getDate(); d++) {
    const iso = todayISO(new Date(start.getFullYear(), start.getMonth(), d));
    const rId = schedules[iso];
    if (rId && !seen.has(rId)) {
      seen.add(rId);
      const r = routines.find(x => x.id === rId); if (!r) continue;
      const c = getRoutineColor(r);
      const item = el('div','flex items-center gap-1.5 text-xs text-slate-500 font-medium');
      const dot = el('span','inline-block w-2 h-2 rounded-full shrink-0'); dot.style.backgroundColor = c.bg;
      const lbl = el('span'); lbl.textContent = r.name; item.append(dot, lbl); legend.appendChild(item);
    }
  }
}

function onDayClick(iso) {
  const workout = workouts.find(w => w.date === iso);
  if (iso <= todayISO() && workout) { showWorkoutSummaryModal(workout); return; }
  showScheduleModal(iso, schedules[iso], currentUser.uid);
}

/* ── Schedule modal ──────────────────────────────────────── */
function showScheduleModal(iso, scheduled, targetUid) {
  const content = el('div','space-y-3');
  const lbl = el('p','text-sm text-slate-500'); lbl.textContent = `Routine voor ${iso}`; content.appendChild(lbl);
  if (!routines.length) {
    const msg = el('p','text-sm text-slate-400 py-4 text-center'); msg.textContent = 'Nog geen routines.'; content.appendChild(msg);
  } else {
    const grid = el('div','grid gap-2');
    routines.forEach(r => {
      const c = getRoutineColor(r);
      const btn = el('button', `p-3 rounded-xl border-2 flex items-center gap-3 w-full text-left touch-btn ${scheduled===r.id?'border-slate-800':'border-transparent'}`);
      btn.style.backgroundColor = c.light;
      const dot = el('span','w-3.5 h-3.5 rounded-full shrink-0'); dot.style.backgroundColor = c.bg;
      const nm = el('span','font-semibold text-sm'); nm.textContent = r.name;
      btn.append(dot, nm);
      if (scheduled === r.id) { const chk = el('span','ml-auto font-bold text-slate-800 text-sm'); chk.textContent = '✓'; btn.appendChild(chk); }
      btn.addEventListener('click', async () => {
        await setDoc(doc(db, 'users', targetUid, 'schedules', iso), { routineId: r.id });
        closeModal();
        if (targetUid === currentUser.uid) { renderCalendar(); renderTodayPlan(); }
      });
      grid.appendChild(btn);
    }); content.appendChild(grid);
  }
  if (scheduled) {
    const clr = el('button','mt-2 w-full py-2.5 rounded-xl bg-red-50 text-red-500 text-sm font-semibold touch-btn');
    clr.textContent = 'Routine verwijderen';
    clr.addEventListener('click', async () => {
      await deleteDoc(doc(db, 'users', targetUid, 'schedules', iso));
      closeModal();
      if (targetUid === currentUser.uid) { renderCalendar(); renderTodayPlan(); }
    });
    content.appendChild(clr);
  }
  showModal(content, `${formatDate(iso)} plannen`);
}

/* ── Modals ──────────────────────────────────────────────── */
function showModal(content, title) {
  const root = document.getElementById('modal-root'); root.innerHTML = '';
  const overlay = el('div','fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-30');
  const panel   = el('div','bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl');
  const handle  = el('div','flex justify-center pt-3 pb-1 sm:hidden shrink-0');
  handle.appendChild(el('div','w-10 h-1 bg-slate-200 rounded-full')); panel.appendChild(handle);
  if (title) {
    const hdr = el('div','px-4 pb-3 pt-1 border-b border-slate-100 flex items-center justify-between shrink-0');
    const h = el('h3','text-base font-bold text-slate-800'); h.textContent = title;
    const x = el('button','w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 font-bold text-lg touch-btn');
    x.textContent = '×'; x.addEventListener('click', closeModal); hdr.append(h, x); panel.appendChild(hdr);
  }
  const body = el('div','flex-1 overflow-y-auto modal-scroll p-4');
  body.appendChild(content); panel.appendChild(body);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target===overlay) closeModal(); });
  root.appendChild(overlay);
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ── Workout ─────────────────────────────────────────────── */
let workoutTimerInterval = null;
let workoutStartTime     = null;

function openWorkoutView(routine) {
  const section = document.getElementById('view-workout'); section.innerHTML = '';
  const today   = todayISO();
  workoutStartTime = Date.now(); isWorkoutActive = true;
  const validIds = (routine.exercises||[]).filter(id => exercises.some(e => e.id === id));
  if (!validIds.length) { alert('Geen geldige oefeningen in deze routine.'); return; }
  const c = getRoutineColor(routine);

  function updateTimer() { const s = Math.floor((Date.now()-workoutStartTime)/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

  const header = el('div','flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm');
  const cancelBtn = el('button','text-sm text-slate-500 font-medium touch-btn px-2');
  cancelBtn.textContent = '← Annuleer';
  cancelBtn.addEventListener('click', () => { if (confirm('Workout annuleren?')) { clearInterval(workoutTimerInterval); workoutTimerInterval=null; showView('view-dashboard'); }});
  const mid = el('div','flex flex-col items-center');
  const titleEl = el('div','font-bold text-sm text-slate-800'); titleEl.textContent = routine.name;
  const timerEl = el('div','text-xs font-mono tabular-nums text-slate-400 mt-0.5'); timerEl.textContent='0:00';
  mid.append(titleEl, timerEl);
  const saveQuick = el('button','text-sm font-bold touch-btn px-2 text-sky-500'); saveQuick.textContent='Opslaan';
  header.append(cancelBtn, mid, saveQuick);
  if (workoutTimerInterval) clearInterval(workoutTimerInterval);
  workoutTimerInterval = setInterval(()=>{ timerEl.textContent=updateTimer(); }, 1000);

  const progressWrap = el('div','space-y-1.5');
  const progressText = el('div','text-xs text-slate-400 font-medium');
  const progressBar  = el('div','w-full h-2 bg-slate-200 rounded-full overflow-hidden');
  const progressFill = el('div','h-full rounded-full transition-all duration-500'); progressFill.style.backgroundColor=c.bg;
  progressBar.appendChild(progressFill); progressWrap.append(progressText, progressBar);

  const exContainer    = el('div','space-y-3');
  const completedStatus = validIds.map(()=>false);

  function updateProgress() {
    const done=completedStatus.filter(Boolean).length, total=validIds.length;
    progressText.textContent=`${done} van ${total} oefeningen klaar`;
    progressFill.style.width=`${total>0?(done/total)*100:0}%`;
  }
  updateProgress();

  function buildExBlock(exId, index) {
    const ex = exercises.find(e=>e.id===exId)||{id:exId,name:'Oefening',emoji:'🏋️',trackingType:'reps'};
    const tt = getTrackingType(ex);
    const prevW  = workouts.filter(w=>w.exercises.some(e=>e.exerciseId===exId)).slice(-1)[0];
    const prevSets = prevW ? prevW.exercises.find(e=>e.exerciseId===exId)?.sets||[] : [];
    const block = el('div','bg-white rounded-2xl p-4 shadow-sm space-y-3'); block.dataset.exId=ex.id;
    block.innerHTML=`<div class="flex items-center gap-3"><div class="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0" style="background:${c.bg}18">${ex.emoji}</div><div class="flex-1 min-w-0"><div class="font-bold text-sm text-slate-800 truncate">${ex.name}</div><div class="text-xs text-slate-400 mt-0.5">${tt.icon} ${tt.label}</div></div></div>`;
    if (prevSets.length) {
      const hint=el('div','text-xs bg-sky-50 text-sky-600 rounded-xl px-3 py-2 font-medium');
      hint.textContent='Vorige: '+prevSets.slice(0,3).map((s,i)=>formatSet(s,tt,i+1).replace(`Set ${i+1}: `,'')).join(' · ');
      block.appendChild(hint);
    }
    const colHdr=el('div','flex gap-2 text-xs text-slate-400 font-medium px-0.5');
    colHdr.innerHTML=`<span class="flex-1 text-center">${tt.col1}</span><span class="flex-1 text-center">${tt.col2}</span><span class="w-10"></span>`;
    block.appendChild(colHdr);
    const setsDiv=el('div','space-y-2'); block.appendChild(setsDiv);

    function createSetRow(prev=null) {
      const row=el('div','flex gap-2 items-center'); row.dataset.setRow='1';
      const c1=el('input','flex-1 min-w-0 p-2.5 border border-slate-200 rounded-xl text-center bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-400 no-spinner');
      c1.type='number'; c1.placeholder=tt.ph1; c1.inputMode=tt.mode1; c1.autocomplete='off';
      if(prev&&(prev.weight||prev.distance)) c1.value=prev.weight||prev.distance;
      const c2=el('input','flex-1 min-w-0 p-2.5 border border-slate-200 rounded-xl text-center bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-400 no-spinner');
      c2.type='number'; c2.placeholder=tt.ph2; c2.inputMode=tt.mode2; c2.autocomplete='off';
      if(prev&&(prev.reps||prev.seconds)) c2.value=prev.reps||prev.seconds;
      const doneBtn=el('button','w-10 h-10 flex items-center justify-center rounded-xl shrink-0 touch-btn transition-all text-sm font-bold');
      doneBtn.setAttribute('type','button'); doneBtn.textContent='○'; doneBtn.style.cssText='color:#94a3b8;background:#f1f5f9';
      doneBtn.addEventListener('click',()=>{
        const done=doneBtn.textContent==='✓'; doneBtn.textContent=done?'○':'✓';
        doneBtn.style.cssText=done?'color:#94a3b8;background:#f1f5f9':`color:#fff;background:${c.bg}`;
        checkDone(block,index);
      });
      row.append(c1,c2,doneBtn); return row;
    }
    function checkDone(block,idx){
      let any=false;
      block.querySelectorAll('[data-set-row]').forEach(r=>{
        const ins=r.querySelectorAll('input');
        if(ins.length>=2&&(!isNaN(parseFloat(ins[0].value))||!isNaN(parseFloat(ins[1].value)))) any=true;
        if(r.querySelector('button')?.textContent==='✓') any=true;
      });
      completedStatus[idx]=any; updateProgress();
    }
    if(prevSets.length) prevSets.forEach(s=>setsDiv.appendChild(createSetRow(s)));
    else setsDiv.appendChild(createSetRow());
    const addBtn=el('button','w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 font-medium touch-btn mt-1');
    addBtn.setAttribute('type','button'); addBtn.textContent='+ Set toevoegen';
    addBtn.addEventListener('click',()=>setsDiv.appendChild(createSetRow()));
    block.appendChild(addBtn); return block;
  }
  validIds.forEach((id,i)=>exContainer.appendChild(buildExBlock(id,i)));

  const notesInput=el('textarea','w-full p-3 border border-slate-200 rounded-xl text-sm resize-none outline-none bg-white focus:ring-2 focus:ring-sky-400');
  notesInput.rows=2; notesInput.placeholder='Notities (optioneel)…';

  let isSaving = false;
  async function saveWorkout() {
    if (isSaving) return;
    isSaving = true;
    saveBtn.disabled = true; saveBtn.textContent = 'Opslaan…';
    saveQuick.disabled = true; saveQuick.textContent = 'Bezig…';
    const blocks=Array.from(exContainer.querySelectorAll('[data-ex-id]'));
    const durationMin=Math.round((Date.now()-workoutStartTime)/60000);
    const workout={date:today,exercises:[],durationMin,createdAt:serverTimestamp()};
    if(notesInput.value.trim()) workout.notes=notesInput.value.trim();
    for(const b of blocks){
      const ex=exercises.find(e=>e.id===b.dataset.exId)||{id:b.dataset.exId,trackingType:'reps'};
      const tt=getTrackingType(ex); const sets=[];
      for(const row of b.querySelectorAll('[data-set-row]')){
        const ins=row.querySelectorAll('input'); if(ins.length<2) continue;
        const v1=parseFloat(ins[0].value),v2=parseFloat(ins[1].value);
        if(isNaN(v1)&&isNaN(v2)) continue;
        const a=isNaN(v1)?0:v1,b2=isNaN(v2)?0:v2;
        if(tt.value==='distance') sets.push({distance:a,seconds:b2,trackingType:tt.value});
        else if(tt.value==='time') sets.push({weight:a,seconds:b2,trackingType:tt.value});
        else sets.push({weight:a,reps:b2,trackingType:tt.value});
      }
      if(sets.length) workout.exercises.push({exerciseId:ex.id,sets});
    }
    if(!workout.exercises.length){
      alert('Log minimaal één set');
      isSaving=false; saveBtn.disabled=false; saveBtn.textContent='💾  Workout opslaan';
      saveQuick.disabled=false; saveQuick.textContent='Opslaan';
      return;
    }
    await addDoc(colWorkouts(currentUser.uid), workout);
    await checkAndUpdatePRs(workout);
    clearInterval(workoutTimerInterval); workoutTimerInterval=null;
    showView('view-dashboard');
  }
  saveQuick.addEventListener('click', saveWorkout);
  const saveBtn=el('button','w-full py-4 rounded-2xl text-white font-bold text-base touch-btn shadow-sm');
  saveBtn.style.backgroundColor=c.bg; saveBtn.textContent='💾  Workout opslaan';
  saveBtn.addEventListener('click', saveWorkout);
  section.append(header,progressWrap,exContainer,notesInput,saveBtn);
  showView('view-workout');
}

async function checkAndUpdatePRs(workout) {
  for(const ex of workout.exercises) {
    for(const s of ex.sets) {
      const exercise=exercises.find(e=>e.id===ex.exerciseId)||{trackingType:'reps'};
      const tt=getTrackingType(exercise);
      const val=tt.value==='distance'?(s.distance||0):tt.value==='time'?(s.seconds||0):(s.weight||0);
      const prev=prs[ex.exerciseId];
      const prevVal=prev?(tt.value==='distance'?(prev.distance||0):tt.value==='time'?(prev.seconds||0):(prev.weight||0)):0;
      if(val>prevVal){
        await setDoc(doc(db,'users',currentUser.uid,'prs',ex.exerciseId), {weight:s.weight,reps:s.reps,seconds:s.seconds,distance:s.distance,date:workout.date});
      }
    }
  }
}

/* ── Workout summary ─────────────────────────────────────── */
function showWorkoutSummaryModal(workout, ownerUid = null) {
  const uid = ownerUid || currentUser.uid;
  const content=el('div','space-y-3');
  const meta=el('div','flex gap-2 flex-wrap');
  if(workout.durationMin){const d=el('div','flex items-center gap-1.5 text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2 font-medium');d.innerHTML=`⏱️ <span>${workout.durationMin} min</span>`;meta.appendChild(d);}
  const ec=el('div','flex items-center gap-1.5 text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2 font-medium');ec.innerHTML=`🏋️ <span>${workout.exercises.length} oefeningen</span>`;meta.appendChild(ec);
  content.appendChild(meta);
  if(workout.notes){const n=el('div','text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2.5 italic');n.textContent=`"${workout.notes}"`;content.appendChild(n);}
  workout.exercises.forEach(ex=>{
    const exercise=exercises.find(e=>e.id===ex.exerciseId)||{name:'Onbekend',emoji:'🏋️',trackingType:'reps'};
    const tt=getTrackingType(exercise);
    const wrap=el('div','border-b border-slate-100 pb-3');
    const ttl=el('div','flex items-center gap-2 mb-2');
    ttl.innerHTML=`<div class="w-9 h-9 rounded-xl flex items-center justify-center text-xl bg-slate-50">${exercise.emoji}</div><div class="font-semibold text-sm">${exercise.name}</div>`;
    wrap.appendChild(ttl);
    ex.sets.forEach((s,i)=>{const row=el('div','text-sm text-slate-500 ml-11 py-0.5');row.textContent=formatSet(s,tt,i+1);wrap.appendChild(row);});
    content.appendChild(wrap);
  });
  const delBtn=el('button','mt-2 w-full py-3 bg-red-50 text-red-500 rounded-xl font-semibold touch-btn');
  delBtn.textContent='🗑  Workout verwijderen';
  delBtn.addEventListener('click', async () => {
    if(!confirm(`Workout van ${formatDate(workout.date)} verwijderen?`))return;
    await deleteDoc(doc(db,'users',uid,'workouts',workout._fid||workout.id));
    closeModal();
  });
  content.appendChild(delBtn);
  const closeBtn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn');
  closeBtn.textContent='Sluiten';closeBtn.addEventListener('click',closeModal);
  content.appendChild(closeBtn);
  showModal(content,`Workout — ${formatDate(workout.date)}`);
}

/* ── Recent workouts ─────────────────────────────────────── */
function renderRecentWorkouts() {
  const wrap=document.getElementById('recent-workouts');if(!wrap)return;wrap.innerHTML='';
  if(!workouts.length)return;
  const h=el('h3','text-sm font-bold text-slate-500 mb-2 px-1');h.textContent='Recente workouts';wrap.appendChild(h);
  [...workouts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).forEach(w=>{
    const card=el('button','w-full bg-white p-3.5 rounded-2xl shadow-sm mb-2 flex items-center gap-3 text-left touch-btn active:scale-[.98] transition-transform');
    const fw=exercises.find(x=>x.id===w.exercises[0]?.exerciseId);
    const iw=el('div','w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg shrink-0');iw.textContent=fw?fw.emoji:'🏋️';
    const left=el('div','flex-1 min-w-0');
    const de=el('div','text-sm font-semibold text-slate-800');de.textContent=formatDate(w.date);
    const ic=el('div','text-xs text-slate-400 mt-0.5 truncate');
    ic.textContent=w.exercises.map(ex=>{const e=exercises.find(x=>x.id===ex.exerciseId);return e?`${e.emoji} ${e.name}`:''}).filter(Boolean).join(' · ');
    left.append(de,ic);
    const right=el('div','text-right shrink-0');
    const cnt=el('div','text-xs font-semibold text-slate-600');cnt.textContent=`${w.exercises.length} oef.`;
    const dur=el('div','text-xs text-slate-400 mt-0.5');if(w.durationMin)dur.textContent=`${w.durationMin} min`;
    right.append(cnt,dur);
    card.append(iw,left,right);card.addEventListener('click',()=>showWorkoutSummaryModal(w));
    wrap.appendChild(card);
  });
}

/* ── Catalog ─────────────────────────────────────────────── */
const collapsedCategories=new Set();
function renderCatalog(filter='') {
  const list=document.getElementById('catalog-list');if(!list)return;list.innerHTML='';
  const all=filter?exercises.filter(ex=>ex.name.toLowerCase().includes(filter.toLowerCase())):exercises;
  const uncategorized=all.filter(ex=>!ex.categoryId);
  categories.forEach(cat=>{
    const catExs=all.filter(ex=>ex.categoryId===cat.id);
    if(filter&&catExs.length===0)return;
    const section=el('div','rounded-xl overflow-hidden border border-slate-200');
    const catHdr=el('button','w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 text-left');
    const lh=el('div','flex items-center gap-2');
    const arrow=el('span','text-slate-400 text-xs transition-transform duration-200');arrow.textContent='▼';
    const cn=el('span','font-bold text-sm text-slate-700');cn.textContent=cat.name;
    const cnt=el('span','text-xs text-slate-400 font-medium');cnt.textContent=catExs.length;
    lh.append(arrow,cn,cnt);
    const cb=el('div','flex items-center gap-1');
    if(isTrainer){
      const ec=el('button','p-1.5 rounded-lg text-slate-400');
      ec.innerHTML=`<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
      ec.addEventListener('click',e=>{e.stopPropagation();showEditCategoryModal(cat);});
      const dc=el('button','p-1.5 rounded-lg text-red-300');
      dc.innerHTML=`<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
      dc.addEventListener('click',async e=>{e.stopPropagation();if(!confirm(`Categorie "${cat.name}" verwijderen?`))return;
        const batch=exercises.filter(ex=>ex.categoryId===cat.id);
        for(const ex of batch){await updateDoc(doc(db,'exercises',ex._fid),{categoryId:null});}
        await deleteDoc(doc(db,'categories',cat._fid));
      });
      cb.append(ec,dc);
    }
    catHdr.append(lh,cb);
    let collapsed=collapsedCategories.has(cat.id);
    const body=el('div','divide-y divide-slate-100');
    if(collapsed){body.style.display='none';arrow.style.transform='rotate(-90deg)';}
    catHdr.addEventListener('click',()=>{collapsed=!collapsed;if(collapsed)collapsedCategories.add(cat.id);else collapsedCategories.delete(cat.id);body.style.display=collapsed?'none':'';arrow.style.transform=collapsed?'rotate(-90deg)':'';});
    section.append(catHdr,body);
    catExs.forEach(ex=>body.appendChild(buildExRow(ex)));
    if(!catExs.length&&!filter){const e=el('div','px-4 py-3 text-xs text-slate-400 italic');e.textContent='Geen oefeningen.';body.appendChild(e);}
    list.appendChild(section);
  });
  if(uncategorized.length>0||(!filter&&categories.length===0)){
    const section=el('div','space-y-1.5');
    if(categories.length>0){const lbl=el('p','text-xs font-bold text-slate-400 px-1 mt-2 uppercase tracking-wide');lbl.textContent='Zonder categorie';section.appendChild(lbl);}
    uncategorized.forEach(ex=>section.appendChild(buildExRow(ex)));
    if(!uncategorized.length&&!filter){const e=el('div','text-center text-slate-400 py-8 text-sm');e.innerHTML=`<div class="text-3xl mb-2">🏋️</div><div>${isTrainer?'Nog geen oefeningen. Voeg er een toe.':'Geen oefeningen gevonden.'}</div>`;section.appendChild(e);}
    list.appendChild(section);
  }
  if(filter&&all.length===0){const e=el('div','text-center text-slate-400 py-8 text-sm');e.innerHTML=`<div class="text-3xl mb-2">🔍</div><div>Geen oefeningen voor "<strong>${filter}</strong>"</div>`;list.appendChild(e);}
}

function buildExRow(ex) {
  const tt=getTrackingType(ex);
  const row=el('div','bg-white p-3 flex items-center justify-between gap-2');
  const left=el('div','flex items-center gap-3 min-w-0');
  left.innerHTML=`<div class="text-2xl w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl shrink-0">${ex.emoji}</div><div class="min-w-0"><div class="font-semibold text-sm truncate">${ex.name}</div><div class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">${tt.icon} <span>${tt.label}</span></div></div>`;
  row.appendChild(left);
  if(isTrainer){
    const btns=el('div','flex gap-1.5 shrink-0');
    const eb=el('button','p-2 rounded-xl bg-sky-50 text-sky-500 touch-btn');
    eb.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
    eb.addEventListener('click',()=>showExerciseModal(ex));
    const db2=el('button','p-2 rounded-xl bg-red-50 text-red-400 touch-btn');
    db2.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    db2.addEventListener('click',async()=>{if(!confirm(`"${ex.name}" verwijderen?`))return;await deleteDoc(doc(db,'exercises',ex._fid));});
    btns.append(eb,db2);row.appendChild(btns);
  }
  return row;
}

/* ── Category modals ─────────────────────────────────────── */
function showEditCategoryModal(cat) {
  const content=el('div','space-y-3');
  const input=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-medium');input.value=cat.name;content.appendChild(input);
  const btn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn');btn.textContent='Opslaan';
  btn.addEventListener('click',async()=>{const name=input.value.trim();if(!name)return;await updateDoc(doc(db,'categories',cat._fid),{name});closeModal();});
  content.appendChild(btn);showModal(content,'Categorie hernoemen');setTimeout(()=>input.focus(),100);
}
function showNewCategoryModal() {
  const content=el('div','space-y-3');
  const input=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');input.placeholder='bv. Borst, Benen, Cardio…';content.appendChild(input);
  const btn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn');btn.textContent='Aanmaken';
  btn.addEventListener('click',async()=>{const name=input.value.trim();if(!name){input.focus();return;}await addDoc(colCategories(),{name});closeModal();});
  content.appendChild(btn);showModal(content,'Nieuwe categorie');setTimeout(()=>input.focus(),100);
}

/* ── Exercise modal ──────────────────────────────────────── */
function showExerciseModal(existing=null) {
  const isEdit=!!existing;
  const content=el('div','space-y-3');
  const nameInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-medium');
  nameInput.placeholder='bv. Bankdrukken';if(isEdit)nameInput.value=existing.name;content.appendChild(nameInput);
  const preview=el('div','text-3xl text-center py-3 bg-slate-50 rounded-xl');
  preview.textContent=(isEdit?existing.emoji:'🏋️')+(isEdit?'  '+existing.name:'');
  nameInput.addEventListener('input',()=>{preview.textContent=pickEmoji(nameInput.value)+'  '+(nameInput.value||'');});content.appendChild(preview);
  const catLabel=el('p','text-sm font-semibold text-slate-600');catLabel.textContent='Categorie';content.appendChild(catLabel);
  const catSel=el('select','w-full p-3 border border-slate-200 rounded-xl bg-white');
  catSel.innerHTML=`<option value="">— Geen —</option>`+categories.map(c=>`<option value="${c.id}" ${isEdit&&existing.categoryId===c.id?'selected':''}>${c.name}</option>`).join('');
  content.appendChild(catSel);
  const typeLabel=el('p','text-sm font-semibold text-slate-600');typeLabel.textContent='Type tracking';content.appendChild(typeLabel);
  let selectedType=isEdit?(existing.trackingType||'reps'):'reps';
  const typeGrid=el('div','grid grid-cols-3 gap-2');
  TRACKING_TYPES.forEach(t=>{
    const btn=el('button','flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-sm font-semibold transition-all touch-btn');
    btn.setAttribute('type','button');btn.innerHTML=`<span class="text-2xl">${t.icon}</span><span class="text-xs">${t.label}</span>`;
    btn.addEventListener('click',()=>{selectedType=t.value;refresh();});typeGrid.appendChild(btn);
  });
  const refresh=()=>typeGrid.querySelectorAll('button').forEach((b,j)=>{const a=TRACKING_TYPES[j].value===selectedType;b.style.borderColor=a?'#0ea5e9':'#e2e8f0';b.style.backgroundColor=a?'#f0f9ff':'#f8fafc';b.style.color=a?'#0ea5e9':'#64748b';});
  content.appendChild(typeGrid);setTimeout(refresh,0);
  const saveBtn=el('button','w-full py-3 bg-sky-500 text-white rounded-xl font-semibold touch-btn shadow-sm');
  saveBtn.textContent=isEdit?'Opslaan':'Oefening aanmaken';
  saveBtn.addEventListener('click',async()=>{
    const name=nameInput.value.trim();if(!name){nameInput.focus();return;}
    const emoji=pickEmoji(name);const catId=catSel.value||null;
    const data={name,emoji,trackingType:selectedType,categoryId:catId};
    if(isEdit)await updateDoc(doc(db,'exercises',existing._fid),data);
    else await addDoc(colExercises(),data);
    closeModal();
  });
  content.appendChild(saveBtn);showModal(content,isEdit?'Oefening bewerken':'Nieuwe oefening');setTimeout(()=>nameInput.focus(),100);
}

/* ── Routines ────────────────────────────────────────────── */
function renderRoutines() {
  const list=document.getElementById('routines-list');if(!list)return;list.innerHTML='';
  if(!routines.length){
    const e=el('div','text-center text-slate-400 py-6 text-sm');
    e.innerHTML=`<div class="text-3xl mb-2">📋</div><div>${isTrainer?'Nog geen routines.':'Geen routines beschikbaar.'}</div>`;
    list.appendChild(e);return;
  }
  routines.forEach(r=>{
    const c=getRoutineColor(r);
    const card=el('div','rounded-2xl overflow-hidden shadow-sm');card.style.backgroundColor=c.light;
    const inner=el('div','p-3.5 flex items-center gap-3');
    const bar=el('div','w-1 rounded-full shrink-0 self-stretch min-h-[2.5rem]');bar.style.backgroundColor=c.bg;
    const left=el('div','flex-1 min-w-0');
    const title=el('div','font-bold text-sm text-slate-800');title.textContent=r.name;
    const det=el('div','text-xs text-slate-500 mt-0.5 truncate');
    det.textContent=(r.exercises||[]).map(eid=>{const ex=exercises.find(x=>x.id===eid);return ex?`${ex.emoji} ${ex.name}`:''}).filter(Boolean).join(' · ')||'Geen oefeningen';
    left.append(title,det);
    const btns=el('div','flex gap-2 shrink-0');
    const start=el('button','px-3 py-2 text-white rounded-xl text-xs font-bold touch-btn shadow-sm');
    start.setAttribute('type','button');start.style.backgroundColor=c.bg;start.textContent='▶ Start';
    start.addEventListener('click',e=>{e.stopPropagation();openWorkoutView(r);});
    btns.appendChild(start);
    if(isTrainer){
      const eb=el('button','w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 text-sky-500 touch-btn');
      eb.setAttribute('type','button');eb.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>`;
      eb.addEventListener('click',e=>{e.stopPropagation();showRoutineModal(r);});
      const del=el('button','w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 text-red-400 touch-btn');
      del.setAttribute('type','button');del.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
      del.addEventListener('click',async e=>{e.stopPropagation();if(!confirm(`Routine "${r.name}" verwijderen?`))return;await deleteDoc(doc(db,'routines',r._fid));});
      btns.append(eb,del);
    }
    inner.append(bar,left,btns);card.appendChild(inner);list.appendChild(card);
  });
}

function showRoutineModal(existing=null) {
  const isEdit=!!existing;
  const content=el('div','space-y-3');
  const nameInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-medium');
  nameInput.placeholder='Naam van routine';if(isEdit)nameInput.value=existing.name;content.appendChild(nameInput);
  const colorLabel=el('p','text-sm font-semibold text-slate-600');colorLabel.textContent='Kleur';content.appendChild(colorLabel);
  let selectedColorIndex=isEdit?(existing.colorIndex??0):0;
  const colorGrid=el('div','flex flex-wrap gap-2.5');
  ROUTINE_COLORS.forEach((c,i)=>{
    const sw=el('button','color-swatch touch-btn'+(i===selectedColorIndex?' selected':''));
    sw.style.backgroundColor=c.bg;sw.title=c.name;sw.setAttribute('type','button');
    sw.addEventListener('click',()=>{selectedColorIndex=i;colorGrid.querySelectorAll('.color-swatch').forEach((s,j)=>s.classList.toggle('selected',j===i));});
    colorGrid.appendChild(sw);
  });content.appendChild(colorGrid);
  const exLabel=el('p','text-sm font-semibold text-slate-600');exLabel.textContent='Oefeningen';content.appendChild(exLabel);
  const sw=el('div','flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3');
  const si=el('span','text-slate-400 text-sm shrink-0');si.textContent='🔍';
  const inp=el('input','flex-1 py-2.5 px-2 bg-transparent outline-none text-sm');inp.placeholder='Zoek…';
  sw.append(si,inp);content.appendChild(sw);
  const exList=el('div','grid gap-1.5 max-h-56 overflow-y-auto modal-scroll');content.appendChild(exList);
  function renderExList(filter=''){
    const checked=new Set(Array.from(exList.querySelectorAll('input:checked')).map(i=>i.value));
    exList.innerHTML='';
    const filtered=filter?exercises.filter(e=>e.name.toLowerCase().includes(filter.toLowerCase())):exercises;
    if(!filtered.length){const e=el('p','text-sm text-slate-400 text-center py-3');e.textContent=filter?'Geen gevonden.':'Nog geen oefeningen.';exList.appendChild(e);return;}
    const byCat={};filtered.forEach(ex=>{const k=ex.categoryId||'__none__';if(!byCat[k])byCat[k]=[];byCat[k].push(ex);});
    [...categories,{id:'__none__',name:'Zonder categorie'}].forEach(cat=>{
      const exs=byCat[cat.id];if(!exs?.length)return;
      if(categories.length>0){const h=el('div','text-xs font-bold text-slate-400 pt-1 pb-0.5 px-1 uppercase tracking-wide');h.textContent=cat.id==='__none__'?'Zonder categorie':cat.name;exList.appendChild(h);}
      exs.forEach(ex=>{
        const isChecked=checked.size?checked.has(ex.id):(isEdit?(existing.exercises||[]).includes(ex.id):false);
        const lbl=el('label','flex items-center gap-3 p-2.5 border border-slate-100 bg-slate-50 rounded-xl cursor-pointer');
        const cb=el('input','w-5 h-5 accent-sky-500 shrink-0');cb.type='checkbox';cb.value=ex.id;cb.checked=isChecked;
        const em=el('div','text-xl shrink-0');em.textContent=ex.emoji;
        const nm=el('div','font-semibold text-sm');nm.textContent=ex.name;
        lbl.append(cb,em,nm);exList.appendChild(lbl);
      });
    });
  }
  renderExList();inp.addEventListener('input',()=>renderExList(inp.value));
  const saveBtn=el('button','w-full py-3 bg-sky-500 text-white rounded-xl font-semibold touch-btn shadow-sm');
  saveBtn.textContent=isEdit?'Opslaan':'Routine aanmaken';
  saveBtn.addEventListener('click',async()=>{
    const name=nameInput.value.trim();if(!name){nameInput.focus();return;}
    const checkedIds=Array.from(exList.querySelectorAll('input:checked')).map(i=>i.value);
    const data={name,colorIndex:selectedColorIndex,exercises:checkedIds};
    if(isEdit)await updateDoc(doc(db,'routines',existing._fid),data);
    else await addDoc(colRoutines(),data);
    closeModal();
  });
  content.appendChild(saveBtn);showModal(content,isEdit?'Routine bewerken':'Nieuwe routine');setTimeout(()=>nameInput.focus(),100);
}

/* ── PRs ─────────────────────────────────────────────────── */
function renderPRs() {
  const list=document.getElementById('prs-list');if(!list)return;list.innerHTML='';
  const entries=Object.entries(prs);
  if(!entries.length){const e=el('div','text-center text-slate-400 py-12 text-sm');e.innerHTML=`<div class="text-5xl mb-3">🏆</div><div class="font-semibold text-slate-500 mb-1">Nog geen records</div><div>Voltooi een workout om je eerste PR te zetten!</div>`;list.appendChild(e);return;}
  entries.forEach(([exId,pr])=>{
    const ex=exercises.find(e=>e.id===exId)||{name:'Onbekend',emoji:'🏋️',trackingType:'reps'};
    const tt=getTrackingType(ex);
    const row=el('div','bg-white p-4 rounded-2xl flex items-center gap-3 shadow-sm');
    const iw=el('div','w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 bg-amber-50');iw.textContent=ex.emoji;
    const info=el('div','flex-1 min-w-0');
    const nm=el('div','font-bold text-sm text-slate-800');nm.textContent=ex.name;
    const dt=el('div','text-xs text-slate-400 mt-0.5');dt.textContent=formatDate(pr.date);
    info.append(nm,dt);
    const valDiv=el('div','text-right shrink-0');
    if(tt.value==='distance')valDiv.innerHTML=`<div class="text-lg font-black text-slate-800">${pr.distance??0}<span class="text-sm font-normal text-slate-400 ml-0.5">m</span></div>`;
    else if(tt.value==='time')valDiv.innerHTML=`<div class="text-lg font-black text-slate-800">${formatSeconds(pr.seconds??0)}</div>`;
    else valDiv.innerHTML=`<div class="text-lg font-black text-slate-800">${pr.weight??0}<span class="text-sm font-normal text-slate-400 ml-0.5">kg</span></div>${pr.reps?`<div class="text-xs text-slate-400">${pr.reps} reps</div>`:''}`;
    row.append(iw,info,valDiv);list.appendChild(row);
  });
}

/* ── Body stats / Progression ───────────────────────────── */
function drawLineChart(data, color) {
  const ns = 'http://www.w3.org/2000/svg';
  const W = 340, H = 130, PL = 36, PR = 10, PT = 12, PB = 28;
  const iW = W - PL - PR, iH = H - PT - PB;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.cssText = 'width:100%;display:block;';

  if (!data.length) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', W/2); t.setAttribute('y', H/2);
    t.setAttribute('text-anchor','middle'); t.setAttribute('fill','#94a3b8'); t.setAttribute('font-size','12');
    t.textContent = 'Nog geen data'; svg.appendChild(t); return svg;
  }

  const vals = data.map(d => d.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const pad  = (maxV - minV) * 0.18 || 2;
  const lo   = minV - pad, hi = maxV + pad;
  const xS   = i => PL + (data.length > 1 ? (i / (data.length - 1)) * iW : iW / 2);
  const yS   = v => PT + iH - ((v - lo) / (hi - lo)) * iH;

  [0, 0.5, 1].forEach(t => {
    const y = PT + t * iH, v = hi - t * (hi - lo);
    const gl = document.createElementNS(ns, 'line');
    gl.setAttribute('x1', PL); gl.setAttribute('x2', W - PR);
    gl.setAttribute('y1', y); gl.setAttribute('y2', y);
    gl.setAttribute('stroke', '#e2e8f0'); gl.setAttribute('stroke-width', '1'); svg.appendChild(gl);
    const tx = document.createElementNS(ns, 'text');
    tx.setAttribute('x', PL - 4); tx.setAttribute('y', y + 3.5);
    tx.setAttribute('text-anchor', 'end'); tx.setAttribute('font-size', '9'); tx.setAttribute('fill', '#94a3b8');
    tx.textContent = v.toFixed(1); svg.appendChild(tx);
  });

  if (data.length > 1) {
    const pts = data.map((d, i) => `${xS(i)},${yS(d.value)}`).join(' L ');
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', `M ${xS(0)},${PT+iH} L ${pts} L ${xS(data.length-1)},${PT+iH} Z`);
    area.setAttribute('fill', color); area.setAttribute('opacity', '0.13'); svg.appendChild(area);
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', `M ${pts}`); line.setAttribute('fill', 'none');
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round'); line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }

  const step = Math.max(1, Math.ceil(data.length / 4));
  data.forEach((d, i) => {
    const cx = xS(i), cy = yS(d.value);
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '4');
    c.setAttribute('fill', color); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '2');
    svg.appendChild(c);
    if (i === 0 || i === data.length - 1 || i % step === 0) {
      const lbl = new Date(d.date + 'T00:00:00').toLocaleDateString('nl-NL', {day:'numeric', month:'short'});
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', cx); tx.setAttribute('y', H - 4);
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '9'); tx.setAttribute('fill', '#94a3b8');
      tx.textContent = lbl; svg.appendChild(tx);
    }
  });
  return svg;
}

function buildProgressionCharts(stats) {
  const frag = document.createDocumentFragment();

  if (stats.length) {
    const latest = stats[stats.length - 1];
    const summary = el('div', 'grid grid-cols-3 gap-2');
    [
      { label: 'Gewicht', val: latest.weight != null ? `${latest.weight} kg` : '—', color: '#0ea5e9' },
      { label: 'Vet%',    val: latest.fatPercent != null ? `${latest.fatPercent}%` : '—', color: '#f97316' },
      { label: 'Spier%',  val: latest.musclePercent != null ? `${latest.musclePercent}%` : '—', color: '#22c55e' },
    ].forEach(s => {
      const d = el('div', 'bg-slate-50 rounded-xl p-3 text-center');
      d.innerHTML = `<div class="text-lg font-black tabular-nums" style="color:${s.color}">${s.val}</div><div class="text-xs text-slate-400 mt-0.5">${s.label}</div>`;
      summary.appendChild(d);
    });
    const dateNote = el('p', 'text-xs text-slate-400 text-center');
    dateNote.textContent = `Laatste meting: ${formatDate(latest.date)}`;
    frag.append(summary, dateNote);
  }

  [
    { key: 'weight',        label: 'Gewicht (kg)',         color: '#0ea5e9' },
    { key: 'fatPercent',    label: 'Vetpercentage (%)',     color: '#f97316' },
    { key: 'musclePercent', label: 'Spierpercentage (%)',   color: '#22c55e' },
  ].forEach(({ key, label, color }) => {
    const data = stats.filter(s => s[key] != null).map(s => ({ date: s.date, value: s[key] }));
    const sec  = el('div', 'bg-white rounded-2xl p-4 shadow-sm');
    const hdr  = el('div', 'flex items-center gap-2 mb-3');
    const dot  = el('span', 'w-3 h-3 rounded-full shrink-0'); dot.style.backgroundColor = color;
    const lbl  = el('span', 'font-bold text-sm text-slate-700'); lbl.textContent = label;
    hdr.append(dot, lbl);
    if (data.length >= 2) {
      const diff  = data[data.length - 1].value - data[0].value;
      const good  = key === 'musclePercent' ? diff > 0 : diff < 0;
      const badge = el('span', 'ml-auto text-xs font-bold px-2 py-0.5 rounded-full');
      badge.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + (key === 'weight' ? ' kg' : '%');
      badge.style.background = diff === 0 ? '#f1f5f9' : good ? '#dcfce7' : '#fee2e2';
      badge.style.color      = diff === 0 ? '#64748b' : good ? '#16a34a' : '#dc2626';
      hdr.appendChild(badge);
    }
    sec.appendChild(hdr);
    sec.appendChild(drawLineChart(data, color));
    frag.appendChild(sec);
  });
  return frag;
}

function renderProgression() {
  const wrap = document.getElementById('progression-content'); if (!wrap) return;
  wrap.innerHTML = '';
  if (!bodyStats.length) {
    const empty = el('div', 'text-center text-slate-400 py-16');
    empty.innerHTML = `<div class="text-5xl mb-3">📊</div><div class="font-semibold text-slate-500 mb-1">Nog geen metingen</div><div class="text-sm">Je trainer voegt metingen toe na jullie sessie.</div>`;
    wrap.appendChild(empty); return;
  }
  const inner = el('div', 'space-y-4');
  inner.appendChild(buildProgressionCharts(bodyStats));
  wrap.appendChild(inner);
}

async function showClientProgressionModal(client) {
  const content = el('div', 'space-y-4');
  const info = el('div', 'bg-slate-50 rounded-xl p-3 flex items-center gap-3');
  const av   = el('div', 'w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-black shrink-0');
  av.textContent = (client.name || client.email || '?')[0].toUpperCase();
  const txt = el('div'); txt.innerHTML = `<div class="font-bold text-sm">${client.name || 'Klant'}</div><div class="text-xs text-slate-400">${client.email}</div>`;
  info.append(av, txt); content.appendChild(info);
  const loading = el('div', 'text-center text-slate-400 py-6 text-sm'); loading.textContent = 'Laden…';
  content.appendChild(loading);
  const closeBtn = el('button', 'w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn');
  closeBtn.textContent = 'Sluiten'; closeBtn.addEventListener('click', closeModal);
  content.appendChild(closeBtn);
  showModal(content, `Progressie — ${client.name || client.email}`);

  const snap  = await getDocs(query(colBodyStats(client.uid), orderBy('date', 'asc')));
  const stats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  loading.remove();

  const addBtn = el('button', 'w-full py-3 bg-green-500 text-white rounded-xl font-bold touch-btn shadow-sm');
  addBtn.textContent = '+ Meting toevoegen';
  addBtn.addEventListener('click', () => showAddMeasurementModal(client));
  closeBtn.before(addBtn);

  if (!stats.length) {
    const empty = el('div', 'text-center text-slate-400 py-8');
    empty.innerHTML = `<div class="text-4xl mb-2">📊</div><div class="text-sm">Nog geen metingen voor deze klant.</div>`;
    addBtn.before(empty);
  } else {
    const charts = el('div', 'space-y-4');
    charts.appendChild(buildProgressionCharts(stats));
    addBtn.before(charts);

    // Measurements list with delete
    const listSec = el('div', 'space-y-2');
    const listHdr = el('p', 'text-xs font-bold text-slate-500 uppercase tracking-wide'); listHdr.textContent = 'Alle metingen';
    listSec.appendChild(listHdr);
    [...stats].reverse().forEach(s => {
      const row = el('div', 'bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm');
      const date = el('div', 'text-xs font-semibold text-slate-500 w-20 shrink-0'); date.textContent = formatDate(s.date);
      const vals = el('div', 'flex-1 text-xs text-slate-600 flex flex-wrap gap-x-3');
      if (s.weight != null)        vals.innerHTML += `<span>⚖️ <b>${s.weight}</b> kg</span>`;
      if (s.fatPercent != null)    vals.innerHTML += `<span>🟠 <b>${s.fatPercent}</b>%</span>`;
      if (s.musclePercent != null) vals.innerHTML += `<span>🟢 <b>${s.musclePercent}</b>%</span>`;
      const delBtn = el('button', 'w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 shrink-0 touch-btn');
      delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Meting van ${formatDate(s.date)} verwijderen?`)) return;
        await deleteDoc(doc(db, 'users', client.uid, 'bodyStats', s.date));
        closeModal();
        showClientProgressionModal(client);
      });
      row.append(date, vals, delBtn);
      listSec.appendChild(row);
    });
    addBtn.before(listSec);
  }
}

function showAddMeasurementModal(client) {
  const formContent = el('div', 'space-y-3');
  const dateInput = el('input', 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-green-400');
  dateInput.type = 'date'; dateInput.value = todayISO(); formContent.appendChild(dateInput);

  const fields = [
    { label: 'Gewicht (kg)',       placeholder: 'bv. 75.5', id: 'bsf-weight' },
    { label: 'Vetpercentage (%)',   placeholder: 'bv. 18.5', id: 'bsf-fat'    },
    { label: 'Spierpercentage (%)', placeholder: 'bv. 42.0', id: 'bsf-muscle' },
  ];
  fields.forEach(f => {
    const lbl = el('label', 'block text-sm font-semibold text-slate-600'); lbl.textContent = f.label;
    const inp = el('input', 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-green-400 font-medium');
    inp.id = f.id; inp.type = 'number'; inp.step = '0.1'; inp.placeholder = f.placeholder;
    formContent.append(lbl, inp);
  });

  const saveBtn = el('button', 'w-full py-3 bg-green-500 text-white rounded-xl font-semibold touch-btn shadow-sm');
  saveBtn.textContent = 'Opslaan';
  saveBtn.addEventListener('click', async () => {
    const date       = dateInput.value || todayISO();
    const weight     = parseFloat(document.getElementById('bsf-weight').value);
    const fatPct     = parseFloat(document.getElementById('bsf-fat').value);
    const musclePct  = parseFloat(document.getElementById('bsf-muscle').value);
    if (isNaN(weight) && isNaN(fatPct) && isNaN(musclePct)) { alert('Vul minimaal één waarde in.'); return; }
    const data = { date, updatedAt: serverTimestamp() };
    if (!isNaN(weight))    data.weight        = weight;
    if (!isNaN(fatPct))    data.fatPercent    = fatPct;
    if (!isNaN(musclePct)) data.musclePercent = musclePct;
    saveBtn.textContent = 'Bezig…'; saveBtn.disabled = true;
    await setDoc(doc(db, 'users', client.uid, 'bodyStats', date), data, { merge: true });
    closeModal();
    showClientProgressionModal(client);
  });
  formContent.appendChild(saveBtn);
  showModal(formContent, 'Meting toevoegen');
  setTimeout(() => document.getElementById('bsf-weight')?.focus(), 100);
}

/* ── Clients tab (trainer) ───────────────────────────────── */
async function renderClients() {
  const list=document.getElementById('clients-list');if(!list)return;list.innerHTML='';
  if(!clients.length){
    const e=el('div','text-center text-slate-400 py-12 text-sm');
    e.innerHTML=`<div class="text-5xl mb-3">👥</div><div class="font-semibold text-slate-500 mb-1">Nog geen klanten</div><div>Voeg je eerste klant toe via "+ Nieuw".</div>`;
    list.appendChild(e);return;
  }
  clients.forEach(client=>{
    const card=el('div','bg-white rounded-2xl shadow-sm p-4 space-y-3');
    const top=el('div','flex items-center gap-3');
    const avatar=el('div','w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white font-black text-lg shrink-0');
    avatar.textContent=(client.name||client.email||'?')[0].toUpperCase();
    const info=el('div','flex-1 min-w-0');
    const nm=el('div','font-bold text-sm text-slate-800 truncate');nm.textContent=client.name||'Klant';
    const em=el('div','text-xs text-slate-400 truncate');em.textContent=client.email;
    info.append(nm,em);
    const delBtn=el('button','w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-400 touch-btn shrink-0');
    delBtn.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    delBtn.addEventListener('click',()=>confirmDeleteClient(client));
    const pwBtn=el('button','w-9 h-9 flex items-center justify-center rounded-xl bg-sky-50 text-sky-500 touch-btn shrink-0');
    pwBtn.title='Wachtwoord reset';
    pwBtn.innerHTML=`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>`;
    pwBtn.addEventListener('click',()=>showResetPasswordModal(client));
    top.append(avatar,info,pwBtn,delBtn);
    const btns=el('div','grid grid-cols-3 gap-2');
    const insightsBtn=el('button','py-2 bg-purple-50 text-purple-500 rounded-xl text-xs font-bold touch-btn');insightsBtn.textContent='📊 Inzichten';
    insightsBtn.addEventListener('click',()=>showClientInsightsModal(client));
    const schedBtn=el('button','py-2 bg-sky-50 text-sky-500 rounded-xl text-xs font-bold touch-btn');schedBtn.textContent='📅 Schema';
    schedBtn.addEventListener('click',()=>showClientScheduleModal(client));
    const progBtn=el('button','py-2 bg-green-50 text-green-600 rounded-xl text-xs font-bold touch-btn');progBtn.textContent='📈 Progressie';
    progBtn.addEventListener('click',()=>showClientProgressionModal(client));
    btns.append(insightsBtn,schedBtn,progBtn);
    card.append(top,btns);list.appendChild(card);
  });
}

async function showClientInsightsModal(client) {
  const content=el('div','space-y-4');

  // Header
  const info=el('div','bg-slate-50 rounded-xl p-3 flex items-center gap-3');
  const av=el('div','w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-black shrink-0');
  av.textContent=(client.name||client.email||'?')[0].toUpperCase();
  const txt=el('div');txt.innerHTML=`<div class="font-bold text-sm">${client.name||'Klant'}</div><div class="text-xs text-slate-400">${client.email}</div>`;
  info.append(av,txt);content.appendChild(info);

  // Loading state
  const loadingEl=el('div','text-center text-slate-400 py-6 text-sm');loadingEl.textContent='Gegevens laden…';content.appendChild(loadingEl);

  const closeBtn=el('button','w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn');
  closeBtn.textContent='Sluiten';closeBtn.addEventListener('click',closeModal);
  content.appendChild(closeBtn);
  showModal(content,`Inzichten — ${client.name||client.email}`);

  // Fetch client workouts
  const snap=await getDocs(query(colWorkouts(client.uid),orderBy('date','desc')));
  const cWorkouts=snap.docs.map(d=>({id:d.id,...d.data()}));
  loadingEl.remove();

  if(!cWorkouts.length){
    const empty=el('div','text-center text-slate-400 py-6 text-sm');
    empty.innerHTML=`<div class="text-4xl mb-2">💤</div><div>Nog geen workouts geregistreerd.</div>`;
    closeBtn.before(empty);return;
  }

  // ── Stats row ──
  const totalWorkouts=cWorkouts.length;
  const allDates=[...new Set(cWorkouts.map(w=>w.date))].sort().reverse();

  // streak
  let streak=0,cur=new Date();
  for(const d of allDates){
    const diff=Math.round((cur-new Date(d+'T00:00:00'))/86400000);
    if(diff<=1){streak++;cur=new Date(d+'T00:00:00');}else break;
  }

  // workouts this month
  const nowISO=todayISO();
  const monthStart=nowISO.slice(0,7)+'-01';
  const thisMonth=cWorkouts.filter(w=>w.date>=monthStart).length;

  // weekly avg (last 4 weeks)
  const fourWeeksAgo=todayISO(new Date(Date.now()-28*86400000));
  const recentCount=cWorkouts.filter(w=>w.date>=fourWeeksAgo).length;
  const weeklyAvg=(recentCount/4).toFixed(1);

  // total volume (all time)
  const totalVol=cWorkouts.flatMap(w=>w.exercises.flatMap(ex=>ex.sets.map(s=>(s.weight||0)*(s.reps||1)))).reduce((a,b)=>a+b,0);
  const volStr=totalVol>=1000?`${(totalVol/1000).toFixed(1)}t`:`${Math.round(totalVol)}kg`;

  const statsGrid=el('div','grid grid-cols-2 gap-2');
  [
    {val:totalWorkouts, lbl:'Totaal workouts', accent:'#0ea5e9', icon:'🏋️'},
    {val:`${streak}🔥`, lbl:'Huidige streak', accent:'#f97316', icon:''},
    {val:thisMonth, lbl:'Deze maand', accent:'#22c55e', icon:'📅'},
    {val:weeklyAvg, lbl:'Gem. per week', accent:'#a855f7', icon:'📈'},
  ].forEach(c=>{
    const d=el('div','bg-white rounded-2xl shadow-sm text-center overflow-hidden');
    const bar=el('div','h-1 rounded-t');bar.style.backgroundColor=c.accent;
    const body=el('div','px-2 py-3');
    body.innerHTML=`<div class="text-2xl font-black text-slate-800 tabular-nums">${c.val}</div><div class="text-xs text-slate-400 mt-0.5 font-medium">${c.lbl}</div>`;
    d.append(bar,body);statsGrid.appendChild(d);
  });
  closeBtn.before(statsGrid);

  // Total volume card
  const volCard=el('div','bg-gradient-to-r from-sky-500 to-purple-500 rounded-2xl p-4 text-white');
  volCard.innerHTML=`<div class="text-xs font-semibold opacity-80 mb-1">Totaal volume (all time)</div><div class="text-3xl font-black">${volStr}</div>`;
  closeBtn.before(volCard);

  // ── Most used routines ──
  const routineCount={};
  cWorkouts.forEach(w=>{
    const rId=w.routineId;
    if(rId)routineCount[rId]=(routineCount[rId]||0)+1;
  });
  const topRoutines=Object.entries(routineCount).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(topRoutines.length){
    const sec=el('div','space-y-2');
    const h=el('p','text-xs font-bold text-slate-500 uppercase tracking-wide');h.textContent='Meest gedane routines';sec.appendChild(h);
    topRoutines.forEach(([rId,count])=>{
      const r=routines.find(x=>x.id===rId);
      const c=r?getRoutineColor(r):{bg:'#94a3b8',light:'#f1f5f9'};
      const row=el('div','flex items-center gap-2 rounded-xl px-3 py-2');row.style.backgroundColor=c.light;
      const dot=el('div','w-3 h-3 rounded-full shrink-0');dot.style.backgroundColor=c.bg;
      const name=el('div','flex-1 text-sm font-semibold text-slate-700');name.textContent=r?r.name:'Onbekend';
      const cnt=el('div','text-sm font-black tabular-nums');cnt.style.color=c.bg;cnt.textContent=`${count}×`;
      row.append(dot,name,cnt);sec.appendChild(row);
    });
    closeBtn.before(sec);
  }

  // ── Recent workouts ──
  const recSec=el('div','space-y-2');
  const recH=el('p','text-xs font-bold text-slate-500 uppercase tracking-wide');recH.textContent='Recente activiteit';recSec.appendChild(recH);
  cWorkouts.slice(0,5).forEach(w=>{
    const r=w.routineId?routines.find(x=>x.id===w.routineId):null;
    const c=r?getRoutineColor(r):{bg:'#94a3b8',light:'#f1f5f9'};
    const exCount=w.exercises?.length||0;
    const setCount=w.exercises?.flatMap(e=>e.sets||[]).length||0;
    const wVol=w.exercises?.flatMap(ex=>ex.sets?.map(s=>(s.weight||0)*(s.reps||1))||[]).reduce((a,b)=>a+b,0)||0;
    const wVolStr=wVol>=1000?`${(wVol/1000).toFixed(1)}t`:`${Math.round(wVol)}kg`;
    const row=el('div','bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm');
    const dot=el('div','w-2 h-2 rounded-full shrink-0 mt-0.5');dot.style.backgroundColor=c.bg;
    const main=el('div','flex-1 min-w-0');
    main.innerHTML=`<div class="text-sm font-semibold text-slate-700 truncate">${r?r.name:'Vrije workout'}</div><div class="text-xs text-slate-400">${formatDate(w.date)} · ${exCount} oef · ${setCount} sets</div>`;
    const vol=el('div','text-sm font-bold tabular-nums shrink-0');vol.style.color=c.bg;vol.textContent=wVolStr;
    const wDelBtn=el('button','w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 shrink-0 touch-btn');
    wDelBtn.innerHTML=`<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5"/></svg>`;
    wDelBtn.addEventListener('click',async()=>{
      if(!confirm(`Workout van ${formatDate(w.date)} verwijderen?`))return;
      await deleteDoc(doc(db,'users',client.uid,'workouts',w.id));
      closeModal();
      showClientInsightsModal(client);
    });
    row.append(dot,main,vol,wDelBtn);recSec.appendChild(row);
  });
  closeBtn.before(recSec);
}

async function showClientScheduleModal(client) {
  // Load client's schedules
  const schedSnap=await getDocs(colSchedules(client.uid));
  const clientSched={};schedSnap.docs.forEach(d=>{clientSched[d.id]=d.data().routineId;});

  const content=el('div','space-y-4');
  const info=el('div','bg-slate-50 rounded-xl p-3 flex items-center gap-3');
  const av=el('div','w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white font-black shrink-0');
  av.textContent=(client.name||client.email||'?')[0].toUpperCase();
  const txt=el('div');txt.innerHTML=`<div class="font-bold text-sm">${client.name||'Klant'}</div><div class="text-xs text-slate-400">${client.email}</div>`;
  info.append(av,txt);content.appendChild(info);

  // Next 14 days picker
  const heading=el('p','text-sm font-semibold text-slate-600 mt-1');heading.textContent='Schema komende 14 dagen';content.appendChild(heading);
  const grid=el('div','grid gap-2');
  for(let i=0;i<14;i++){
    const d=new Date();d.setDate(d.getDate()+i);
    const iso=todayISO(d);
    const scheduledId=clientSched[iso];
    const scheduledRoutine=scheduledId?routines.find(r=>r.id===scheduledId):null;
    const row=el('div','flex items-center gap-2');
    const dateLabel=el('div','text-sm font-medium text-slate-600 w-24 shrink-0');dateLabel.textContent=formatDate(iso);
    const sel=el('select','flex-1 p-2 border border-slate-200 rounded-xl bg-white text-sm');
    sel.innerHTML=`<option value="">— Vrij —</option>`+routines.map(r=>`<option value="${r.id}" ${scheduledId===r.id?'selected':''}>${r.name}</option>`).join('');
    sel.addEventListener('change',async()=>{
      if(sel.value)await setDoc(doc(db,'users',client.uid,'schedules',iso),{routineId:sel.value});
      else await deleteDoc(doc(db,'users',client.uid,'schedules',iso));
    });
    if(scheduledRoutine){const c=getRoutineColor(scheduledRoutine);sel.style.borderColor=c.bg;sel.style.backgroundColor=c.light;}
    sel.addEventListener('change',()=>{const r2=routines.find(x=>x.id===sel.value);if(r2){const c=getRoutineColor(r2);sel.style.borderColor=c.bg;sel.style.backgroundColor=c.light;}else{sel.style.borderColor='';sel.style.backgroundColor='';}});
    row.append(dateLabel,sel);grid.appendChild(row);
  }
  content.appendChild(grid);
  const closeBtn=el('button','mt-2 w-full py-3 bg-slate-800 text-white rounded-xl font-semibold touch-btn');
  closeBtn.textContent='Klaar';closeBtn.addEventListener('click',closeModal);
  content.appendChild(closeBtn);
  showModal(content,`Schema — ${client.name||client.email}`);
}

async function showResetPasswordModal(client) {
  const content = el('div', 'space-y-3');
  const info = el('p', 'text-sm text-slate-600');
  info.textContent = `Firebase stuurt een wachtwoord reset e-mail naar ${client.email}. De klant kan dan zelf een nieuw wachtwoord instellen.`;
  content.appendChild(info);
  const errorEl = el('p', 'text-red-500 text-sm hidden'); content.appendChild(errorEl);
  const sendBtn = el('button', 'w-full py-3 bg-sky-500 text-white rounded-xl font-semibold touch-btn shadow-sm');
  sendBtn.textContent = '📧  Reset e-mail versturen';
  sendBtn.addEventListener('click', async () => {
    sendBtn.textContent = 'Bezig…'; sendBtn.disabled = true;
    try {
      await sendPasswordResetEmail(auth, client.email);
      closeModal();
      alert(`Reset e-mail verstuurd naar ${client.email}`);
    } catch (err) {
      errorEl.textContent = 'Versturen mislukt: ' + err.message;
      errorEl.classList.remove('hidden');
      sendBtn.textContent = '📧  Reset e-mail versturen'; sendBtn.disabled = false;
    }
  });
  content.appendChild(sendBtn);
  const cancelBtn = el('button', 'w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold touch-btn');
  cancelBtn.textContent = 'Annuleren'; cancelBtn.addEventListener('click', closeModal);
  content.appendChild(cancelBtn);
  showModal(content, `Wachtwoord reset — ${client.name || client.email}`);
}

async function confirmDeleteClient(client) {
  if(!confirm(`Klant "${client.name||client.email}" verwijderen?\nDeze actie kan niet ongedaan worden.`))return;
  await updateDoc(doc(db,'users',client.uid),{role:'deleted'});
  clients=clients.filter(c=>c.uid!==client.uid);
  renderClients();
}

function showNewClientModal() {
  const content=el('div','space-y-3');
  const nameInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400 font-medium');nameInput.placeholder='Naam klant';content.appendChild(nameInput);
  const emailInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');emailInput.type='email';emailInput.placeholder='email@voorbeeld.nl';content.appendChild(emailInput);
  const passInput=el('input','w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-400');passInput.type='password';passInput.placeholder='Wachtwoord (min. 6 tekens)';content.appendChild(passInput);
  const errorEl=el('p','text-red-500 text-sm hidden');content.appendChild(errorEl);
  const saveBtn=el('button','w-full py-3 bg-sky-500 text-white rounded-xl font-semibold touch-btn shadow-sm');saveBtn.textContent='Klant aanmaken';
  saveBtn.addEventListener('click',async()=>{
    const name=nameInput.value.trim(),email=emailInput.value.trim(),pass=passInput.value;
    if(!name){nameInput.focus();return;}
    if(!email){emailInput.focus();return;}
    if(pass.length<6){errorEl.textContent='Wachtwoord moet minimaal 6 tekens zijn.';errorEl.classList.remove('hidden');return;}
    saveBtn.textContent='Bezig…';saveBtn.disabled=true;
    try{
      // Create account via secondary app (doesn't sign out trainer)
      const cred=await createUserWithEmailAndPassword(secondaryAuth,email,pass);
      await setDoc(doc(db,'users',cred.user.uid),{name,email,role:'client',createdAt:serverTimestamp()});
      await secondaryAuth.signOut();
      closeModal();
      await loadClients();
    }catch(err){
      let msg=err.message;
      if(err.code==='auth/email-already-in-use')msg='Dit e-mailadres is al in gebruik.';
      if(err.code==='auth/invalid-email')msg='Ongeldig e-mailadres.';
      errorEl.textContent=msg;errorEl.classList.remove('hidden');
      saveBtn.textContent='Klant aanmaken';saveBtn.disabled=false;
    }
  });
  content.appendChild(saveBtn);showModal(content,'Nieuwe klant');setTimeout(()=>nameInput.focus(),100);
}

/* ── Search ──────────────────────────────────────────────── */
function bindSearch() {
  const input=document.getElementById('catalog-search');
  const clearBtn=document.getElementById('catalog-search-clear');
  input.addEventListener('input',()=>{clearBtn.classList.toggle('visible',input.value.length>0);renderCatalog(input.value);});
  clearBtn.addEventListener('click',()=>{input.value='';clearBtn.classList.remove('visible');renderCatalog('');input.focus();});
}

/* ── Login ───────────────────────────────────────────────── */
function bindLogin() {
  const emailInput=document.getElementById('login-email');
  const passInput=document.getElementById('login-password');
  const loginBtn=document.getElementById('login-btn');
  const errorEl=document.getElementById('login-error');
  async function doLogin(){
    const email=emailInput.value.trim(),pass=passInput.value;
    if(!email||!pass)return;
    loginBtn.textContent='Bezig…';loginBtn.disabled=true;errorEl.classList.add('hidden');
    try{await signInWithEmailAndPassword(auth,email,pass);}
    catch(err){
      let msg='Inloggen mislukt. Controleer je gegevens.';
      if(err.code==='auth/user-not-found'||err.code==='auth/wrong-password'||err.code==='auth/invalid-credential')msg='Onjuist e-mailadres of wachtwoord.';
      errorEl.textContent=msg;errorEl.classList.remove('hidden');
      loginBtn.textContent='Inloggen';loginBtn.disabled=false;
    }
  }
  loginBtn.addEventListener('click',doLogin);
  passInput.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
}

/* ── Init ────────────────────────────────────────────────── */
function bindUI() {
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
    if(isWorkoutActive&&!confirm('Workout verlaten? Voortgang gaat verloren.'))return;
    showView(btn.dataset.view);
  }));
  document.getElementById('btn-new-exercise')?.addEventListener('click',()=>showExerciseModal(null));
  document.getElementById('btn-new-category')?.addEventListener('click',showNewCategoryModal);
  document.getElementById('btn-new-routine')?.addEventListener('click',()=>showRoutineModal(null));
  document.getElementById('btn-new-client')?.addEventListener('click',showNewClientModal);
  document.getElementById('btn-dark-mode').addEventListener('click',async()=>{
    const on=!document.documentElement.classList.contains('dark');
    applyDarkMode(on);
    if(currentUser)await updateDoc(doc(db,'users',currentUser.uid),{darkMode:on});
  });
  document.getElementById('btn-logout').addEventListener('click',async()=>{
    if(isWorkoutActive&&!confirm('Workout verlaten en uitloggen?'))return;
    unsubscribeAll();await signOut(auth);
  });
  document.getElementById('prev-month').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar();});
  document.getElementById('next-month').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar();});
  bindSearch();
}

bindLogin();
