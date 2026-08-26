// ============================================
// ESTADO DE LA APLICACION
// ============================================
let supabaseClient = null;
let tasks = [];
let currentFilter = 'all';
let deleteTargetId = null;
let audioContext = null;
let soundEnabled = false;
let volume = 0.7;
let currentAlarmTask = null;
let snoozeTimers = {};

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
    requestNotificationPermission();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(checkAlarms, 15000);
    setInterval(checkAlarms, 30000);
    setInterval(loadTasks, 60000);
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

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nextTask = todayTasks
    .filter(t => t.task_time.substring(0, 5) > currentTime)
    .sort((a, b) => a.task_time.localeCompare(b.task_time))[0];

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

  Object.values(groups).forEach(g => g.sort((a, b) => a.task_time.localeCompare(b.task_time)));

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

      html += `
        <div class="task-item ${disabledClass}">
          <div class="task-time">${formatTime(task.task_time)}</div>
          <div class="task-info">
            <div class="task-title">${escapeHtml(task.title)}</div>
            ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
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
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const today = getDayName(now);
  const todayKey = now.toISOString().split('T')[0];

  const triggered = getTriggeredTasks();
  const todayTriggered = triggered[todayKey] || [];

  tasks.forEach(task => {
    if (!task.enabled) return;
    if (!task.days.includes(today)) return;
    if (todayTriggered.includes(task.id)) return;

    const [h, m] = task.task_time.split(':').map(Number);
    const taskMinute = h * 60 + m;

    if (currentMinute - taskMinute >= 0 && currentMinute - taskMinute <= 2) {
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
function enableAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
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
  if (!audioContext || !soundEnabled) return;
  const t = audioContext.currentTime;
  playBeep(t, 880, 0.1, volume * 0.3);
  playBeep(t + 0.15, 880, 0.1, volume * 0.3);
}

function playAlarmSound() {
  if (!audioContext || !soundEnabled) return;

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
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
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

  document.getElementById('task-id').value = '';
  document.getElementById('task-enabled').checked = true;

  document.querySelectorAll('.day-checkbox input').forEach(cb => cb.checked = true);

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

      document.querySelectorAll('.day-checkbox input').forEach(cb => {
        cb.checked = task.days.includes(cb.value);
      });
    }
  } else {
    document.getElementById('modal-title').textContent = 'Nueva Tarea';
  }

  modal.style.display = 'flex';
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

  const days = [];
  document.querySelectorAll('.day-checkbox input:checked').forEach(cb => {
    days.push(cb.value);
  });

  if (days.length === 0) {
    showToast('Selecciona al menos un dia', 'error');
    return;
  }

  const taskData = { title, description, shift, task_time: task_time.value, days, enabled };

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
