// ============================================
// ESTADO DE LA APLICACION
// ============================================
let supabaseClient = null;
let tasks = [];
let steps = [];
let currentFilter = 'all';
let deleteTargetId = null;
let audioContext = null;
let soundEnabled = false;
let volume = 0.7;
let currentAlarmTask = null;
let snoozeTimers = {};
let isStepEditing = false;

// ============================================
// INICIALIZACION
// ============================================
document.addEventListener('DOMContentLoaded', init);

function init() {
  if (!SUPABASE_URL || SUPABASE_URL === 'TU_URL_AQUI') {
    showSetupScreen();
    return;
  }
  startApp();
}

function showSetupScreen() {
  document.getElementById('setup-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function saveSetup() {
  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();
  const errEl = document.getElementById('setup-error');
  const okEl = document.getElementById('setup-success');

  errEl.style.display = 'none';
  okEl.style.display = 'none';

  if (!url || !key) {
    errEl.textContent = 'Completa ambos campos.';
    errEl.style.display = 'block';
    return;
  }

  if (!url.includes('supabase.co')) {
    errEl.textContent = 'La URL debe ser de Supabase (termina en .supabase.co)';
    errEl.style.display = 'block';
    return;
  }

  const scriptContent = `const SUPABASE_URL = '${url}';\nconst SUPABASE_ANON_KEY = '${key}';\n`;

  const blob = new Blob([scriptContent], { type: 'application/javascript' });
  const urlBlob = URL.createObjectURL(blob);

  okEl.innerHTML = 'Guarda manualmente el archivo <code>config.js</code> con estas credenciales y recarga.';
  okEl.style.display = 'block';

  console.log('Config a guardar en config.js:', scriptContent);

  const configText = `// Abre config.js y reemplaza con:\n${scriptContent}`;
  copyToClipboard(configText);
  showToast('Config copiada al portapapeles. Pega en config.js y recarga.', 'info');
}

async function startApp() {
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await loadTasks();
    await loadSteps();
    requestNotificationPermission();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(checkAlarms, 5000);
    setInterval(loadTasks, 30000);
    setInterval(loadSteps, 30000);
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    updateDashboard();
    renderTasks();
    renderReminders();
    showToast('Sistema conectado', 'success');
  } catch (err) {
    console.error('Error al iniciar:', err);
    showToast('Error al conectar con Supabase', 'error');
  }
}

// ============================================
// RELOJ Y TURNO
// ============================================
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  document.getElementById('clock').textContent = `${h}:${m}:${s}`;

  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  document.getElementById('clock-date').textContent = `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} ${now.getFullYear()}`;

  const shift = getCurrentShift();
  const shiftNames = { manana: '🌅 Mañana', tarde: '☀️ Tarde', noche: '🌙 Noche' };
  const shiftEl = document.getElementById('current-shift');
  shiftEl.textContent = `Turno: ${shiftNames[shift]}`;
  shiftEl.style.color = shift === 'manana' ? '#f59e0b' : shift === 'tarde' ? '#f97316' : '#a855f7';
}

function getCurrentShift() {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return 'manana';
  if (h >= 14 && h < 22) return 'tarde';
  return 'noche';
}

function getDayName(date) {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return dias[date.getDay()];
}

function formatTime(timeStr) {
  return timeStr.substring(0, 5);
}

// Minutos en linea de tiempo continua del turno.
// Turno noche: 22:00 -> 23:59 -> 00:00 (1440) -> 05:59 (1799)
function getTimelineMinutes(timeStr, shift) {
  const [h, m] = timeStr.split(':').map(Number);
  let total = h * 60 + m;
  if (shift === 'noche' && h < 12) total += 24 * 60;
  return total;
}

function getTaskTimelineMinutes(task) {
  return getTimelineMinutes(task.task_time, task.shift);
}

function getCurrentTimelineMinutes() {
  const now = new Date();
  return getTimelineMinutes(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    getCurrentShift()
  );
}

// ============================================
// BASE DE DATOS
// ============================================
async function loadTasks() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .order('task_time');

    if (error) throw error;
    tasks = data || [];
    updateDashboard();
    renderTasks();
    renderReminders();
  } catch (err) {
    console.error('Error cargando tareas:', err);
    showToast('Error al cargar tareas', 'error');
  }
}

// ============================================
// BASE DE DATOS - PASOS
// ============================================
async function loadSteps() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('task_steps')
      .select('*')
      .order('position');

    if (error) throw error;
    steps = data || [];
    renderTasks();
    renderReminders();
  } catch (err) {
    console.error('Error cargando pasos:', err);
  }
}

function getStepsForTask(taskId) {
  return steps.filter(s => s.task_id === taskId).sort((a, b) => a.position - b.position);
}

async function createStep(taskId, text) {
  const position = getStepsForTask(taskId).length;
  try {
    const { data, error } = await supabaseClient
      .from('task_steps')
      .insert([{ task_id: taskId, text, position, done: false }])
      .select();

    if (error) throw error;
    steps.push(data[0]);
    return data[0];
  } catch (err) {
    console.error('Error creando paso:', err);
    showToast('Error al crear paso', 'error');
    return null;
  }
}

async function updateStepText(stepId, text) {
  try {
    const { data, error } = await supabaseClient
      .from('task_steps')
      .update({ text })
      .eq('id', stepId)
      .select();

    if (error) throw error;
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx !== -1) steps[idx] = data[0];
    return data[0];
  } catch (err) {
    console.error('Error actualizando paso:', err);
    showToast('Error al actualizar paso', 'error');
    return null;
  }
}

async function deleteStep(stepId) {
  try {
    const { error } = await supabaseClient
      .from('task_steps')
      .delete()
      .eq('id', stepId);

    if (error) throw error;
    steps = steps.filter(s => s.id !== stepId);
    showToast('Paso eliminado', 'success');
    return true;
  } catch (err) {
    console.error('Error eliminando paso:', err);
    showToast('Error al eliminar paso', 'error');
    return false;
  }
}

async function toggleStep(stepId, done) {
  try {
    const { data, error } = await supabaseClient
      .from('task_steps')
      .update({ done })
      .eq('id', stepId)
      .select();

    if (error) throw error;
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx !== -1) steps[idx] = data[0];

    // Liberar hijas que dependen de este paso
    if (done) releaseStepDependents(stepId);

    renderTasks();
    renderReminders();
    return data[0];
  } catch (err) {
    console.error('Error actualizando paso:', err);
    showToast('Error al actualizar paso', 'error');
    return null;
  }
}

function releaseStepDependents(stepId) {
  const todayKey = new Date().toISOString().split('T')[0];
  const triggered = getTriggeredTasks();
  if (!triggered[todayKey]) triggered[todayKey] = [];

  tasks.filter(t => t.depends_on_step === stepId && t.enabled).forEach(child => {
    if (triggered[todayKey].includes(child.id)) return;
    triggerAlarm(child);
    triggered[todayKey].push(child.id);
  });

  if (tasks.some(t => t.depends_on_step === stepId)) saveTriggeredTasks(triggered);
}

// ¿Una tarea esta "bloqueada" por su dependencia (madre no hecha o paso no hecho)?
function isTaskBlocked(task) {
  if (!task.depends_on && !task.depends_on_step) return false;

  // Libera por paso especifico
  if (task.depends_on_step) {
    const step = steps.find(s => s.id === task.depends_on_step);
    return !step || !step.done;
  }

  // Libera al terminar la madre
  if (task.depends_on) {
    return !isDismissed(task.depends_on);
  }

  return false;
}

async function createTask(taskData) {
  try {
    const { data, error } = await supabaseClient
      .from('tasks')
      .insert([taskData])
      .select();

    if (error) throw error;
    tasks.push(data[0]);
    updateDashboard();
    renderTasks();
    showToast('Tarea creada', 'success');
    return data[0];
  } catch (err) {
    console.error('Error creando tarea:', err);
    showToast('Error al crear tarea', 'error');
    return null;
  }
}

async function updateTask(id, taskData) {
  try {
    const { data, error } = await supabaseClient
      .from('tasks')
      .update(taskData)
      .eq('id', id)
      .select();

    if (error) throw error;
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) tasks[idx] = data[0];
    updateDashboard();
    renderTasks();
    showToast('Tarea actualizada', 'success');
    return data[0];
  } catch (err) {
    console.error('Error actualizando tarea:', err);
    showToast('Error al actualizar tarea', 'error');
    return null;
  }
}

async function deleteTask(id) {
  try {
    const { error } = await supabaseClient
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    tasks = tasks.filter(t => t.id !== id);
    updateDashboard();
    renderTasks();
    renderReminders();
    showToast('Tarea eliminada', 'success');
  } catch (err) {
    console.error('Error eliminando tarea:', err);
    showToast('Error al eliminar tarea', 'error');
  }
}

// ============================================
// DASHBOARD
// ============================================
function updateDashboard() {
  const now = new Date();
  const today = getDayName(now);

  document.getElementById('stat-total').textContent = tasks.length;

  const todayTasks = tasks.filter(t => t.enabled && t.days.includes(today));
  document.getElementById('stat-enabled').textContent = todayTasks.length;

  const currentTimeline = getCurrentTimelineMinutes();
  const nextTask = todayTasks
    .filter(t => getTaskTimelineMinutes(t) > currentTimeline)
    .sort((a, b) => getTaskTimelineMinutes(a) - getTaskTimelineMinutes(b))[0];

  document.getElementById('stat-next').textContent = nextTask ? formatTime(nextTask.task_time) : '--:--';

  const triggered = getTriggeredTasks();
  const todayKey = now.toISOString().split('T')[0];
  const pending = (triggered[todayKey] || []).filter(id => !isDismissed(id));
  document.getElementById('stat-pending').textContent = pending.length;
}

// ============================================
// RENDERIZADO DE TAREAS
// ============================================
function renderTasks() {
  const container = document.getElementById('tasks-list');
  const today = getDayName(new Date());

  let filteredTasks = tasks;
  if (currentFilter !== 'all') {
    filteredTasks = tasks.filter(t => t.shift === currentFilter);
  }

  if (filteredTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay tareas${currentFilter !== 'all' ? ' en este turno' : ''}.</p>
        <p>Haz clic en "+ Agregar Tarea" para comenzar.</p>
      </div>`;
    return;
  }

  const groups = { manana: [], tarde: [], noche: [] };
  filteredTasks.forEach(t => {
    if (groups[t.shift]) groups[t.shift].push(t);
  });

  Object.values(groups).forEach(g => g.sort((a, b) => getTaskTimelineMinutes(a) - getTaskTimelineMinutes(b)));

  const shiftLabels = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
  let html = '';

  for (const shift of ['manana', 'tarde', 'noche']) {
    const groupTasks = groups[shift];
    if (groupTasks.length === 0) continue;

    html += `
      <div class="task-group">
        <div class="task-group-header">
          <span class="shift-dot ${shift}"></span>
          Turno ${shiftLabels[shift]}
          <span class="shift-count">${groupTasks.length} tarea${groupTasks.length > 1 ? 's' : ''}</span>
        </div>`;

    groupTasks.forEach(task => {
      const daysShort = {
        lunes: 'L', martes: 'M', miercoles: 'X',
        jueves: 'J', viernes: 'V', sabado: 'S', domingo: 'D'
      };
      const dayBadges = Object.entries(daysShort).map(([key, label]) => {
        const active = task.days.includes(key);
        return `<span class="day-badge${active ? ' active' : ''}">${label}</span>`;
      }).join('');

      const disabledClass = task.enabled ? '' : 'disabled';
      const toggleClass = task.enabled ? 'active' : 'inactive';
      const toggleIcon = task.enabled ? '✅' : '⏸️';
      const completedClass = isDismissed(task.id) ? 'completed' : '';
      const completedBadge = isDismissed(task.id) ? '<span class="completed-badge">✅ HECHA</span>' : '';
      const depTask = task.depends_on ? tasks.find(t => t.id === task.depends_on) : null;
      const depStep = task.depends_on_step ? steps.find(s => s.id === task.depends_on_step) : null;
      const depLabel = depStep ? (depStep.text || 'paso') : (depTask ? depTask.title : null);
      const depBadge = (depTask || depStep) ? `<span class="dep-badge" title="Espera: ${escapeHtml(depLabel)}">🔗 ${escapeHtml(depLabel)}${isTaskBlocked(task) ? ' ⏳' : ''}</span>` : '';

      const taskSteps = getStepsForTask(task.id);
      const stepsHtml = taskSteps.length > 0 ? `
        <div class="inline-steps">
          ${taskSteps.map(s => `
            <label class="inline-step${s.done ? ' done' : ''}">
              <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleStep('${s.id}', this.checked)">
              <span class="step-check">${s.done ? '✔' : ''}</span>
              ${escapeHtml(s.text)}
            </label>
          `).join('')}
        </div>` : '';

      html += `
        <div class="task-item ${disabledClass} ${completedClass}">
          <div class="task-time">${formatTime(task.task_time)}</div>
          <div class="task-info">
            <div class="task-title">${escapeHtml(task.title)} ${completedBadge} ${depBadge}</div>
            ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
            ${stepsHtml}
            <div class="task-days">${dayBadges}</div>
          </div>
          <div class="task-actions">
            <button class="btn-toggle ${toggleClass}" title="${task.enabled ? 'Desactivar' : 'Activar'}" onclick="toggleTask('${task.id}', ${!task.enabled})">${toggleIcon}</button>
            <button class="btn-edit" title="Editar" onclick="editTask('${task.id}')">✏️</button>
            <button class="btn-delete" title="Eliminar" onclick="openDeleteModal('${task.id}')">🗑️</button>
          </div>
        </div>`;
    });

    html += `</div>`;
  }

  container.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// RENDERIZADO DE RECORDATORIOS
// ============================================
function renderReminders() {
  const triggered = getTriggeredTasks();
  const todayKey = new Date().toISOString().split('T')[0];
  const todayTriggered = triggered[todayKey] || [];

  const pendingIds = todayTriggered.filter(id => !isDismissed(id));
  const panel = document.getElementById('reminders-panel');
  const list = document.getElementById('reminders-list');

  if (pendingIds.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  let html = '';

  pendingIds.forEach(id => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const shiftLabels = { manana: '🌅 Mañana', tarde: '☀️ Tarde', noche: '🌙 Noche' };

    html += `
      <div class="reminder-item">
        <div class="reminder-info">
          <span class="reminder-time">${formatTime(task.task_time)}</span>
          <div>
            <div class="reminder-title">${escapeHtml(task.title)}</div>
            <div class="reminder-shift">${shiftLabels[task.shift]}</div>
          </div>
        </div>
        <div class="reminder-actions">
          <button class="btn-primary" onclick="dismissReminder('${task.id}')">✅ Hecho</button>
          <button class="btn-secondary" onclick="snoozeReminder('${task.id}')">⏰ +5 min</button>
        </div>
      </div>`;
  });

  list.innerHTML = html;
}

// ============================================
// SISTEMA DE ALARMAS
// ============================================
function checkAlarms() {
  const now = new Date();
  const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const today = getDayName(now);
  const todayKey = now.toISOString().split('T')[0];

  const triggered = getTriggeredTasks();
  const todayTriggered = triggered[todayKey] || [];

  tasks.forEach(task => {
    if (!task.enabled) return;
    if (!task.days.includes(today)) return;
    if (todayTriggered.includes(task.id)) return;

    // Si la tarea esta bloqueada por dependencia (madre o paso), no suena
    if (isTaskBlocked(task)) return;

    const [h, m] = task.task_time.split(':').map(Number);
    const taskSeconds = h * 3600 + m * 60;
    const diff = taskSeconds - currentSeconds;

    if (diff >= 0 && diff <= 15) {
      triggerAlarm(task);
      if (!triggered[todayKey]) triggered[todayKey] = [];
      triggered[todayKey].push(task.id);
      saveTriggeredTasks(triggered);
      updateDashboard();
      renderReminders();
    }
  });
}

function triggerAlarm(task) {
  currentAlarmTask = task;
  document.getElementById('alarm-title').textContent = task.title;
  document.getElementById('alarm-description').textContent = task.description || '';
  document.getElementById('alarm-time').textContent = formatTime(task.task_time);
  document.getElementById('alarm-overlay').style.display = 'flex';

  if (soundEnabled) {
    playAlarmSound();
  }

  if (Notification.permission === 'granted') {
    const shiftLabels = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
    new Notification(`🔔 ${task.title}`, {
      body: `Turno ${shiftLabels[task.shift]} - ${formatTime(task.task_time)}\n${task.description || ''}`,
      icon: '📡',
      requireInteraction: true
    });
  }

  document.title = `🔔 ${task.title} - Control de Monitoreo`;
}

function dismissAlarm() {
  document.getElementById('alarm-overlay').style.display = 'none';
  if (currentAlarmTask) {
    dismissReminder(currentAlarmTask.id);
  }
  currentAlarmTask = null;
  document.title = 'Control de Monitoreo';
  stopAlarmSound();
}

function snoozeAlarm() {
  if (!currentAlarmTask) return;
  const taskId = currentAlarmTask.id;
  document.getElementById('alarm-overlay').style.display = 'none';
  currentAlarmTask = null;
  document.title = 'Control de Monitoreo';
  stopAlarmSound();

  snoozeTimers[taskId] = setTimeout(() => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      const triggered = getTriggeredTasks();
      const todayKey = new Date().toISOString().split('T')[0];
      if (triggered[todayKey]) {
        triggered[todayKey] = triggered[todayKey].filter(id => id !== taskId);
        saveTriggeredTasks(triggered);
      }
      triggerAlarm(task);
      const newTriggered = getTriggeredTasks();
      if (!newTriggered[todayKey]) newTriggered[todayKey] = [];
      newTriggered[todayKey].push(taskId);
      saveTriggeredTasks(newTriggered);
    }
  }, 5 * 60 * 1000);

  showToast('Alarma pospuesta 5 minutos', 'info');
}

// ============================================
// RECORDATORIOS - ACCIONES
// ============================================
function dismissReminder(taskId) {
  markDismissed(taskId);
  renderReminders();
  updateDashboard();

  // Si esta tarea era la "madre" de otras, disparar las hijas que dependen de ella
  const todayKey = new Date().toISOString().split('T')[0];
  const triggered = getTriggeredTasks();
  if (!triggered[todayKey]) triggered[todayKey] = [];

  tasks.filter(t => t.depends_on === taskId && t.enabled).forEach(child => {
    if (triggered[todayKey].includes(child.id)) return;
    triggerAlarm(child);
    triggered[todayKey].push(child.id);
  });

  if (tasks.some(t => t.depends_on === taskId)) saveTriggeredTasks(triggered);

  renderReminders();
  updateDashboard();
}

function snoozeReminder(taskId) {
  markDismissed(taskId);
  renderReminders();
  updateDashboard();

  snoozeTimers[taskId] = setTimeout(() => {
    const triggered = getTriggeredTasks();
    const todayKey = new Date().toISOString().split('T')[0];
    if (triggered[todayKey]) {
      triggered[todayKey] = triggered[todayKey].filter(id => id !== taskId);
      saveTriggeredTasks(triggered);
    }

    const task = tasks.find(t => t.id === taskId);
    if (task) {
      triggerAlarm(task);
      const newTriggered = getTriggeredTasks();
      if (!newTriggered[todayKey]) newTriggered[todayKey] = [];
      newTriggered[todayKey].push(taskId);
      saveTriggeredTasks(newTriggered);
    }
  }, 5 * 60 * 1000);

  showToast('Recordatorio pospuesto 5 minutos', 'info');
}

// ============================================
// LOCALSTORAGE - TRIGGERED/DISMISSED
// ============================================
function getTriggeredTasks() {
  try {
    return JSON.parse(localStorage.getItem('monitoring_triggered') || '{}');
  } catch {
    return {};
  }
}

function saveTriggeredTasks(data) {
  localStorage.setItem('monitoring_triggered', JSON.stringify(data));
}

function isDismissed(taskId) {
  try {
    const dismissed = JSON.parse(localStorage.getItem('monitoring_dismissed') || '{}');
    const todayKey = new Date().toISOString().split('T')[0];
    return dismissed[todayKey] && dismissed[todayKey].includes(taskId);
  } catch {
    return false;
  }
}

function markDismissed(taskId) {
  try {
    const dismissed = JSON.parse(localStorage.getItem('monitoring_dismissed') || '{}');
    const todayKey = new Date().toISOString().split('T')[0];
    if (!dismissed[todayKey]) dismissed[todayKey] = [];
    if (!dismissed[todayKey].includes(taskId)) {
      dismissed[todayKey].push(taskId);
    }
    localStorage.setItem('monitoring_dismissed', JSON.stringify(dismissed));
  } catch (err) {
    console.error('Error guardando dismiss:', err);
  }
}

// ============================================
// SONIDO
// ============================================
function ensureAudioContext() {
  if (!audioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audioContext = new AC();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return true;
}

function enableAudio() {
  if (!ensureAudioContext()) return;
  soundEnabled = true;
  document.getElementById('btn-sound').textContent = '🔊';
  document.getElementById('btn-enable-sound').style.display = 'none';
  playTestSound();
  showToast('Audio habilitado', 'success');
}

function toggleSound() {
  if (!audioContext) {
    enableAudio();
    return;
  }
  soundEnabled = !soundEnabled;
  document.getElementById('btn-sound').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) playTestSound();
}

function setVolume(val) {
  volume = val / 100;
}

function playTestSound() {
  if (!soundEnabled) return;
  if (!ensureAudioContext()) return;
  const t = audioContext.currentTime;
  playBeep(t, 880, 0.1, volume * 0.3);
  playBeep(t + 0.15, 880, 0.1, volume * 0.3);
}

function playAlarmSound() {
  if (!soundEnabled) return;
  if (!ensureAudioContext()) return;

  const t = audioContext.currentTime;

  for (let r = 0; r < 4; r++) {
    const base = t + r * 1.5;
    for (let i = 0; i < 4; i++) {
      playBeep(base + i * 0.15, 880, 0.08, volume * 0.35);
      playBeep(base + i * 0.15 + 0.07, 1100, 0.06, volume * 0.25);
    }
    playBeep(base + 0.65, 660, 0.3, volume * 0.2);
  }
}

function playBeep(time, frequency, duration, vol) {
  if (!audioContext) return;
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = frequency;
    osc.type = 'square';
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  } catch (err) {
    console.error('Error playing beep:', err);
  }
}

function stopAlarmSound() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

// ============================================
// NOTIFICACIONES DEL NAVEGADOR
// ============================================
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ============================================
// FILTROS
// ============================================
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });
  renderTasks();
}

// ============================================
// MODAL DE TAREAS
// ============================================
function openTaskModal(taskId) {
  const modal = document.getElementById('task-modal');
  const form = document.getElementById('task-form');
  form.reset();

  const currentTaskId = taskId || '';
  document.getElementById('task-id').value = currentTaskId;
  document.getElementById('task-enabled').checked = true;

  document.querySelectorAll('.day-checkbox input').forEach(cb => cb.checked = true);

  // Poblar lista de dependencias (excluye la tarea misma)
  const dependsSelect = document.getElementById('task-depends');
  dependsSelect.innerHTML = '<option value="">— Ninguna —</option>';
  tasks
    .filter(t => t.id !== currentTaskId)
    .forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${formatTime(t.task_time)} - ${t.title}`;
      dependsSelect.appendChild(opt);
    });

  // Ocultar selector de paso hasta que elijan madre
  document.getElementById('depends-step-wrap').style.display = 'none';
  document.getElementById('task-depends-step').innerHTML = '<option value="">— Al terminar la madre —</option>';

  if (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      document.getElementById('modal-title').textContent = 'Editar Tarea';
      document.getElementById('task-id').value = task.id;
      document.getElementById('task-title').value = task.title;
      document.getElementById('task-desc').value = task.description || '';
      document.getElementById('task-shift').value = task.shift;
      document.getElementById('task-time').value = task.task_time.substring(0, 5);
      document.getElementById('task-enabled').checked = task.enabled;
      document.getElementById('task-depends').value = task.depends_on || '';
      document.getElementById('task-depends-step').value = task.depends_on_step || '';

      if (task.depends_on) {
        document.getElementById('depends-step-wrap').style.display = 'block';
        populateStepSelector(task.depends_on, task.depends_on_step);
      }

      document.querySelectorAll('.day-checkbox input').forEach(cb => {
        cb.checked = task.days.includes(cb.value);
      });
    }
  } else {
    document.getElementById('modal-title').textContent = 'Nueva Tarea';
  }

  renderStepsEditor(currentTaskId);
  modal.style.display = 'flex';
}

function updateStepSelector() {
  const parentId = document.getElementById('task-depends').value;
  const wrap = document.getElementById('depends-step-wrap');
  if (parentId) {
    wrap.style.display = 'block';
    populateStepSelector(parentId, '');
  } else {
    wrap.style.display = 'none';
    document.getElementById('task-depends-step').innerHTML = '<option value="">— Al terminar la madre —</option>';
    document.getElementById('task-depends-step').value = '';
  }
}

function populateStepSelector(parentId, selectedStep) {
  const stepSelect = document.getElementById('task-depends-step');
  const parentSteps = getStepsForTask(parentId);
  stepSelect.innerHTML = '<option value="">— Al terminar la madre —</option>';
  parentSteps.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `Paso ${s.position + 1}: ${s.text}`;
    stepSelect.appendChild(opt);
  });
  stepSelect.value = selectedStep || '';
}

function renderStepsEditor(taskId) {
  const container = document.getElementById('steps-editor');
  const hint = document.getElementById('steps-empty-hint');
  const taskSteps = taskId ? getStepsForTask(taskId) : [];

  if (taskSteps.length === 0) {
    hint.style.display = 'block';
    container.textContent = '';
    return;
  }

  hint.style.display = 'none';
  container.innerHTML = taskSteps.map(s => `
    <div class="modal-step-item">
      <span class="modal-step-num">${s.position + 1}</span>
      <input type="text" class="modal-step-input" value="${escapeHtml(s.text)}" maxlength="120" data-step-id="${s.id}" onchange="renameStepFromModal('${s.id}', this.value)">
      <button type="button" class="btn-small btn-step-del" onclick="removeStepFromModal('${s.id}')">✕</button>
    </div>
  `).join('');
}

function addStepFromModal() {
  const taskId = document.getElementById('task-id').value;
  const input = document.getElementById('new-step-input');
  const text = input.value.trim();
  if (!taskId) {
    showToast('Guarda la tarea primero para agregar pasos', 'error');
    return;
  }
  if (!text) {
    showToast('Escribe el texto del paso', 'error');
    return;
  }
  createStep(taskId, text).then(() => {
    input.value = '';
    renderStepsEditor(taskId);
    updateStepSelector();
  });
}

async function renameStepFromModal(stepId, value) {
  const text = value.trim();
  if (!text) return;
  await updateStepText(stepId, text);
}

async function removeStepFromModal(stepId) {
  const taskId = document.getElementById('task-id').value;
  await deleteStep(stepId);
  renderStepsEditor(taskId);
  const parentId = document.getElementById('task-depends').value;
  if (parentId) populateStepSelector(parentId, document.getElementById('task-depends-step').value);
}

function closeTaskModal() {
  document.getElementById('task-modal').style.display = 'none';
}

function editTask(id) {
  openTaskModal(id);
}

async function saveTask(event) {
  event.preventDefault();

  const id = document.getElementById('task-id').value;
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-desc').value.trim();
  const shift = document.getElementById('task-shift').value;
  const task_time = document.getElementById('task-time');
  const enabled = document.getElementById('task-enabled').checked;
  const depends_on = document.getElementById('task-depends').value || null;
  const depends_on_step = document.getElementById('task-depends-step').value || null;

  if (depends_on_step && !depends_on) {
    showToast('Para depender de un paso debes elegir una tarea madre', 'error');
    return;
  }

  const days = [];
  document.querySelectorAll('.day-checkbox input:checked').forEach(cb => {
    days.push(cb.value);
  });

  if (days.length === 0) {
    showToast('Selecciona al menos un dia', 'error');
    return;
  }

  if (depends_on === id) {
    showToast('Una tarea no puede depender de si misma', 'error');
    return;
  }

  const taskData = { title, description, shift, task_time: task_time.value, days, enabled, depends_on, depends_on_step };

  if (id) {
    await updateTask(id, taskData);
  } else {
    await createTask(taskData);
  }

  closeTaskModal();
}

async function toggleTask(id, enabled) {
  await updateTask(id, { enabled });
}

// ============================================
// MODAL DE ELIMINAR
// ============================================
function openDeleteModal(id) {
  deleteTargetId = id;
  const task = tasks.find(t => t.id === id);
  document.getElementById('delete-task-name').textContent = task ? task.title : '';
  document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
  deleteTargetId = null;
  document.getElementById('delete-modal').style.display = 'none';
}

async function confirmDelete() {
  if (deleteTargetId) {
    await deleteTask(deleteTargetId);
    closeDeleteModal();
  }
}

// ============================================
// DIAS - ACCIONES RAPIDAS
// ============================================
function selectAllDays() {
  document.querySelectorAll('.day-checkbox input').forEach(cb => cb.checked = true);
}

function selectWeekdays() {
  const weekdays = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  document.querySelectorAll('.day-checkbox input').forEach(cb => {
    cb.checked = weekdays.includes(cb.value);
  });
}

function selectNoneDays() {
  document.querySelectorAll('.day-checkbox input').forEach(cb => cb.checked = false);
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// UTILIDADES
// ============================================
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('alarm-overlay').style.display === 'flex') {
      return;
    }
    closeTaskModal();
    closeDeleteModal();
  }
});
