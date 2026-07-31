const state = { dashboard: null, contacts: [], metrics: [], activeKind: "", activeSource: "", search: "", editingContactId: null, editingTaskId: null, version: null, ranks: [], captureSession: null, captureSessions: [] };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const shortDate = (value) => value ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)) : "Sin fecha";
// "en-CA" entrega YYYY-MM-DD en horario local; toISOString usaría UTC y podría adelantar un día.
const isoDate = (date = new Date()) => date.toLocaleDateString("en-CA");
const isoPlusDays = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return isoDate(date); };
const headerDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).formatToParts(date);
  const find = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${find("weekday")} · ${find("day")} ${find("month")}`.toUpperCase();
};
const compactDate = (date = new Date()) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(date).replace(".", "").toUpperCase();
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const percent = (current, target) => Math.min(100, Math.round((Number(current) / Math.max(1, Number(target))) * 100));

const profileIcons = { leadership: "♢", connection: "♡", constancy: "✓", analyst: "⌕", executor: "⚡" };
const profileMeta = {
  Liderazgo: { icon: "/assets/icon-leadership.png", hint: "Inspirar y desarrollar personas", focus: "Tu liderazgo se potencia cuando cada conversación termina con un siguiente paso claro." },
  Conexión: { icon: "/assets/icon-connection.png", hint: "Crear confianza y cercanía", focus: "Tu conexión se potencia cuando escuchas la meta de la otra persona antes de proponer." },
  Analista: { icon: "/assets/icon-analyst.png", hint: "Entender a fondo y explicar", focus: "Tu perfil analista brilla cuando respaldas cada recomendación con un dato claro." },
  Ejecutor: { icon: "/assets/icon-executor.png", hint: "Convertir ideas en acción", focus: "Tu perfil ejecutor avanza cuando conviertes cada idea en una acción con fecha." },
  Constancia: { icon: "/assets/icon-connection.png", hint: "Sostener el ritmo día a día", focus: "Tu constancia se nota cuando revisas tu plan a la misma hora todos los días." },
};
const categoryIcons = { Llamada: "☎", Contenido: "▶", Mentoría: "♢", Redes: "◎", Capacitación: "⌕", Organización: "✓" };
const typeColors = { Prospecto: "#7755c7", Cliente: "#ed5f86", Asociado: "#2878d0" };
const visualVariants = {
  // La versión femenina se recorta para quitar el recuadro con barras de ejemplo;
  // el original con ese recuadro sigue en profile-result.png.
  female: { hero: "/assets/mission-trail.png", profile: "/assets/profile-result-female.png", label: "avatar femenino" },
  male: { hero: "/assets/mission-trail-male.png", profile: "/assets/profile-result-male.png", label: "avatar masculino" },
  neutral: { hero: "/assets/mission-trail-neutral.png", profile: "/assets/profile-result-neutral.png", label: "ilustración neutral sin avatar" },
};
const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};
const viewTitles = {
  dashboard: "Bienvenida a BRÚJULA",
  contacts: "Tu red, en un solo lugar",
  agenda: "Hoy es un buen día para avanzar",
  map: "Tu meta está cada vez más cerca",
  measure: "Lo que se mide, mejora",
  profile: "Tus fortalezas marcan el rumbo",
  development: "Crecer también es parte del plan",
  guide: "Todo gran viaje empieza con una guía",
};

// El plan gratuito de Render duerme el servicio: el primer arranque puede tardar ~50 s.
const REQUEST_TIMEOUT = 70000;

async function api(path, options = {}) {
  const controller = new AbortController();
  const despertando = setTimeout(() => showWakingNotice(true), 3500);
  const limite = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("El servidor tardó demasiado en responder. Intenta de nuevo en un momento.");
    throw new Error("No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.");
  } finally {
    clearTimeout(despertando);
    clearTimeout(limite);
    showWakingNotice(false);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.ok ? "El servidor devolvió una respuesta inesperada." : `Error ${response.status} del servidor.`);
  }
  if (!response.ok) throw new Error(payload.error || `Error ${response.status} del servidor.`);
  return payload;
}

function showWakingNotice(visible) {
  const aviso = $("#wakingNotice");
  if (aviso) aviso.classList.toggle("show", visible);
}

function toast(message, tone = "info") {
  const element = $("#toast");
  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), tone === "error" ? 4200 : 2600);
}

/** Deshabilita el botón y muestra su estado de carga mientras corre la acción. */
async function withLoading(button, accion) {
  if (!button || button.disabled) return accion();
  const original = button.textContent;
  button.disabled = true;
  button.classList.add("is-loading");
  button.textContent = button.dataset.loadingText || "Guardando…";
  try {
    return await accion();
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = original;
  }
}

function setBusy(selector, busy) {
  const element = $(selector);
  if (element) element.classList.toggle("is-busy", busy);
}

/** Diálogo de confirmación con el diseño de la app, en lugar del confirm() del navegador. */
function confirmar({ title, message, confirmText = "Sí, continuar", danger = true }) {
  return new Promise((resolve) => {
    const dialog = $("#confirmDialog");
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    const aceptar = $("#confirmAccept");
    aceptar.textContent = confirmText;
    aceptar.classList.toggle("danger-button", danger);
    const cerrar = (valor) => {
      dialog.close();
      aceptar.removeEventListener("click", alAceptar);
      $("#confirmCancel").removeEventListener("click", alCancelar);
      dialog.removeEventListener("cancel", alCancelar);
      resolve(valor);
    };
    const alAceptar = () => cerrar(true);
    const alCancelar = () => cerrar(false);
    aceptar.addEventListener("click", alAceptar);
    $("#confirmCancel").addEventListener("click", alCancelar);
    dialog.addEventListener("cancel", alCancelar);
    dialog.showModal();
  });
}

/** Muestra un mensaje de error debajo del campo correspondiente. */
function marcarError(form, campo, mensaje) {
  const input = form.elements[campo];
  if (!input) return false;
  const contenedor = input.closest("label") || input.parentElement;
  limpiarErrores(form);
  contenedor.classList.add("has-error");
  const aviso = document.createElement("small");
  aviso.className = "field-error";
  aviso.textContent = mensaje;
  contenedor.appendChild(aviso);
  input.focus();
  return true;
}

function limpiarErrores(form) {
  $$(".has-error", form).forEach((element) => element.classList.remove("has-error"));
  $$(".field-error", form).forEach((element) => element.remove());
}

function goToView(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  $("#viewTitle").textContent = viewTitles[viewName];
  $(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", `#${viewName}`);
  if (viewName === "contacts") loadContacts();
  if (viewName === "measure") loadMetrics();
}

function selectedVisual(gender) {
  return visualVariants[gender] || visualVariants.neutral;
}

function updateProfilePreview(gender) {
  const visual = selectedVisual(gender);
  $("#profileEditPreview").src = visual.profile;
  $("#profileEditPreview").alt = `Vista previa de la brújula con ${visual.label}`;
}

function applyVisualVariant(gender) {
  const visual = selectedVisual(gender);
  document.body.dataset.gender = gender || "neutral";
  $("#dashboardHero").style.backgroundImage = `url("${visual.hero}")`;
  $("#journeyImage").src = visual.hero;
  $("#journeyImage").alt = `Valle ilustrado con camino de metas y ${visual.label}`;
  $("#profileResultImage").src = visual.profile;
  $("#profileResultImage").alt = `Resultado visual de los cinco perfiles con ${visual.label}`;
  updateProfilePreview(gender);
}

function fillProfileForm(user) {
  const form = $("#profileForm");
  ["name", "email", "phone", "city", "purpose", "target_income", "goal_date", "rank"].forEach((key) => {
    if (form.elements[key]) form.elements[key].value = user[key] ?? "";
  });
  const gender = visualVariants[user.gender] ? user.gender : "neutral";
  const genderInput = form.querySelector(`[name="gender"][value="${gender}"]`);
  if (genderInput) genderInput.checked = true;
  $("#profilePreviewName").textContent = user.name;
  $("#profileDominantReadout").textContent = `${user.dominant_profile} · Nivel ${user.level}`;
  updateProfilePreview(gender);
}

function openProfileDialog() {
  if (!state.dashboard?.user) return toast("Espera un momento mientras cargamos tu perfil.");
  fillProfileForm(state.dashboard.user);
  $("#profileDialog").showModal();
}

function renderProfileBars(target, profiles, large = false) {
  const max = Math.max(...profiles.map((profile) => profile.score), 40);
  $(target).innerHTML = profiles.map((profile) => `
    <div class="profile-row">
      <label style="color:${profile.color}">${escapeHtml(profile.label)}</label>
      <span class="bar-track"><i style="width:${Math.round((profile.score / max) * 100)}%;background:${profile.color}"></i></span>
      <b>${profile.score}</b>
    </div>`).join("");
}

function taskTemplate(task, timeline = false) {
  if (timeline) {
    return `<div class="timeline-item ${task.completed ? "done" : ""}" data-task-id="${task.id}">
      <time class="timeline-time">${escapeHtml(task.due_time || "Hoy")}</time>
      <span class="timeline-dot"></span>
      <div class="timeline-copy"><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.detail)}</p><span>${escapeHtml(task.profile_tag)} · +${task.points} XP</span></div>
      <div class="timeline-actions">
        <button class="row-action" data-edit-task="${task.id}" title="Editar misión" aria-label="Editar ${escapeHtml(task.title)}">✎</button>
        <button class="row-action danger" data-delete-task="${task.id}" title="Eliminar misión" aria-label="Eliminar ${escapeHtml(task.title)}">🗑</button>
        <input class="mission-check" type="checkbox" aria-label="Completar ${escapeHtml(task.title)}" ${task.completed ? "checked" : ""}>
      </div>
    </div>`;
  }
  return `<div class="mission-item ${task.completed ? "completed" : ""}" data-task-id="${task.id}">
    <span class="mission-icon">${categoryIcons[task.category] || "✦"}</span>
    <div class="mission-body"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.due_time || "Hoy")} · ${escapeHtml(task.profile_tag)}</span></div>
    <span class="mission-points">+${task.points} XP</span>
    <input class="mission-check" type="checkbox" aria-label="Completar ${escapeHtml(task.title)}" ${task.completed ? "checked" : ""}>
  </div>`;
}

function renderTasks(tasks) {
  const completed = tasks.filter((task) => task.completed).length;
  $("#dashboardTasks").innerHTML = tasks.length
    ? tasks.slice(0, 4).map((task) => taskTemplate(task)).join("")
    : `<p class="empty-state">Aún no hay misiones para hoy. Crea una desde la agenda.</p>`;
  $("#agendaTasks").innerHTML = tasks.length
    ? tasks.map((task) => taskTemplate(task, true)).join("")
    : `<p class="empty-state">Tu día está libre. Agrega tu primera misión con el botón “Nueva misión”.</p>`;
  $("#taskRing").textContent = `${completed}/${tasks.length}`;
  $("#agendaProgress").textContent = `${completed} de ${tasks.length} listas`;
  $("#agendaPoints").textContent = `${tasks.filter((task) => !task.completed).reduce((sum, task) => sum + task.points, 0)} XP`;
  $$(".mission-check").forEach((checkbox) => checkbox.addEventListener("change", toggleTask));
  $$("[data-edit-task]").forEach((button) => button.addEventListener("click", () => openTaskDialog(Number(button.dataset.editTask))));
  $$("[data-delete-task]").forEach((button) => button.addEventListener("click", () => deleteTask(Number(button.dataset.deleteTask))));
}

function celebrate(unlocked = []) {
  unlocked.forEach((achievement, index) => {
    setTimeout(() => toast(`${achievement.icon} ¡Logro desbloqueado: ${achievement.title}!`), index * 900);
  });
}

function renderAchievements(achievements = []) {
  const unlocked = achievements.filter((item) => item.unlocked_at);
  $("#achievementCount").textContent = `${unlocked.length} de ${achievements.length}`;
  $("#achievementStrip").innerHTML = achievements.map((item) => `
    <article class="achievement-card ${item.unlocked_at ? "unlocked" : "locked"}">
      <span class="achievement-icon">${item.unlocked_at ? item.icon : "🔒"}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></div>
      <small>${item.unlocked_at ? shortDate(item.unlocked_at) : "Pendiente"}</small>
    </article>`).join("");
}

const vp = (value) => `${Number(value || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

function renderCompensation(plan) {
  if (!plan) return;
  const alertas = plan.alerts || [];
  $("#alertsHeading").hidden = alertas.length === 0;
  $("#compensationAlerts").innerHTML = alertas.map((alerta) => `
    <article class="alert-card alert-${alerta.tone}">
      <span class="alert-icon">${{ urgent: "⏰", warning: "⚠", success: "✓", info: "◎" }[alerta.tone] || "◎"}</span>
      <div><strong>${escapeHtml(alerta.title)}</strong><p>${escapeHtml(alerta.message)}</p></div>
    </article>`).join("");

  const rango = plan.rank;
  $("#rankLabel").textContent = rango.label;
  $("#rankVvp").textContent = vp(plan.month_vvp);
  $("#rankOrders").textContent = plan.month_orders;
  $("#rankClientBonus").textContent = `${plan.client_bonus.percent}%`;
  $("#rankBdn").textContent = `${plan.bdn.percent}%`;

  if (rango.maintenance) {
    $("#rankMaintenanceText").textContent = rango.maintenance_met ? "Mantenimiento cubierto" : "Faltan para el mantenimiento";
    $("#rankMaintenanceValue").textContent = `${vp(plan.month_vvp)} / ${vp(rango.maintenance)} VVP`;
    $("#rankMaintenanceBar").style.width = `${rango.progress}%`;
    $("#rankMaintenanceBar").style.background = rango.maintenance_met ? "var(--green)" : "var(--pink)";
  } else {
    $("#rankMaintenanceText").textContent = "Este rango no exige mantenimiento mensual";
    $("#rankMaintenanceValue").textContent = `${vp(plan.month_vvp)} VVP este mes`;
    $("#rankMaintenanceBar").style.width = "100%";
    $("#rankMaintenanceBar").style.background = "var(--purple)";
  }
  $("#rankDaysLeft").textContent = plan.days_left === 0
    ? "Hoy es el último día del mes de comisión."
    : `Quedan ${plan.days_left} día${plan.days_left === 1 ? "" : "s"} del mes de comisión.`;

  const siguiente = plan.next_rank;
  $("#rankNext").innerHTML = siguiente ? `
    <div class="rank-next-head"><span class="mini-kicker">SIGUIENTE RANGO</span><strong>${escapeHtml(siguiente.label)}</strong>
      ${siguiente.promotion_bonus ? `<em>Bono por ascenso ${money.format(siguiente.promotion_bonus)}</em>` : ""}</div>
    <p>${escapeHtml(siguiente.requirement)}</p>
    ${siguiente.tracked_by_app
      ? `<div class="bar-track"><i style="width:${siguiente.vvp_progress}%;background:var(--purple)"></i></div><small>${vp(plan.month_vvp)} de ${vp(siguiente.requirement_vvp)} VVP acumulados este mes.</small>`
      : `<small class="rank-manual-note">Este requisito depende del volumen de tu organización, así que se consulta en tu back office; BRÚJULA da seguimiento a tu VVP y a tu mantenimiento.</small>`}` : `
    <div class="rank-next-head"><span class="mini-kicker">RANGO MÁXIMO</span><strong>Platino alcanzado</strong></div>
    <p>Ahora el crecimiento viene de promover Platinos en tu línea descendente.</p>`;

  $("#rankLadder").innerHTML = (state.ranks || []).map((item, index) => {
    const actual = item.key === rango.key;
    const superado = index < (state.ranks || []).findIndex((r) => r.key === rango.key);
    return `<div class="rank-step ${actual ? "current" : ""} ${superado ? "done" : ""}">
      <b>${escapeHtml(item.label)}</b>
      <small>${item.maintenance ? `${vp(item.maintenance)} VVP/mes` : "Sin mantenimiento"}</small>
      ${item.promotion_bonus ? `<em>${money.format(item.promotion_bonus)}</em>` : "<em>—</em>"}
    </div>`;
  }).join("");

  $("#incomeDisclaimer").textContent = plan.disclaimer;
}

function renderWeek(week = []) {
  const done = week.filter((day) => day.done).length;
  $("#weeklyStreak").textContent = `${done}/7`;
  $("#weekDots").innerHTML = week.map((day) => {
    const classes = [day.done ? "done" : "", day.future ? "future" : "", day.date === isoDate() ? "current" : ""].filter(Boolean).join(" ");
    return `<i class="${classes}" title="${day.date}">${day.label}</i>`;
  }).join("");
}

async function toggleTask(event) {
  const wrapper = event.target.closest("[data-task-id]");
  const taskId = wrapper.dataset.taskId;
  const completed = event.target.checked;
  try {
    const result = await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ completed }) });
    toast(completed ? `¡Misión completada! Nivel ${result.level}` : "Misión reabierta");
    celebrate(result.new_achievements);
    await loadDashboard();
  } catch (error) {
    event.target.checked = !completed;
    toast(error.message);
  }
}

async function deleteTask(taskId) {
  const task = (state.dashboard?.tasks || []).find((item) => item.id === taskId);
  const aceptado = await confirmar({
    title: "Eliminar misión",
    message: `Se eliminará “${task ? task.title : "esta misión"}” de tu agenda. Esta acción no se puede deshacer.`,
    confirmText: "Sí, eliminar",
  });
  if (!aceptado) return;
  setBusy("#agendaTasks", true);
  try {
    const result = await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    toast(result.message, "success");
    await loadDashboard();
  } catch (error) { toast(error.message, "error"); }
  finally { setBusy("#agendaTasks", false); }
}

function openTaskDialog(taskId = null) {
  const form = $("#taskForm");
  form.reset();
  state.editingTaskId = taskId;
  const task = taskId ? (state.dashboard?.tasks || []).find((item) => item.id === taskId) : null;
  $("#taskModalKicker").textContent = task ? "EDITAR MISIÓN" : "NUEVA MISIÓN";
  $("#taskModalTitle").textContent = task ? "Ajustar esta misión" : "Agregar una misión";
  $("#taskSubmitButton").textContent = task ? "Guardar cambios" : "Guardar misión";
  if (task) {
    ["title", "detail", "category", "profile_tag", "due_date", "due_time", "points"].forEach((key) => {
      if (form.elements[key]) form.elements[key].value = task[key] ?? "";
    });
  } else {
    form.elements.due_date.value = isoDate();
    form.elements.points.value = 20;
  }
  $("#taskDialog").showModal();
}

async function submitTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  limpiarErrores(form);
  if (!data.title.trim()) return marcarError(form, "title", "Describe qué vas a hacer en esta misión.");
  const puntos = Number(data.points);
  if (!Number.isFinite(puntos) || puntos < 0 || puntos > 500) return marcarError(form, "points", "Los puntos deben ser un número entre 0 y 500.");
  data.points = puntos;
  const editing = state.editingTaskId;
  await withLoading($("#taskSubmitButton"), async () => {
    try {
      if (editing) {
        await api(`/api/tasks/${editing}`, { method: "PATCH", body: JSON.stringify(data) });
        toast("Misión actualizada", "success");
      } else {
        await api("/api/tasks", { method: "POST", body: JSON.stringify(data) });
        toast("Nueva misión en tu agenda", "success");
      }
      $("#taskDialog").close();
      limpiarErrores(form);
      state.editingTaskId = null;
      await loadDashboard();
    } catch (error) { toast(error.message, "error"); }
  });
}

function personCard(contact) {
  return `<article class="person-card" style="--person-color:${typeColors[contact.kind]}">
    <div class="person-top"><span class="person-avatar">${initials(contact.name)}</span><div><strong>${escapeHtml(contact.name)}</strong><span>${escapeHtml(contact.kind)} · ${escapeHtml(contact.stage)}</span></div></div>
    <p>${escapeHtml(contact.next_action || "Definir siguiente paso")}</p>
    <time>${shortDate(contact.next_action_date)}</time>
  </article>`;
}

function renderGoals(goals) {
  $("#goalGrid").innerHTML = goals.map((goal) => {
    const progress = percent(goal.current, goal.target);
    const current = goal.unit === "MXN" ? money.format(goal.current) : Number(goal.current).toLocaleString("es-MX");
    const target = goal.unit === "MXN" ? money.format(goal.target) : Number(goal.target).toLocaleString("es-MX");
    return `<article class="panel goal-card" style="--goal-color:${goal.color}">
      <div class="goal-top"><span></span><small>${progress}%</small></div><h3>${escapeHtml(goal.title)}</h3>
      <div class="goal-numbers"><strong>${current}</strong><span>de ${target} ${goal.unit === "MXN" ? "" : escapeHtml(goal.unit)}</span></div>
      <div class="bar-track"><i style="width:${progress}%;background:${goal.color}"></i></div>
    </article>`;
  }).join("");
  const average = goals.reduce((sum, goal) => sum + percent(goal.current, goal.target), 0) / Math.max(1, goals.length);
  $("#mapTotal").textContent = `${Math.round(average)}%`;
}

function renderDevelopment(items) {
  const colors = { Analista: ["#2878d0", "#eaf5ff"], Conexión: ["#7755c7", "#f2edff"], Liderazgo: ["#ed5f86", "#fff0f4"], Constancia: ["#55a85b", "#edf8ee"] };
  $("#developmentGrid").innerHTML = items.map((item) => {
    const [color, soft] = colors[item.profile_tag] || ["#7755c7", "#f2edff"];
    return `<article class="panel learning-card" style="--card-color:${color};--card-soft:${soft}">
      <span>${profileIcons[Object.keys(profileIcons).find((key) => item.profile_tag.toLowerCase().startsWith(key.slice(0, 5))) || "analyst"]}</span>
      <small>${escapeHtml(item.kind)} · ${escapeHtml(item.profile_tag)}</small><h3>${escapeHtml(item.title)}</h3>
      <div class="goal-numbers"><strong>${item.progress}%</strong><span>+${item.points} XP</span></div>
      <div class="bar-track"><i style="width:${item.progress}%;background:${color}"></i></div>
    </article>`;
  }).join("");
}

function updateXpSimulator(value) {
  const xp = Math.max(0, Number(value) || 0);
  const level = Math.floor(xp / 250) + 1;
  const withinLevel = xp % 250;
  const remaining = 250 - withinLevel;
  $("#simulatedLevel").textContent = level;
  $("#simulatedXp").textContent = `${xp.toLocaleString("es-MX")} XP`;
  $("#simulatedRemaining").textContent = `${remaining} XP para el nivel ${level + 1}`;
  $("#simulatorBar").style.width = `${(withinLevel / 250) * 100}%`;
  $("#simulatorStart").textContent = `Nivel ${level}`;
  $("#simulatorEnd").textContent = `Nivel ${level + 1}`;
}

function renderGuideAchievements(achievements = []) {
  const desbloqueados = achievements.filter((item) => item.unlocked_at).length;
  $("#guideAchievementTotal").textContent = achievements.length;
  $("#guideAchievementProgress").textContent = `${desbloqueados} de ${achievements.length}`;
  $("#guideAchievementList").innerHTML = achievements.map((item) => `
    <div class="guide-achievement ${item.unlocked_at ? "unlocked" : ""}">
      <span>${item.unlocked_at ? item.icon : "🔒"}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></div>
      <em>${item.unlocked_at ? "Conseguido" : "Pendiente"}</em>
    </div>`).join("");
}

function updateGuideWithUser(user) {
  $("#guideHeroLevel").textContent = user.level;
  $("#guideHeroStreak").textContent = user.streak;
  $("#guideStreakNumber").textContent = user.streak;
  const simulator = $("#xpSimulator");
  simulator.max = Math.max(5000, Math.ceil((user.xp + 1000) / 250) * 250);
  simulator.value = user.xp;
  updateXpSimulator(user.xp);
}

const guideStorageKey = "brujula-guide-checklist-v1";

function readGuideProgress() {
  try { return JSON.parse(localStorage.getItem(guideStorageKey) || "[]"); }
  catch { return []; }
}

function updateGuideChecklist() {
  const checked = $$("#guideChecklist input:checked").map((input) => input.dataset.guideTask);
  try { localStorage.setItem(guideStorageKey, JSON.stringify(checked)); } catch { /* Preferencia local opcional. */ }
  const total = $$("#guideChecklist input").length;
  const progress = Math.round((checked.length / Math.max(1, total)) * 100);
  $("#guideChecklistPercent").textContent = `${progress}%`;
  $("#guideChecklistBar").style.width = `${progress}%`;
  $("#weekCelebration").classList.toggle("unlocked", checked.length === total);
  if (checked.length === total) toast("¡Primera expedición completada! 🏆");
}

function restoreGuideChecklist() {
  const completed = new Set(readGuideProgress());
  $$("#guideChecklist input").forEach((input) => { input.checked = completed.has(input.dataset.guideTask); });
  updateGuideChecklist();
}

const tourSteps = [
  { view: "dashboard", kicker: "PUNTO DE PARTIDA", title: "Mi tablero", icon: "⌂", mini: ["✦", "🔥"], color: "#7755c7", soft: "#f2edff", text: "Tu resumen diario reúne nivel, racha, metas, personas que necesitan atención, las misiones prioritarias y tus logros.", bullets: ["Revisa tu progreso de nivel", "Empieza por las misiones del día", "Al final verás las insignias que ya ganaste"] },
  { view: "contacts", kicker: "CENTRO DE DESARROLLO", title: "Mi red", icon: "♙", mini: ["♡", "→"], color: "#ed5f86", soft: "#fff0f4", text: "Aquí acompañas a prospectos, clientes y asociados. Cada registro conserva contexto y un próximo paso.", bullets: ["Agregar una persona da 25 XP", "Filtra por tipo o busca por notas", "Avanza la etapa, edita o elimina desde la fila"] },
  { view: "contacts", kicker: "REGISTRO EN GRUPO", title: "Captura por QR", icon: "▦", mini: ["📱", "🔒"], color: "#55a85b", soft: "#edf8ee", text: "En tus pláticas proyecta un código y deja que cada persona registre sus datos desde su celular, todas al mismo tiempo.", bullets: ["Se crea desde “Captura por QR”", "Escriben lo que quieren mejorar de su salud", "Entran solos a tu red con etiqueta ▦"] },
  { view: "agenda", kicker: "ACCIÓN DIARIA", title: "Agenda de hoy", icon: "✓", mini: ["☎", "▶"], color: "#2878d0", soft: "#eaf5ff", text: "Las misiones transforman tu estrategia en acciones concretas. Puedes usar las sugeridas o crear las tuyas.", bullets: ["Crea misiones con “＋ Nueva misión”", "Marca la casilla al terminar", "Tú decides cuántos XP vale cada una"] },
  { view: "map", kicker: "PLANEACIÓN", title: "Mi mapa", icon: "⌁", mini: ["◎", "🏆"], color: "#f49a2f", soft: "#fff5e8", text: "El mapa convierte metas grandes en un sendero visible y muestra el porcentaje de avance de cada objetivo.", bullets: ["Compara avance contra meta", "Detecta el tramo que necesita atención", "Celebra cada estación alcanzada"] },
  { view: "measure", kicker: "RESULTADOS", title: "Medir avances", icon: "↗", mini: ["#", "$"], color: "#55a85b", soft: "#edf8ee", text: "Registra prospectos, presentaciones, clientes, asociados, ventas y productos para aprender de tus resultados.", bullets: ["Guardar el día da 15 XP", "La gráfica muestra los últimos cinco días", "Registrar a diario mejora tus decisiones"] },
  { view: "profile", kicker: "CONOCIMIENTO PERSONAL", title: "Mi brújula", icon: "✣", mini: ["⌕", "♡"], color: "#ef5f86", soft: "#fff0f4", text: "Tu propósito y los cinco perfiles explican cómo trabajas mejor y qué estrategia aprovecha tus fortalezas.", bullets: ["El test rápido tiene diez preguntas", "Completarlo da 75 XP", "Ningún perfil es mejor que otro"] },
  { view: "development", kicker: "CRECIMIENTO", title: "Desarrollo", icon: "♢", mini: ["🎧", "🌱"], color: "#d08b1d", soft: "#fff7dd", text: "Las rutas de desarrollo convierten conocimientos, hábitos y mentoría en capacidades sostenibles.", bullets: ["Elige una fortaleza para profundizar", "Trabaja un área de oportunidad", "Revisa el porcentaje de cada ruta"] },
];
let tourIndex = 0;

function renderTourStep() {
  const step = tourSteps[tourIndex];
  $("#tourProgressBar").style.width = `${((tourIndex + 1) / tourSteps.length) * 100}%`;
  $("#tourCounter").textContent = `${tourIndex + 1} de ${tourSteps.length}`;
  $("#tourPrevious").disabled = tourIndex === 0;
  $("#tourNext").textContent = tourIndex === tourSteps.length - 1 ? "Terminar ✓" : "Siguiente →";
  $("#tourScene").innerHTML = `<div class="tour-illustration" style="--tour-color:${step.color};--tour-soft:${step.soft}"><span class="tour-main-icon">${step.icon}</span><span class="tour-mini-icons"><i>${step.mini[0]}</i><i>${step.mini[1]}</i></span></div><div class="tour-copy" style="--tour-color:${step.color};--tour-soft:${step.soft}"><span class="mini-kicker">${step.kicker}</span><h2>${step.title}</h2><p>${step.text}</p><div class="tour-bullets">${step.bullets.map((bullet) => `<span>${bullet}</span>`).join("")}</div><button class="tour-open-section" type="button">Abrir esta sección →</button></div>`;
  $(".tour-open-section").addEventListener("click", () => { $("#tourDialog").close(); goToView(step.view); });
}

function openTour() {
  tourIndex = 0;
  renderTourStep();
  $("#tourDialog").showModal();
}

function moveTour(direction) {
  if (direction > 0 && tourIndex === tourSteps.length - 1) {
    $("#tourDialog").close();
    toast("¡Recorrido terminado! La guía siempre estará aquí para ti.");
    return;
  }
  tourIndex = Math.max(0, Math.min(tourSteps.length - 1, tourIndex + direction));
  renderTourStep();
}

async function loadDashboard() {
  try {
    const data = await api("/api/dashboard");
    state.dashboard = data;
    const { user, contact_counts: counts, profile_scores: profiles, goals } = data;
    const firstName = user.name.trim().split(/\s+/)[0] || "Exploradora";
    viewTitles.dashboard = `¡${greeting()}, ${firstName}!`;
    if ($("#view-dashboard").classList.contains("active")) $("#viewTitle").textContent = viewTitles.dashboard;
    $(".avatar").textContent = initials(user.name);
    $("#sideUserName").textContent = user.name;
    $("#sideUserLevel").textContent = `Nivel ${user.level} · ${user.dominant_profile}`;
    $("#sideStreak").textContent = `${user.streak} días`;
    $("#headerXp").textContent = `${user.xp.toLocaleString("es-MX")} XP`;
    $("#heroPurpose").textContent = user.purpose;
    $("#heroLevel").textContent = `Nivel ${user.level}`;
    $("#heroLevelText").textContent = `${user.level_progress} / 250 XP`;
    $("#heroLevelBar").style.width = `${percent(user.level_progress, 250)}%`;
    $("#heroStreak").textContent = user.streak;
    $("#sideStreak").textContent = `${user.streak} ${user.streak === 1 ? "día" : "días"}`;
    $("#dominantProfile").textContent = user.dominant_profile;
    const meta = profileMeta[user.dominant_profile];
    if (meta) {
      $("#dominantProfileIcon").src = meta.icon;
      $("#dominantProfileIcon").alt = `Icono del perfil ${user.dominant_profile}`;
      $("#dominantProfileHint").textContent = meta.hint;
      $("#profileTip").textContent = meta.focus;
      $("#focusCardText").textContent = meta.focus;
    }
    $("#purposeText").textContent = user.purpose ? `“${user.purpose}”` : "Escribe tu propósito para orientar tu rumbo.";
    applyVisualVariant(user.gender);
    $("#statProspects").textContent = counts.Prospecto || 0;
    $("#statClients").textContent = counts.Cliente || 0;
    $("#statAssociates").textContent = counts.Asociado || 0;
    const trends = data.trends || {};
    $("#trendProspects").textContent = `+${trends.week_prospects || 0}`;
    $("#trendClients").textContent = `+${trends.month_clients || 0}`;
    $("#trendAssociates").textContent = `+${trends.month_associates || 0}`;
    $("#navContactCount").textContent = Object.values(counts).reduce((sum, count) => sum + count, 0);
    $("#statSales").textContent = money.format(data.sales_month);
    const salesGoal = goals.find((goal) => goal.unit === "MXN");
    $("#salesPercent").textContent = `${percent(data.sales_month, salesGoal?.target || 35000)}%`;
    renderProfileBars("#dashboardProfileBars", profiles);
    renderProfileBars("#largeProfileBars", profiles, true);
    renderTasks(data.tasks);
    renderGoals(goals);
    renderDevelopment(data.development);
    renderAchievements(data.achievements);
    renderGuideAchievements(data.achievements);
    renderWeek(data.week_activity);
    renderCompensation(data.compensation);
    updateGuideWithUser(user);
    $("#attentionContacts").innerHTML = data.recent_contacts.map(personCard).join("");
    renderContactSummary(counts);
    celebrate(data.new_achievements);
  } catch (error) {
    toast(`No pude cargar el tablero: ${error.message}`, "error");
  }
}

async function submitProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  limpiarErrores(form);
  if (!data.name.trim()) return marcarError(form, "name", "Escribe tu nombre para guardar el perfil.");
  if (data.email && !emailValido(data.email.trim())) return marcarError(form, "email", "Revisa el correo: debe verse como nombre@correo.com");
  const meta = Number(data.target_income || 0);
  if (!Number.isFinite(meta) || meta < 0) return marcarError(form, "target_income", "La meta mensual debe ser un número positivo.");
  data.target_income = meta;
  await withLoading($('#profileForm button[type="submit"]'), async () => {
    try {
      const result = await api("/api/profile", { method: "PATCH", body: JSON.stringify(data) });
      $("#profileDialog").close();
      limpiarErrores(form);
      toast(result.message, "success");
      await loadDashboard();
    } catch (error) { toast(error.message, "error"); }
  });
}

function renderContactSummary(counts) {
  const items = [
    ["Prospecto", "♙", counts.Prospecto || 0],
    ["Cliente", "♡", counts.Cliente || 0],
    ["Asociado", "♢", counts.Asociado || 0],
  ];
  $("#contactSummary").innerHTML = items.map(([kind, icon, count]) => `<article class="summary-card"><span style="background:${typeColors[kind]}15;color:${typeColors[kind]}">${icon}</span><div><strong>${count}</strong><small>${kind.toUpperCase()}${count === 1 ? "" : "S"}</small></div></article>`).join("");
}

function contactRow(contact) {
  return `<tr>
    <td><div class="contact-name"><span class="person-avatar" style="color:${typeColors[contact.kind]};background:${typeColors[contact.kind]}16">${initials(contact.name)}</span><div><strong>${escapeHtml(contact.name)}${contact.capture_session_id ? '<i class="qr-tag" title="Se registró desde el QR">▦</i>' : ""}</strong><span>${escapeHtml(contact.source)}</span></div></div></td>
    <td><span class="type-pill type-${contact.kind}">${escapeHtml(contact.kind)}</span></td>
    <td><span class="interest-pill interest-${contact.interest}">${escapeHtml(contact.interest)}</span></td>
    <td><span class="stage-pill">${escapeHtml(contact.stage)}</span></td>
    <td>${escapeHtml(contact.next_action || "Definir siguiente paso")}</td>
    <td>${shortDate(contact.next_action_date)}</td>
    <td class="row-actions">
      <button class="row-action" data-advance-contact="${contact.id}" title="Avanzar etapa" aria-label="Avanzar etapa de ${escapeHtml(contact.name)}">→</button>
      <button class="row-action" data-edit-contact="${contact.id}" title="Editar" aria-label="Editar ${escapeHtml(contact.name)}">✎</button>
      <button class="row-action danger" data-delete-contact="${contact.id}" title="Eliminar" aria-label="Eliminar ${escapeHtml(contact.name)}">🗑</button>
    </td>
  </tr>`;
}

function mobileContactCard(contact) {
  return `<article class="mobile-contact-card"><div class="person-top"><span class="person-avatar" style="color:${typeColors[contact.kind]};background:${typeColors[contact.kind]}16">${initials(contact.name)}</span><div><strong>${escapeHtml(contact.name)}</strong><span>${escapeHtml(contact.source)}</span></div></div><div class="mobile-contact-meta"><span class="type-pill type-${contact.kind}">${contact.kind}</span><span class="interest-pill interest-${contact.interest}">${contact.interest}</span><span class="stage-pill">${escapeHtml(contact.stage)}</span></div><p><strong>Siguiente:</strong> ${escapeHtml(contact.next_action || "Definir siguiente paso")} · ${shortDate(contact.next_action_date)}</p><div class="mobile-contact-actions"><button class="row-action" data-advance-contact="${contact.id}" title="Avanzar etapa">→</button><button class="row-action" data-edit-contact="${contact.id}" title="Editar">✎</button><button class="row-action danger" data-delete-contact="${contact.id}" title="Eliminar">🗑</button></div></article>`;
}

async function loadSourceFilter() {
  try {
    const fuentes = await api("/api/contact-sources");
    const select = $("#sourceFilter");
    const total = fuentes.reduce((suma, item) => suma + item.count, 0);
    select.innerHTML = `<option value="">Todas las fuentes (${total})</option>` +
      fuentes.map((item) => `<option value="${escapeHtml(item.source)}">${escapeHtml(item.source)} (${item.count})</option>`).join("");
    select.value = state.activeSource;
    // Si la fuente elegida se quedó sin contactos, volver a "todas".
    if (select.value !== state.activeSource) { state.activeSource = ""; select.value = ""; }
  } catch { /* El filtro es una ayuda, no debe romper la vista. */ }
}

async function loadContacts() {
  const params = new URLSearchParams();
  if (state.activeKind) params.set("kind", state.activeKind);
  if (state.activeSource) params.set("source", state.activeSource);
  if (state.search) params.set("q", state.search);
  setBusy("#contactRows", true);
  try {
    state.contacts = await api(`/api/contacts?${params}`);
    await loadSourceFilter();
    const vacio = state.activeSource
      ? `No hay personas de la fuente “${escapeHtml(state.activeSource)}” con esos filtros.`
      : "No encontramos personas con esos filtros.";
    $("#contactRows").innerHTML = state.contacts.length ? state.contacts.map(contactRow).join("") : `<tr><td colspan="7">${vacio}</td></tr>`;
    $("#mobileContactList").innerHTML = state.contacts.length ? state.contacts.map(mobileContactCard).join("") : `<p class="empty-state">No encontramos personas con esos filtros.</p>`;
    $$('[data-advance-contact]').forEach((button) => button.addEventListener("click", advanceContact));
    $$('[data-edit-contact]').forEach((button) => button.addEventListener("click", () => openContactDialog(Number(button.dataset.editContact))));
    $$('[data-delete-contact]').forEach((button) => button.addEventListener("click", () => deleteContact(Number(button.dataset.deleteContact))));
  } catch (error) {
    toast(error.message, "error");
    $("#contactRows").innerHTML = `<tr><td colspan="7">No pudimos cargar tu red. <button class="text-button" data-retry-contacts>Reintentar</button></td></tr>`;
    $$("[data-retry-contacts]").forEach((button) => button.addEventListener("click", loadContacts));
  } finally { setBusy("#contactRows", false); }
}

async function advanceContact(event) {
  const id = event.currentTarget.dataset.advanceContact;
  const contact = state.contacts.find((item) => item.id === Number(id));
  const stages = ["Nuevo", "Contactado", "Presentación", "Seguimiento", "Cierre", "Recompra", "Testimonio", "Capacitación", "Activación"];
  const nextStage = stages[Math.min(stages.length - 1, Math.max(0, stages.indexOf(contact.stage)) + 1)];
  try {
    await api(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ stage: nextStage, last_contact: isoDate() }) });
    toast(`${contact.name} avanzó a ${nextStage}`);
    await Promise.all([loadDashboard(), loadContacts()]);
  } catch (error) { toast(error.message); }
}

async function deleteContact(contactId) {
  const contact = state.contacts.find((item) => item.id === contactId);
  const aceptado = await confirmar({
    title: "Eliminar de mi red",
    message: `Se eliminará a ${contact ? contact.name : "esta persona"} junto con su historial y sus próximos pasos. Esta acción no se puede deshacer.`,
    confirmText: "Sí, eliminar",
  });
  if (!aceptado) return;
  setBusy("#contactRows", true);
  try {
    const result = await api(`/api/contacts/${contactId}`, { method: "DELETE" });
    toast(result.message, "success");
    await Promise.all([loadDashboard(), loadContacts()]);
  } catch (error) { toast(error.message, "error"); }
  finally { setBusy("#contactRows", false); }
}

// --- Captura por QR ---------------------------------------------------------

function renderCaptureSession(sesion) {
  state.captureSession = sesion;
  const activa = $("#captureActive");
  if (!sesion) { activa.hidden = true; return; }
  activa.hidden = false;
  $("#captureTitle").textContent = sesion.title;
  $("#captureUrl").value = sesion.url || `${location.origin}/captura/${sesion.token}`;
  $("#captureCount").textContent = sesion.registros ?? 0;
  $("#captureQr").innerHTML = `<img src="/api/capture-sessions/${sesion.id}/qr.svg?v=${Date.now()}" alt="Código QR para registrarse en ${escapeHtml(sesion.title)}">`;
  $("#captureToggle").textContent = sesion.active ? "Cerrar registro" : "Reabrir registro";
  activa.classList.toggle("is-closed", !sesion.active);
}

function renderCaptureHistory(sesiones) {
  const otras = sesiones.filter((s) => s.id !== state.captureSession?.id);
  $("#captureHistory").innerHTML = otras.length ? `
    <span class="mini-kicker">OTRAS SESIONES</span>
    <div class="capture-history-list">${otras.map((s) => `
      <div class="capture-history-item ${s.active ? "open" : ""}">
        <div><strong>${escapeHtml(s.title)}</strong><small>${s.registros} registro${s.registros === 1 ? "" : "s"} · ${s.active ? "abierta" : "cerrada"}</small></div>
        <div class="capture-history-actions">
          <button class="row-action" data-show-session="${s.id}" title="Ver su QR">▦</button>
          <button class="row-action danger" data-delete-session="${s.id}" title="Eliminar">🗑</button>
        </div>
      </div>`).join("")}</div>` : "";
  $$("[data-show-session]").forEach((b) => b.addEventListener("click", async () => {
    renderCaptureSession(state.captureSessions.find((s) => s.id === Number(b.dataset.showSession)));
    renderCaptureHistory(state.captureSessions);
  }));
  $$("[data-delete-session]").forEach((b) => b.addEventListener("click", () => deleteCaptureSession(Number(b.dataset.deleteSession))));
}

async function loadCaptureSessions(preferId = null) {
  try {
    state.captureSessions = await api("/api/capture-sessions");
    const elegida = preferId
      ? state.captureSessions.find((s) => s.id === preferId)
      : state.captureSessions.find((s) => s.active) || state.captureSessions[0];
    renderCaptureSession(elegida || null);
    renderCaptureHistory(state.captureSessions);
  } catch (error) { toast(error.message, "error"); }
}

async function submitCaptureSession(event) {
  event.preventDefault();
  const form = event.currentTarget;
  limpiarErrores(form);
  const titulo = form.elements.title.value.trim();
  if (!titulo) return marcarError(form, "title", "Ponle un nombre para reconocer de dónde vienen los registros.");
  await withLoading($("#captureCreateButton"), async () => {
    try {
      const sesion = await api("/api/capture-sessions", { method: "POST", body: JSON.stringify({ title: titulo }) });
      form.reset();
      toast("Sesión lista: ya puedes mostrar el QR", "success");
      await loadCaptureSessions(sesion.id);
    } catch (error) { toast(error.message, "error"); }
  });
}

async function toggleCaptureSession() {
  const sesion = state.captureSession;
  if (!sesion) return;
  if (sesion.active) {
    const ok = await confirmar({
      title: "Cerrar el registro",
      message: `Nadie más podrá enviar datos desde el QR de “${sesion.title}”. Puedes reabrirlo cuando quieras.`,
      confirmText: "Sí, cerrar",
      danger: false,
    });
    if (!ok) return;
  }
  try {
    await api(`/api/capture-sessions/${sesion.id}`, { method: "PATCH", body: JSON.stringify({ active: !sesion.active }) });
    toast(sesion.active ? "Registro cerrado" : "Registro reabierto", "success");
    await loadCaptureSessions(sesion.id);
  } catch (error) { toast(error.message, "error"); }
}

async function deleteCaptureSession(sessionId) {
  const sesion = state.captureSessions.find((s) => s.id === sessionId);
  const ok = await confirmar({
    title: "Eliminar la sesión",
    message: `Se borra “${sesion ? sesion.title : "esta sesión"}” y su QR deja de servir. Las personas ya registradas se quedan en tu red.`,
    confirmText: "Sí, eliminar",
  });
  if (!ok) return;
  try {
    const result = await api(`/api/capture-sessions/${sessionId}`, { method: "DELETE" });
    toast(result.message, "success");
    if (state.captureSession?.id === sessionId) state.captureSession = null;
    await loadCaptureSessions();
  } catch (error) { toast(error.message, "error"); }
}

async function refreshCaptureCount() {
  const sesion = state.captureSession;
  if (!sesion) return;
  const antes = sesion.registros ?? 0;
  await loadCaptureSessions(sesion.id);
  const ahora = state.captureSession?.registros ?? 0;
  toast(ahora > antes ? `¡Llegaron ${ahora - antes} registro${ahora - antes === 1 ? "" : "s"} nuevo${ahora - antes === 1 ? "" : "s"}!` : "Sin registros nuevos todavía",
        ahora > antes ? "success" : "info");
  if (ahora > antes) await Promise.all([loadDashboard(), loadContacts()]);
}

function openCaptureDialog() {
  $("#captureDialog").showModal();
  loadCaptureSessions(state.captureSession?.id || null);
}

function openQrFullscreen() {
  const sesion = state.captureSession;
  if (!sesion) return;
  $("#qrFullscreenTitle").textContent = sesion.title;
  $("#qrFullscreenCode").innerHTML = `<img src="/api/capture-sessions/${sesion.id}/qr.svg?v=${Date.now()}" alt="Código QR para registrarse">`;
  $("#qrFullscreenUrl").textContent = $("#captureUrl").value;
  $("#qrFullscreenDialog").showModal();
}

function openContactDialog(contactId = null) {
  const form = $("#contactForm");
  form.reset();
  state.editingContactId = contactId;
  const contact = contactId ? state.contacts.find((item) => item.id === contactId) : null;
  $("#contactModalKicker").textContent = contact ? "ACTUALIZAR RELACIÓN" : "NUEVA RELACIÓN";
  $("#contactModalTitle").textContent = contact ? `Editar a ${contact.name}` : "Agregar a mi red";
  $("#contactSubmitButton").textContent = contact ? "Guardar cambios" : "Guardar contacto +25 XP";
  if (contact) {
    // Si la fuente guardada no está entre las opciones, agregarla: de lo contrario
    // el desplegable se ve vacío y al guardar se perdería el dato.
    const fuente = (contact.source || "").trim();
    const select = form.elements.source;
    if (fuente && ![...select.options].some((option) => option.value === fuente)) {
      select.add(new Option(fuente, fuente));
    }
    ["name", "kind", "interest", "stage", "source", "phone", "email", "next_action_date", "birthday", "monthly_consumption", "volume_points", "health_profile", "next_action", "notes"].forEach((key) => {
      if (form.elements[key]) form.elements[key].value = contact[key] ?? "";
    });
  } else {
    form.elements.next_action_date.value = isoPlusDays(1);
  }
  $("#contactDialog").showModal();
}

async function loadMetrics() {
  try {
    state.metrics = await api("/api/metrics");
    const latest = [...state.metrics].slice(0, 5).reverse();
    const maxSales = Math.max(...latest.map((item) => item.sales), 1);
    $("#salesChart").innerHTML = latest.map((item, index) => `<div class="chart-day ${index === latest.length - 1 ? "today" : ""}"><b>${money.format(item.sales)}</b><i class="chart-bar" style="--bar-height:${Math.max(8, Math.round((item.sales / maxSales) * 100))}%"></i><span>${shortDate(item.metric_date).split(" ")[0]}</span></div>`).join("");
    const totals = latest.reduce((acc, item) => ({ prospects: acc.prospects + item.new_prospects, presentations: acc.presentations + item.presentations, sales: acc.sales + item.sales }), { prospects: 0, presentations: 0, sales: 0 });
    $("#reportTotals").innerHTML = `<div class="report-total"><small>PROSPECTOS</small><strong>${totals.prospects}</strong></div><div class="report-total"><small>PRESENTACIONES</small><strong>${totals.presentations}</strong></div><div class="report-total"><small>VENTAS</small><strong>${money.format(totals.sales)}</strong></div>`;
    const todayEntry = state.metrics.find((item) => item.metric_date === isoDate());
    if (todayEntry) Object.entries(todayEntry).forEach(([key, value]) => { const input = $(`#metricsForm [name="${key}"]`); if (input) input.value = value; });
  } catch (error) { toast(error.message); }
}

const emailValido = (valor) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(valor);

function validarContacto(form, data) {
  limpiarErrores(form);
  if (!data.name.trim()) return marcarError(form, "name", "Escribe el nombre de la persona.");
  if (data.name.trim().length > 120) return marcarError(form, "name", "El nombre es demasiado largo (máximo 120 caracteres).");
  if (data.email && !emailValido(data.email.trim())) return marcarError(form, "email", "Revisa el correo: debe verse como nombre@correo.com");
  if (data.phone && data.phone.trim().length > 40) return marcarError(form, "phone", "El teléfono es demasiado largo.");
  return false;
}

async function submitContact(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (validarContacto(form, data)) return;
  const editing = state.editingContactId;
  const boton = $("#contactSubmitButton");
  await withLoading(boton, async () => {
    try {
      const result = await api(editing ? `/api/contacts/${editing}` : "/api/contacts", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(data),
      });
      $("#contactDialog").close();
      form.reset();
      limpiarErrores(form);
      state.editingContactId = null;
      toast(editing ? "Contacto actualizado" : "¡Nueva persona en tu red! +25 XP", "success");
      if (!editing) celebrate(result.new_achievements);
      await Promise.all([loadDashboard(), loadContacts()]);
    } catch (error) { toast(error.message, "error"); }
  });
}

async function submitMetrics(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  limpiarErrores(form);
  const numericos = ["new_prospects", "presentations", "new_clients", "new_associates", "sales", "volume_points", "client_orders"];
  for (const key of numericos) {
    const valor = Number(data[key] || 0);
    if (!Number.isFinite(valor) || valor < 0) return marcarError(form, key, "Debe ser un número igual o mayor que cero.");
    data[key] = valor;
  }
  data.metric_date = isoDate();
  await withLoading(form.querySelector('button[type="submit"]'), async () => {
    try {
      const result = await api("/api/metrics", { method: "POST", body: JSON.stringify(data) });
      toast(result.message, "success");
      celebrate(result.new_achievements);
      await Promise.all([loadDashboard(), loadMetrics()]);
    } catch (error) { toast(error.message, "error"); }
  });
}

const quizStatements = [
  ["analyst", "Antes de recomendar algo, me gusta conocer cómo funciona."],
  ["executor", "Si tengo una idea, me gusta ponerla en práctica rápidamente."],
  ["connection", "Disfruto conocer personas nuevas y escuchar sus necesidades."],
  ["constancy", "Me gusta trabajar con una agenda y seguir un plan claro."],
  ["leadership", "Disfruto ayudar a otras personas a crecer."],
  ["analyst", "Cuando me hacen una pregunta, busco responder con datos."],
  ["executor", "Cuando algo no funciona, pruebo otra estrategia."],
  ["connection", "Las personas suelen confiar en mí."],
  ["constancy", "Reviso mis avances periódicamente."],
  ["leadership", "Me emociona formar y motivar equipos."],
];

function buildQuiz() {
  $("#quizQuestions").innerHTML = quizStatements.map(([profile, statement], index) => `<div class="quiz-question"><p>${index + 1}. ${statement}</p>${[1,2,3,4,5].map((value) => `<label><input type="radio" name="q${index}" value="${value}" data-profile="${profile}" ${value === 3 ? "checked" : ""}></label>`).join("")}</div>`).join("");
}

async function submitQuiz(event) {
  event.preventDefault();
  const scores = { analyst: 0, executor: 0, connection: 0, constancy: 0, leadership: 0 };
  quizStatements.forEach(([profile], index) => { scores[profile] += Number($(`input[name="q${index}"]:checked`).value); });
  Object.keys(scores).forEach((key) => scores[key] *= 4);
  try {
    const result = await api("/api/profile/scores", { method: "POST", body: JSON.stringify({ scores }) });
    $("#quizDialog").close();
    toast(`${result.message}. Perfil dominante: ${result.dominant_profile}`);
    await loadDashboard();
  } catch (error) { toast(error.message); }
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => goToView(button.dataset.view)));
  $$('[data-go-view]').forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); goToView(button.dataset.goView); }));
  $("#mobileMenu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  $$('[data-open-contact]').forEach((button) => button.addEventListener("click", () => openContactDialog()));
  $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => { state.editingContactId = null; $("#contactDialog").close(); }));
  $("#contactForm").addEventListener("submit", submitContact);
  $("#metricsForm").addEventListener("submit", submitMetrics);
  $("#openTaskDialog").addEventListener("click", () => openTaskDialog());
  $$('[data-close-task]').forEach((button) => button.addEventListener("click", () => { state.editingTaskId = null; $("#taskDialog").close(); }));
  $("#taskForm").addEventListener("submit", submitTask);
  $("#openPurposeEdit").addEventListener("click", openProfileDialog);
  $("#openRankEdit").addEventListener("click", openProfileDialog);
  $("#openCapture").addEventListener("click", openCaptureDialog);
  $$('[data-close-capture]').forEach((b) => b.addEventListener("click", () => $("#captureDialog").close()));
  $("#captureSessionForm").addEventListener("submit", submitCaptureSession);
  $("#captureToggle").addEventListener("click", toggleCaptureSession);
  $("#captureRefresh").addEventListener("click", refreshCaptureCount);
  $("#captureFullscreen").addEventListener("click", openQrFullscreen);
  $("#qrFullscreenClose").addEventListener("click", () => $("#qrFullscreenDialog").close());
  $("#captureCopy").addEventListener("click", async () => {
    const url = $("#captureUrl").value;
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado", "success");
    } catch {
      $("#captureUrl").select();
      toast("Selecciona y copia el enlace", "info");
    }
  });
  $("#downloadBackup").addEventListener("click", () => { window.location.href = "/api/export"; toast("Preparando tu respaldo…"); });
  $("#reloadApp").addEventListener("click", () => location.reload());
  // Si el usuario vuelve a la pestaña tras un rato, comprobar si hay código nuevo.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });
  $("#openQuiz").addEventListener("click", () => $("#quizDialog").showModal());
  $$('[data-close-quiz]').forEach((button) => button.addEventListener("click", () => $("#quizDialog").close()));
  $("#quizForm").addEventListener("submit", submitQuiz);
  $("#openAccountProfile").addEventListener("click", openProfileDialog);
  $("#openAccountProfileTop").addEventListener("click", openProfileDialog);
  $("#openAccountProfileGuide").addEventListener("click", openProfileDialog);
  $$('[data-close-profile]').forEach((button) => button.addEventListener("click", () => $("#profileDialog").close()));
  $("#profileForm").addEventListener("submit", submitProfile);
  $$('#profileForm [name="gender"]').forEach((input) => input.addEventListener("change", (event) => updateProfilePreview(event.target.value)));
  $('#profileForm [name="name"]').addEventListener("input", (event) => { $("#profilePreviewName").textContent = event.target.value.trim() || "Tu nombre"; });
  $$('[data-guide-section]').forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.guideSection).scrollIntoView({ behavior: "smooth", block: "start" })));
  $("#xpSimulator").addEventListener("input", (event) => updateXpSimulator(event.target.value));
  $$("#guideChecklist input").forEach((input) => input.addEventListener("change", updateGuideChecklist));
  $("#startTour").addEventListener("click", openTour);
  $("#closeTour").addEventListener("click", () => $("#tourDialog").close());
  $("#tourPrevious").addEventListener("click", () => moveTour(-1));
  $("#tourNext").addEventListener("click", () => moveTour(1));
  $$("#guideFaq details").forEach((detail) => detail.addEventListener("toggle", () => { if (detail.open) $$("#guideFaq details").filter((item) => item !== detail).forEach((item) => item.open = false); }));
  $$(".filter-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.activeKind = button.dataset.kind;
    $$(".filter-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    loadContacts();
  }));
  $("#sourceFilter").addEventListener("change", (event) => {
    state.activeSource = event.target.value;
    loadContacts();
  });
  let searchTimer;
  $("#contactSearch").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = event.target.value.trim(); loadContacts(); }, 250);
  });
}

function applyTodayLabels() {
  const now = new Date();
  $("#todayLabel").textContent = headerDate(now);
  $("#agendaDayLabel").textContent = headerDate(now).split(" · ")[0];
  $("#metricDateLabel").textContent = compactDate(now);
}

async function showStorageMode() {
  try {
    const health = await api("/api/health");
    state.version = health.version;
    const label = health.database === "turso" ? "una base de datos en la nube (Turso)" : "el archivo local data/brujula.db";
    $("#faqStorageMode").textContent = label;
    $("#profilePrivacyNote").textContent = health.database === "turso"
      ? "🔒 Tus datos se guardan en la base en la nube de esta aplicación."
      : "🔒 Tus datos se guardan únicamente en este equipo.";
  } catch { /* El modo de almacenamiento es informativo. */ }
}

/** Si el servidor ya tiene una versión más nueva, ofrecer recargar en vez de fallar en silencio. */
async function checkForUpdate() {
  if (!state.version) return;
  try {
    const health = await api("/api/health");
    if (health.version && health.version !== state.version) $("#updateBanner").classList.add("show");
  } catch { /* Sin conexión no hay nada que avisar. */ }
}

async function loadRanks() {
  try {
    const plan = await api("/api/compensation");
    state.ranks = plan.ranks || [];
  } catch { /* La escalera de rangos es informativa. */ }
}

async function init() {
  buildQuiz();
  bindEvents();
  applyTodayLabels();
  restoreGuideChecklist();
  const initialView = location.hash.replace("#", "");
  if (viewTitles[initialView]) goToView(initialView);
  await loadRanks();
  await Promise.all([loadDashboard(), loadMetrics(), showStorageMode()]);
}

init();
