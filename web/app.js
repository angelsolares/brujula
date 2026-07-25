const state = { dashboard: null, contacts: [], metrics: [], activeKind: "", search: "" };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const shortDate = (value) => value ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)) : "Sin fecha";
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const percent = (current, target) => Math.min(100, Math.round((Number(current) / Math.max(1, Number(target))) * 100));

const profileIcons = { leadership: "♢", connection: "♡", constancy: "✓", analyst: "⌕", executor: "⚡" };
const categoryIcons = { Llamada: "☎", Contenido: "▶", Mentoría: "♢", Redes: "◎", Capacitación: "⌕", Organización: "✓" };
const typeColors = { Prospecto: "#7755c7", Cliente: "#ed5f86", Asociado: "#2878d0" };
const visualVariants = {
  female: { hero: "/assets/mission-trail.png", profile: "/assets/profile-result.png", label: "avatar femenino" },
  male: { hero: "/assets/mission-trail-male.png", profile: "/assets/profile-result-male.png", label: "avatar masculino" },
  neutral: { hero: "/assets/mission-trail-neutral.png", profile: "/assets/profile-result-neutral.png", label: "ilustración neutral sin avatar" },
};
const viewTitles = {
  dashboard: "¡Buenos días, Mariana!",
  contacts: "Tu red, en un solo lugar",
  agenda: "Hoy es un buen día para avanzar",
  map: "Tu meta está cada vez más cerca",
  measure: "Lo que se mide, mejora",
  profile: "Tus fortalezas marcan el rumbo",
  development: "Crecer también es parte del plan",
  guide: "Todo gran viaje empieza con una guía",
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Algo salió mal");
  return payload;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
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
  ["name", "email", "phone", "city", "purpose", "target_income", "goal_date"].forEach((key) => {
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
      <input class="mission-check" type="checkbox" aria-label="Completar ${escapeHtml(task.title)}" ${task.completed ? "checked" : ""}>
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
  $("#dashboardTasks").innerHTML = tasks.slice(0, 4).map((task) => taskTemplate(task)).join("");
  $("#agendaTasks").innerHTML = tasks.map((task) => taskTemplate(task, true)).join("");
  $("#taskRing").textContent = `${completed}/${tasks.length}`;
  $("#agendaProgress").textContent = `${completed} de ${tasks.length} listas`;
  $("#agendaPoints").textContent = `${tasks.filter((task) => !task.completed).reduce((sum, task) => sum + task.points, 0)} XP`;
  $$(".mission-check").forEach((checkbox) => checkbox.addEventListener("change", toggleTask));
}

async function toggleTask(event) {
  const wrapper = event.target.closest("[data-task-id]");
  const taskId = wrapper.dataset.taskId;
  const completed = event.target.checked;
  try {
    const result = await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ completed }) });
    toast(completed ? `¡Misión completada! Nivel ${result.level}` : "Misión reabierta");
    await loadDashboard();
  } catch (error) {
    event.target.checked = !completed;
    toast(error.message);
  }
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

function updateGuideWithUser(user) {
  $("#guideHeroLevel").textContent = user.level;
  $("#guideHeroStreak").textContent = user.streak;
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
  { view: "dashboard", kicker: "PUNTO DE PARTIDA", title: "Mi tablero", icon: "⌂", mini: ["✦", "🔥"], color: "#7755c7", soft: "#f2edff", text: "Tu resumen diario reúne nivel, racha, metas, personas que necesitan atención y las misiones prioritarias.", bullets: ["Revisa tu progreso de nivel", "Empieza por las misiones del día", "Detecta seguimientos urgentes"] },
  { view: "contacts", kicker: "CENTRO DE DESARROLLO", title: "Mi red", icon: "♙", mini: ["♡", "→"], color: "#ed5f86", soft: "#fff0f4", text: "Aquí acompañas a prospectos, clientes y asociados. Cada registro conserva contexto y un próximo paso.", bullets: ["Agregar una persona da 25 XP", "Filtra por tipo o busca por notas", "Haz avanzar la etapa con la flecha"] },
  { view: "agenda", kicker: "ACCIÓN DIARIA", title: "Agenda de hoy", icon: "✓", mini: ["☎", "▶"], color: "#2878d0", soft: "#eaf5ff", text: "Las misiones transforman tu estrategia en acciones concretas, adaptadas a tus perfiles y prioridades.", bullets: ["Cada misión indica su premio", "Marca la casilla al terminar", "Las misiones dan entre 20 y 40 XP"] },
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
    viewTitles.dashboard = `¡Buenos días, ${firstName}!`;
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
    $("#dominantProfile").textContent = user.dominant_profile;
    $("#purposeText").textContent = `“${user.purpose}”`;
    applyVisualVariant(user.gender);
    $("#statProspects").textContent = counts.Prospecto || 0;
    $("#statClients").textContent = counts.Cliente || 0;
    $("#statAssociates").textContent = counts.Asociado || 0;
    $("#navContactCount").textContent = Object.values(counts).reduce((sum, count) => sum + count, 0);
    $("#statSales").textContent = money.format(data.sales_month);
    const salesGoal = goals.find((goal) => goal.title.includes("Ventas"));
    $("#salesPercent").textContent = `${percent(data.sales_month, salesGoal?.target || 35000)}%`;
    renderProfileBars("#dashboardProfileBars", profiles);
    renderProfileBars("#largeProfileBars", profiles, true);
    renderTasks(data.tasks);
    renderGoals(goals);
    renderDevelopment(data.development);
    updateGuideWithUser(user);
    $("#attentionContacts").innerHTML = data.recent_contacts.map(personCard).join("");
    renderContactSummary(counts);
  } catch (error) {
    toast(`No pude cargar el tablero: ${error.message}`);
  }
}

async function submitProfile(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  data.target_income = Number(data.target_income || 0);
  try {
    const result = await api("/api/profile", { method: "PATCH", body: JSON.stringify(data) });
    $("#profileDialog").close();
    toast(result.message);
    await loadDashboard();
  } catch (error) { toast(error.message); }
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
    <td><div class="contact-name"><span class="person-avatar" style="color:${typeColors[contact.kind]};background:${typeColors[contact.kind]}16">${initials(contact.name)}</span><div><strong>${escapeHtml(contact.name)}</strong><span>${escapeHtml(contact.source)}</span></div></div></td>
    <td><span class="type-pill type-${contact.kind}">${escapeHtml(contact.kind)}</span></td>
    <td><span class="interest-pill interest-${contact.interest}">${escapeHtml(contact.interest)}</span></td>
    <td><span class="stage-pill">${escapeHtml(contact.stage)}</span></td>
    <td>${escapeHtml(contact.next_action || "Definir siguiente paso")}</td>
    <td>${shortDate(contact.next_action_date)}</td>
    <td><button class="row-action" data-advance-contact="${contact.id}" title="Avanzar etapa">→</button></td>
  </tr>`;
}

function mobileContactCard(contact) {
  return `<article class="mobile-contact-card"><div class="person-top"><span class="person-avatar" style="color:${typeColors[contact.kind]};background:${typeColors[contact.kind]}16">${initials(contact.name)}</span><div><strong>${escapeHtml(contact.name)}</strong><span>${escapeHtml(contact.source)}</span></div></div><div class="mobile-contact-meta"><span class="type-pill type-${contact.kind}">${contact.kind}</span><span class="interest-pill interest-${contact.interest}">${contact.interest}</span><span class="stage-pill">${escapeHtml(contact.stage)}</span></div><p><strong>Siguiente:</strong> ${escapeHtml(contact.next_action || "Definir siguiente paso")} · ${shortDate(contact.next_action_date)}</p></article>`;
}

async function loadContacts() {
  const params = new URLSearchParams();
  if (state.activeKind) params.set("kind", state.activeKind);
  if (state.search) params.set("q", state.search);
  try {
    state.contacts = await api(`/api/contacts?${params}`);
    $("#contactRows").innerHTML = state.contacts.length ? state.contacts.map(contactRow).join("") : `<tr><td colspan="7">No encontramos personas con esos filtros.</td></tr>`;
    $("#mobileContactList").innerHTML = state.contacts.map(mobileContactCard).join("");
    $$('[data-advance-contact]').forEach((button) => button.addEventListener("click", advanceContact));
  } catch (error) { toast(error.message); }
}

async function advanceContact(event) {
  const id = event.currentTarget.dataset.advanceContact;
  const contact = state.contacts.find((item) => item.id === Number(id));
  const stages = ["Nuevo", "Contactado", "Presentación", "Seguimiento", "Cierre", "Recompra", "Testimonio", "Capacitación", "Activación"];
  const nextStage = stages[Math.min(stages.length - 1, Math.max(0, stages.indexOf(contact.stage)) + 1)];
  try {
    await api(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ stage: nextStage, last_contact: "2026-07-22" }) });
    toast(`${contact.name} avanzó a ${nextStage}`);
    loadContacts();
  } catch (error) { toast(error.message); }
}

async function loadMetrics() {
  try {
    state.metrics = await api("/api/metrics");
    const latest = [...state.metrics].slice(0, 5).reverse();
    const maxSales = Math.max(...latest.map((item) => item.sales), 1);
    $("#salesChart").innerHTML = latest.map((item, index) => `<div class="chart-day ${index === latest.length - 1 ? "today" : ""}"><b>${money.format(item.sales)}</b><i class="chart-bar" style="--bar-height:${Math.max(8, Math.round((item.sales / maxSales) * 100))}%"></i><span>${shortDate(item.metric_date).split(" ")[0]}</span></div>`).join("");
    const totals = latest.reduce((acc, item) => ({ prospects: acc.prospects + item.new_prospects, presentations: acc.presentations + item.presentations, sales: acc.sales + item.sales }), { prospects: 0, presentations: 0, sales: 0 });
    $("#reportTotals").innerHTML = `<div class="report-total"><small>PROSPECTOS</small><strong>${totals.prospects}</strong></div><div class="report-total"><small>PRESENTACIONES</small><strong>${totals.presentations}</strong></div><div class="report-total"><small>VENTAS</small><strong>${money.format(totals.sales)}</strong></div>`;
    const today = state.metrics.find((item) => item.metric_date === "2026-07-22");
    if (today) Object.entries(today).forEach(([key, value]) => { const input = $(`#metricsForm [name="${key}"]`); if (input) input.value = value; });
  } catch (error) { toast(error.message); }
}

async function submitContact(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api("/api/contacts", { method: "POST", body: JSON.stringify(data) });
    $("#contactDialog").close();
    event.currentTarget.reset();
    toast("¡Nueva persona en tu red! +25 XP");
    await Promise.all([loadDashboard(), loadContacts()]);
  } catch (error) { toast(error.message); }
}

async function submitMetrics(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  ["new_prospects", "presentations", "new_clients", "new_associates", "sales"].forEach((key) => data[key] = Number(data[key] || 0));
  try {
    const result = await api("/api/metrics", { method: "POST", body: JSON.stringify(data) });
    toast(result.message);
    await Promise.all([loadDashboard(), loadMetrics()]);
  } catch (error) { toast(error.message); }
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
  $$('[data-open-contact]').forEach((button) => button.addEventListener("click", () => $("#contactDialog").showModal()));
  $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => $("#contactDialog").close()));
  $("#contactForm").addEventListener("submit", submitContact);
  $("#metricsForm").addEventListener("submit", submitMetrics);
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
  let searchTimer;
  $("#contactSearch").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = event.target.value.trim(); loadContacts(); }, 250);
  });
}

async function init() {
  buildQuiz();
  bindEvents();
  restoreGuideChecklist();
  const initialView = location.hash.replace("#", "");
  if (viewTitles[initialView]) goToView(initialView);
  await Promise.all([loadDashboard(), loadMetrics()]);
}

init();
