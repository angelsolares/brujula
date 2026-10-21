const state = { dashboard: null, contacts: [], metrics: [], activeKind: "", activeSource: "", search: "", editingContactId: null, editingTaskId: null, version: null, ranks: [], captureSession: null, captureSessions: [], account: null, alerts: null };

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
// Las diez combinaciones posibles de los dos perfiles más altos. La llave son
// las dos claves ordenadas alfabéticamente, para que dé igual cuál quedó primero.
// Los nombres no llevan género a propósito: el texto anterior decía "Inspiradora"
// y le quedaba mal a media red.
const profileCombinations = {
  "connection|leadership": {
    name: "Voz que inspira",
    focus: "Tu ventaja está en crear una visión atractiva, escuchar con empatía y acompañar a cada persona para que desarrolle su potencial.",
    tags: ["Motiva con el ejemplo", "Genera confianza", "Forma nuevos líderes"],
  },
  "executor|leadership": {
    name: "Motor del equipo",
    focus: "Marcas el rumbo y además lo echas a andar: propones la meta, tomas la iniciativa y el equipo ve avances desde la primera semana.",
    tags: ["Arranca sin esperar", "Contagia impulso", "Convierte metas en tareas"],
  },
  "analyst|leadership": {
    name: "Criterio que guía",
    focus: "Inspiras con argumentos: explicas el porqué de cada decisión, y la gente te sigue porque entiende, no solo porque confía.",
    tags: ["Explica el porqué", "Decide con datos", "Enseña a pensar"],
  },
  "constancy|leadership": {
    name: "Ejemplo sostenido",
    focus: "Tu fuerza no está en un arranque sino en sostener el paso: el equipo se ordena porque te ve cumplir lo que prometes, mes tras mes.",
    tags: ["Cumple lo que dice", "Da seguimiento", "Sostiene el ritmo"],
  },
  "connection|executor": {
    name: "Puente que avanza",
    focus: "Abres puertas y no las dejas enfriar: creas confianza rápido y conviertes esa conversación en un siguiente paso con fecha.",
    tags: ["Rompe el hielo", "Cierra con acuerdos", "No deja enfriar"],
  },
  "analyst|connection": {
    name: "Escucha que orienta",
    focus: "Preguntas antes de proponer. Entiendes la necesidad real de cada persona y por eso tu recomendación casi siempre da en el blanco.",
    tags: ["Pregunta primero", "Recomienda a la medida", "Explica con claridad"],
  },
  "connection|constancy": {
    name: "Presencia confiable",
    focus: "La gente sabe que vas a estar ahí. Tu seguimiento cercano y puntual es lo que convierte un contacto en una relación de años.",
    tags: ["Seguimiento cercano", "Construye a largo plazo", "Nadie se queda sin respuesta"],
  },
  "analyst|executor": {
    name: "Decisión con datos",
    focus: "Actúas rápido pero no a ciegas: revisas el número, decides y ajustas. Pruebas más ideas que nadie porque mides cada una.",
    tags: ["Prueba y mide", "Corrige a tiempo", "Actúa sin trabarse"],
  },
  "constancy|executor": {
    name: "Ritmo que cumple",
    focus: "Combinas velocidad con disciplina: lo que entra a tu plan sale hecho, y por eso tus resultados no dependen de la inspiración del día.",
    tags: ["Termina lo que empieza", "Trabaja con plan", "Resultados parejos"],
  },
  "analyst|constancy": {
    name: "Método claro",
    focus: "Ordenas lo complejo y lo repites bien: dejas procesos que otros pueden seguir, y eso es lo que hace que un negocio crezca sin ti encima.",
    tags: ["Documenta lo que funciona", "Mejora poco a poco", "Deja procesos claros"],
  },
};

const categoryIcons = { Llamada: "☎", Contenido: "▶", Mentoría: "♢", Redes: "◎", Capacitación: "⌕", Organización: "✓" };
const typeColors = { Prospecto: "#7755c7", Cliente: "#ed5f86", Asociado: "#2878d0" };
const visualVariants = {
  // Las ilustraciones de personaje son limpias a propósito: las anteriores traían
  // la rueda con puntajes pintados encima (23, 21, 31...) iguales para todos, y
  // esos números ahora se dibujan con los datos reales en compass.js.
  female: { hero: "/assets/mission-trail.png", profile: "/assets/character-female.png", label: "avatar femenino" },
  male: { hero: "/assets/mission-trail-male.png", profile: "/assets/character-male.png", label: "avatar masculino" },
  neutral: { hero: "/assets/mission-trail-neutral.png", profile: "/assets/mission-trail-neutral.png", label: "ilustración neutral sin avatar" },
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
  testimonios: "Testimonios que respaldan tu mensaje",
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
  if (response.status === 401) {
    // La sesión expiró o nunca existió: volver al inicio de sesión.
    location.href = "/login";
    throw new Error("Tu sesión terminó. Vuelve a entrar.");
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
  // "Medir avances" ya no es una sección aparte: vive dentro de Mi tablero.
  const irAMedir = viewName === "measure";
  if (irAMedir) viewName = "dashboard";
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  $("#viewTitle").textContent = viewTitles[viewName];
  $(".sidebar").classList.remove("open");
  history.replaceState(null, "", `#${viewName}`);
  if (irAMedir) {
    loadMetrics();
    requestAnimationFrame(() => $("#measureSection")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (viewName === "contacts") loadContacts();
  if (viewName === "agenda") loadAgenda();
  if (viewName === "testimonios") loadTestimonials();
}

function selectedVisual(gender) {
  return visualVariants[gender] || visualVariants.neutral;
}

function updateProfilePreview(gender) {
  const visual = selectedVisual(gender);
  $("#profileEditPreview").src = visual.profile;
  $("#profileEditPreview").alt = `Vista previa de la representación visual: ${visual.label}`;
}

function applyVisualVariant(gender) {
  const visual = selectedVisual(gender);
  document.body.dataset.gender = gender || "neutral";
  $("#dashboardHero").style.backgroundImage = `url("${visual.hero}")`;
  $("#journeyImage").src = visual.hero;
  $("#journeyImage").alt = `Valle ilustrado con camino de metas y ${visual.label}`;
  updateProfilePreview(gender);
}

// Los tres rasgos de color se eligen con muestras; el resto con listas, que a
// nueve rasgos es lo que cabe sin volver el formulario un muro de botones.
const AVATAR_SWATCHES = { skin: AVATAR_SKIN, hair_color: AVATAR_HAIR_COLOR, outfit: AVATAR_OUTFIT };

function renderAvatarControls() {
  const host = $("#avatarControls");
  if (!host || host.dataset.ready) return;
  host.innerHTML = Object.entries(AVATAR_OPTIONS).map(([key, { label, choices }]) => {
    const paleta = AVATAR_SWATCHES[key];
    if (paleta) {
      const muestras = choices.map(([value, texto]) =>
        `<label class="avatar-swatch"><input type="radio" name="avatar_${key}" value="${value}"><span style="background:${paleta[value][0]}"></span><i>${texto}</i></label>`).join("");
      return `<fieldset class="avatar-control avatar-control-colors"><legend>${label}</legend><div class="avatar-swatches">${muestras}</div></fieldset>`;
    }
    const opciones = choices.map(([value, texto]) => `<option value="${value}">${texto}</option>`).join("");
    return `<label class="avatar-control"><span>${label}</span><select name="avatar_${key}">${opciones}</select></label>`;
  }).join("");
  host.dataset.ready = "1";
}

function avatarFormTraits() {
  const form = $("#profileForm");
  const traits = {};
  Object.keys(AVATAR_OPTIONS).forEach((key) => {
    const control = form.elements[`avatar_${key}`];
    if (control) traits[`avatar_${key}`] = control.value;
  });
  return traits;
}

function refreshAvatarPreview() {
  const stage = $("#profileAvatarStage");
  if (stage) stage.innerHTML = avatarSvg(avatarFormTraits(), "cuerpo");
}

function setAvatarForm(user) {
  const form = $("#profileForm");
  renderAvatarControls();
  Object.entries(avatarTraits(user)).forEach(([key, value]) => {
    const control = form.elements[`avatar_${key}`];
    if (control) control.value = value;
  });
  refreshAvatarPreview();
}

function randomizeAvatar() {
  const form = $("#profileForm");
  Object.entries(AVATAR_OPTIONS).forEach(([key, { choices }]) => {
    const control = form.elements[`avatar_${key}`];
    if (control) control.value = choices[Math.floor(Math.random() * choices.length)][0];
  });
  refreshAvatarPreview();
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
  setAvatarForm(user);
}

function openProfileDialog() {
  if (!state.dashboard?.user) return toast("Espera un momento mientras cargamos tu perfil.");
  fillProfileForm(state.dashboard.user);
  $("#profileDialog").showModal();
}

// La brújula y el encabezado de la combinación se arman con los puntajes
// guardados: antes venían pintados en la imagen e iguales para todos.
function renderCompass(profiles, user) {
  const host = $("#profileCompass");
  if (!host || !profiles?.length) return;
  host.innerHTML = compassSvg(profiles, user);
  // El servidor ya los manda ordenados, con el desempate por contactos
  // trabajados y actividad reciente ya resuelto; reordenar aquí lo perdería.
  const orden = profiles;
  const combinacion = profileCombinations[[orden[0].profile_key, orden[1].profile_key].sort().join("|")];
  $("#profileCombination").textContent = combinacion
    ? `${orden[0].label} + ${orden[1].label} = ${combinacion.name}`
    : `${orden[0].label} + ${orden[1].label}`;
  $("#profileCombinationFocus").textContent = combinacion?.focus || profileMeta[orden[0].label]?.focus || "";
  $("#profileCombinationTags").innerHTML = (combinacion?.tags || [])
    .map((etiqueta) => `<span>${escapeHtml(etiqueta)}</span>`).join("");
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
      <time class="timeline-time">${escapeHtml(task.due_time ? String(task.due_time).slice(0, 5) : "Sin hora")}</time>
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
  // Solo el tablero: la agenda se pinta aparte, para el día, semana o mes elegidos.
  const completed = tasks.filter((task) => task.completed).length;
  $("#dashboardTasks").innerHTML = tasks.length
    ? tasks.slice(0, 4).map((task) => taskTemplate(task)).join("")
    : `<p class="empty-state">Aún no hay misiones para hoy. Crea una desde la agenda.</p>`;
  $("#taskRing").textContent = `${completed}/${tasks.length}`;
  $$("#dashboardTasks .mission-check").forEach((checkbox) => checkbox.addEventListener("change", toggleTask));
  refreshAgendaIfVisible();
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

const momentIcons = { "mañana": "☀", tarde: "◐", noche: "☾" };

function renderMotivation(motivacion) {
  const tarjeta = $("#motivationCard");
  if (!motivacion) { tarjeta.hidden = true; return; }
  tarjeta.hidden = false;
  tarjeta.dataset.moment = motivacion.moment;
  tarjeta.dataset.kind = motivacion.kind;
  $("#motivationIcon").textContent = momentIcons[motivacion.moment] || "✦";
  $("#motivationKicker").textContent = motivacion.kicker;
  $("#motivationTitle").textContent = motivacion.title;
  $("#motivationMessage").textContent = motivacion.message;

  const resumen = motivacion.summary || [];
  $("#motivationSummary").innerHTML = resumen.map((dato) => `<span>${escapeHtml(dato)}</span>`).join("");

  const perfil = $("#motivationProfile");
  if (motivacion.profile_phrase) {
    perfil.hidden = false;
    perfil.textContent = motivacion.profile_phrase;
    perfil.dataset.profile = motivacion.profile || "";
  } else {
    perfil.hidden = true;
  }

  const boton = $("#motivationAction");
  if (motivacion.action) {
    boton.hidden = false;
    boton.textContent = `${motivacion.action.label} →`;
    boton.onclick = () => goToView(motivacion.action.view);
  } else {
    boton.hidden = true;
  }
}

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

// Una actividad puede venir del tablero (hoy) o de la agenda (cualquier día).
function findTask(taskId) {
  return [...(state.agenda?.data?.tasks || []), ...(state.dashboard?.tasks || []),
    ...(state.alerts?.tasks_today || []), ...(state.alerts?.tasks_overdue || [])].find((item) => item.id === taskId) || null;
}

async function deleteTask(taskId) {
  const task = findTask(taskId);
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

function openTaskDialog(taskId = null, fechaInicial = null) {
  const form = $("#taskForm");
  form.reset();
  state.editingTaskId = taskId;
  const task = taskId ? findTask(taskId) : null;
  $("#taskModalKicker").textContent = task ? "EDITAR ACTIVIDAD" : "NUEVA ACTIVIDAD";
  $("#taskModalTitle").textContent = task ? "Ajustar esta actividad" : "Agregar una actividad";
  $("#taskSubmitButton").textContent = task ? "Guardar cambios" : "Guardar actividad";
  if (task) {
    ["title", "detail", "category", "profile_tag", "due_date", "due_time", "points"].forEach((key) => {
      if (form.elements[key]) form.elements[key].value = task[key] ?? "";
    });
  } else {
    form.elements.due_date.value = fechaInicial || (state.agenda?.mode === "day" && $("#view-agenda").classList.contains("active") ? state.agenda.date : isoDate());
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
  { view: "agenda", kicker: "ACCIÓN DIARIA", title: "Agenda", icon: "✓", mini: ["☎", "▶"], color: "#2878d0", soft: "#eaf5ff", text: "Tus actividades y seguimientos en vista de día, semana o mes. Te recuerda cada actividad 10 minutos antes.", bullets: ["Crea actividades con “＋ Nueva actividad”", "Cambia entre Día, Semana y Mes", "La campana 🔔 reabre tus pendientes"] },
  { view: "map", kicker: "PLANEACIÓN", title: "Mi mapa", icon: "⌁", mini: ["◎", "🏆"], color: "#f49a2f", soft: "#fff5e8", text: "El mapa convierte metas grandes en un sendero visible y muestra el porcentaje de avance de cada objetivo.", bullets: ["Compara avance contra meta", "Detecta el tramo que necesita atención", "Celebra cada estación alcanzada"] },
  { view: "measure", kicker: "RESULTADOS", title: "Lo que hice hoy", icon: "↗", mini: ["#", "$"], color: "#55a85b", soft: "#edf8ee", text: "En Mi tablero registras prospectos, presentaciones, clientes, asociados, ventas y productos para aprender de tus resultados.", bullets: ["Está dentro de Mi tablero", "Guardar el día da 15 XP", "La gráfica muestra los últimos cinco días"] },
  { view: "profile", kicker: "CONOCIMIENTO PERSONAL", title: "Mi brújula", icon: "✣", mini: ["⌕", "♡"], color: "#ef5f86", soft: "#fff0f4", text: "Tu propósito y los cinco perfiles explican cómo trabajas mejor y qué estrategia aprovecha tus fortalezas.", bullets: ["El test tiene 25 afirmaciones", "Completarlo da 75 XP", "Ningún perfil es mejor que otro"] },
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
    $("#sideAvatar").innerHTML = avatarSvg(user, "retrato");
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
    renderCompass(profiles, user);
    renderTasks(data.tasks);
    renderGoals(goals);
    renderDevelopment(data.development);
    renderAchievements(data.achievements);
    renderGuideAchievements(data.achievements);
    renderWeek(data.week_activity);
    renderMotivation(data.motivation);
    renderCompensation(data.compensation);
    updateGuideWithUser(user);
    $("#attentionContacts").innerHTML = data.recent_contacts.map(personCard).join("");
    renderContactSummary(counts);
    renderFollowupAlerts(data.alerts);
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

// --- Agenda por día, semana y mes -------------------------------------------

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const fmtDiaLargo = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const fmtMesAnio = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
const fmtDiaCorto = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const fechaDe = (iso) => new Date(`${iso}T12:00:00`);
const sumarDias = (iso, n) => { const d = fechaDe(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const sumarMeses = (iso, n) => { const d = fechaDe(iso); return isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)); };
const inicioSemana = (iso) => { const d = fechaDe(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); };
let agendaSeq = 0;

function rangoAgenda({ mode, date }) {
  if (mode === "day") return { from: date, to: date };
  if (mode === "week") { const from = inicioSemana(date); return { from, to: sumarDias(from, 6) }; }
  // Mes: semanas completas (de lunes a domingo) que cubren el mes.
  const d = fechaDe(date);
  const primero = isoDate(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const ultimo = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  return { from: inicioSemana(primero), to: sumarDias(inicioSemana(ultimo), 6) };
}

function etiquetaAgenda(st, rango) {
  if (st.mode === "day") return `${st.date === isoDate() ? "Hoy · " : ""}${capitalizar(fmtDiaLargo.format(fechaDe(st.date)))}`;
  if (st.mode === "week") return `${fmtDiaCorto.format(fechaDe(rango.from))} – ${fmtDiaCorto.format(fechaDe(rango.to))}`;
  return capitalizar(fmtMesAnio.format(fechaDe(st.date)));
}

async function loadAgenda() {
  if (!state.agenda) state.agenda = { mode: "day", date: isoDate(), data: null };
  const st = state.agenda;
  const rango = rangoAgenda(st);
  $$("[data-agenda-mode]").forEach((b) => {
    const activo = b.dataset.agendaMode === st.mode;
    b.classList.toggle("active", activo);
    b.setAttribute("aria-selected", String(activo));
  });
  $("#agendaRangeLabel").textContent = etiquetaAgenda(st, rango);
  $("#agendaDayLayout").hidden = st.mode !== "day";
  $("#agendaWeek").hidden = st.mode !== "week";
  $("#agendaMonth").hidden = st.mode !== "month";
  const seq = ++agendaSeq;
  try {
    const data = await api(`/api/agenda?from=${rango.from}&to=${rango.to}`);
    if (seq !== agendaSeq) return; // llegó tarde una carga anterior
    st.data = data;
    if (st.mode === "day") renderAgendaDay(data, st.date);
    else if (st.mode === "week") renderAgendaWeek(data, rango);
    else renderAgendaMonth(data, rango);
  } catch (error) {
    if (seq === agendaSeq) toast(`No pude cargar la agenda: ${error.message}`, "error");
  }
}

function refreshAgendaIfVisible() {
  if ($("#view-agenda")?.classList.contains("active")) loadAgenda();
}

const agendaFollowupItem = (p) => `<li class="pending-item">
    <span class="pending-icon">☎</span>
    <div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.next_action || "Definir siguiente paso")}</small></div>
    <div class="pending-actions"><button type="button" class="pending-btn primary" data-agenda-contact="${p.id}">Registrar seguimiento</button></div>
  </li>`;

function renderAgendaDay(data, fecha) {
  const tareas = data.tasks.filter((t) => t.due_date === fecha);
  const seguimientos = data.followups.filter((p) => p.next_action_date === fecha);
  const hechas = tareas.filter((t) => t.completed).length;
  const esHoy = fecha === isoDate();
  $("#agendaDayLabel").textContent = esHoy ? "HOY" : fmtDiaLargo.format(fechaDe(fecha)).toUpperCase();
  $("#agendaDayTitle").textContent = esHoy ? "Tu ruta del día" : "Actividades de este día";
  $("#agendaProgress").textContent = `${hechas} de ${tareas.length} listas`;
  $("#agendaPoints").textContent = `${tareas.filter((t) => !t.completed).reduce((suma, t) => suma + t.points, 0)} XP`;
  $("#agendaPointsLabel").textContent = esHoy ? "disponibles hoy" : "disponibles ese día";
  $("#agendaTasks").innerHTML = tareas.length
    ? tareas.map((t) => taskTemplate(t, true)).join("")
    : `<p class="empty-state">${esHoy ? "Tu día está libre." : "No hay actividades este día."} Agrega una con “Nueva actividad”.</p>`;
  const caja = $("#agendaDayFollowups");
  caja.hidden = !seguimientos.length;
  caja.innerHTML = seguimientos.length
    ? `<h4>Personas a las que toca dar seguimiento</h4><ul class="pending-list">${seguimientos.map(agendaFollowupItem).join("")}</ul>`
    : "";
}

const chipTarea = (t) => `<button type="button" class="agenda-chip chip-task${t.completed ? " is-done" : ""}${!t.completed && t.due_date < isoDate() ? " is-overdue" : ""}" data-agenda-task="${t.id}" title="${escapeHtml(t.title)}"><b>${escapeHtml(t.due_time ? horaLegible(t.due_time) : "·")}</b> ${escapeHtml(t.title)}</button>`;
const chipSeguimiento = (p) => `<button type="button" class="agenda-chip chip-followup" data-agenda-contact="${p.id}" title="Seguimiento con ${escapeHtml(p.name)}">☎ ${escapeHtml(p.name)}</button>`;

function renderAgendaWeek(data, rango) {
  const hoy = isoDate();
  const columnas = [];
  for (let i = 0; i < 7; i++) {
    const dia = sumarDias(rango.from, i);
    const tareas = data.tasks.filter((t) => t.due_date === dia);
    const seguimientos = data.followups.filter((p) => p.next_action_date === dia);
    const fecha = fechaDe(dia);
    columnas.push(`<section class="agenda-col${dia === hoy ? " is-today" : ""}">
      <button type="button" class="agenda-col-head" data-agenda-day="${dia}" title="Ver el día completo"><span>${DIAS_CORTOS[i]}</span><strong>${fecha.getDate()}</strong></button>
      <div class="agenda-col-items">
        ${tareas.map(chipTarea).join("")}${seguimientos.map(chipSeguimiento).join("")}
        ${tareas.length || seguimientos.length ? "" : '<p class="agenda-empty">Libre</p>'}
      </div>
      <button type="button" class="agenda-add" data-agenda-new="${dia}" aria-label="Agregar actividad el ${escapeHtml(fmtDiaLargo.format(fecha))}">＋ Agregar</button>
    </section>`);
  }
  $("#agendaWeek").innerHTML = columnas.join("");
}

function renderAgendaMonth(data, rango) {
  const hoy = isoDate();
  const mes = fechaDe(state.agenda.date).getMonth();
  const celdas = DIAS_CORTOS.map((d) => `<div class="agenda-month-head">${d}</div>`);
  for (let dia = rango.from; dia <= rango.to; dia = sumarDias(dia, 1)) {
    const fecha = fechaDe(dia);
    const items = [...data.tasks.filter((t) => t.due_date === dia).map(chipTarea),
      ...data.followups.filter((p) => p.next_action_date === dia).map(chipSeguimiento)];
    celdas.push(`<div class="agenda-cell${fecha.getMonth() !== mes ? " is-other" : ""}${dia === hoy ? " is-today" : ""}" data-agenda-day="${dia}" role="button" tabindex="0" aria-label="${escapeHtml(fmtDiaLargo.format(fecha))}: ${items.length} pendientes">
      <span class="agenda-cell-num">${fecha.getDate()}</span>
      <div class="agenda-cell-items">${items.slice(0, 3).join("")}${items.length > 3 ? `<span class="agenda-more">+${items.length - 3} más</span>` : ""}</div>
      ${items.length ? `<span class="agenda-cell-count" aria-hidden="true">${items.length}</span>` : ""}
    </div>`);
  }
  $("#agendaMonth").innerHTML = celdas.join("");
}

function setupAgenda() {
  const vista = $("#view-agenda");
  vista.addEventListener("change", (event) => { if (event.target.matches(".mission-check")) toggleTask(event); });
  vista.addEventListener("keydown", (event) => {
    const celda = event.target.closest(".agenda-cell");
    if (celda && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); celda.click(); }
  });
  vista.addEventListener("click", (event) => {
    const b = event.target.closest("[data-agenda-mode],[data-agenda-step],[data-agenda-today],[data-edit-task],[data-delete-task],[data-agenda-task],[data-agenda-contact],[data-agenda-new],[data-agenda-day]");
    if (!b) return;
    const st = state.agenda || (state.agenda = { mode: "day", date: isoDate(), data: null });
    const ds = b.dataset;
    if (ds.agendaMode) { st.mode = ds.agendaMode; loadAgenda(); return; }
    if (ds.agendaStep) {
      const n = Number(ds.agendaStep);
      st.date = st.mode === "day" ? sumarDias(st.date, n) : st.mode === "week" ? sumarDias(st.date, 7 * n) : sumarMeses(st.date, n);
      loadAgenda();
      return;
    }
    if ("agendaToday" in ds) { st.date = isoDate(); loadAgenda(); return; }
    if (ds.editTask) { openTaskDialog(Number(ds.editTask)); return; }
    if (ds.agendaTask) { openTaskDialog(Number(ds.agendaTask)); return; }
    if (ds.deleteTask) { deleteTask(Number(ds.deleteTask)); return; }
    if (ds.agendaContact) { openContactDialog(Number(ds.agendaContact), true); return; }
    if (ds.agendaNew) { openTaskDialog(null, ds.agendaNew); return; }
    if (ds.agendaDay) { st.mode = "day"; st.date = ds.agendaDay; loadAgenda(); }
  });
}

// --- Alertas y seguimientos -------------------------------------------------

const channelIcons = { Llamada: "📞", Mensaje: "💬", WhatsApp: "🟢", Reunión: "🤝", Café: "☕", Correo: "✉", Evento: "🎪", Otro: "•" };

function relativeDay(dateStr) {
  if (!dateStr) return "";
  const dias = Math.round((new Date(`${dateStr}T12:00:00`) - new Date(`${isoDate()}T12:00:00`)) / 86400000);
  if (dias === 0) return "hoy";
  if (dias === -1) return "ayer";
  if (dias === 1) return "mañana";
  if (dias < 0) return `hace ${Math.abs(dias)} días`;
  return `en ${dias} días`;
}

function followupAlertItem(person) {
  const tono = person.bucket === "overdue" ? "overdue" : person.bucket === "today" ? "today" : "upcoming";
  const fecha = `${shortDate(person.next_action_date)} · ${relativeDay(person.next_action_date)}`;
  return `<article class="followup-alert followup-alert-${tono}">
    <span class="person-avatar" style="color:${typeColors[person.kind]};background:${typeColors[person.kind]}16">${initials(person.name)}</span>
    <div class="followup-alert-body">
      <strong>${escapeHtml(person.name)} <small>${escapeHtml(person.kind)}</small></strong>
      <p>${escapeHtml(person.next_action || "Definir siguiente paso")}</p>
      <time class="followup-when-${tono}">${fecha}</time>
    </div>
    <div class="followup-alert-actions">
      <button class="primary-button tiny" data-followup-open="${person.id}">Registrar</button>
      <button class="row-action" data-followup-snooze="${person.id}" title="Posponer un día">↷</button>
    </div>
  </article>`;
}

function renderFollowupAlerts(alerts) {
  state.alerts = alerts || null;
  const badgeAgenda = $("#navTaskBadge");
  if (badgeAgenda) {
    const pendientesAgenda = alerts?.pending_tasks || 0;
    badgeAgenda.hidden = pendientesAgenda === 0;
    badgeAgenda.textContent = pendientesAgenda;
  }
  const campana = $("#pendingBellCount");
  if (campana) {
    const totalPendientes = (alerts?.pending || 0) + (alerts?.pending_tasks || 0);
    campana.hidden = totalPendientes === 0;
    campana.textContent = totalPendientes > 99 ? "99+" : totalPendientes;
  }
  if (alerts) {
    maybeShowPendingPopup(alerts);
    checkTaskReminders();
    maybeNotify(alerts);
  }
  const badge = $("#navAlertBadge");
  const panel = $("#followupAlertsPanel");
  if (!alerts) { if (panel) panel.hidden = true; if (badge) badge.hidden = true; return; }
  const pendientes = [...alerts.overdue, ...alerts.today];
  if (badge) {
    badge.hidden = alerts.pending === 0;
    badge.textContent = alerts.pending;
  }
  if (!panel) return;
  if (pendientes.length === 0 && alerts.upcoming.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const atrasados = alerts.counts.overdue;
  $("#followupAlertsTitle").textContent = pendientes.length
    ? `${pendientes.length} ${pendientes.length === 1 ? "persona espera" : "personas esperan"} tu seguimiento`
    : "Sin seguimientos para hoy";
  $("#followupAlertList").innerHTML = pendientes.length
    ? pendientes.map(followupAlertItem).join("")
    : `<p class="followup-empty">Nada vencido ni para hoy. Vas al día con tu red. 🎯</p>`;
  const nota = $("#followupUpcomingNote");
  if (alerts.upcoming.length) {
    nota.hidden = false;
    nota.textContent = `Y ${alerts.upcoming.length} más en los próximos días: ${alerts.upcoming.slice(0, 3).map((p) => `${p.name.split(/\s+/)[0]} (${relativeDay(p.next_action_date)})`).join(", ")}${alerts.upcoming.length > 3 ? "…" : "."}`;
  } else {
    nota.hidden = true;
  }
  if (atrasados) panel.classList.add("has-overdue"); else panel.classList.remove("has-overdue");
  $$("[data-followup-open]").forEach((b) => b.addEventListener("click", () => openContactDialog(Number(b.dataset.followupOpen), true)));
  $$("[data-followup-snooze]").forEach((b) => b.addEventListener("click", () => postponeAlert(Number(b.dataset.followupSnooze))));
  setupNotifyButton();
}

async function postponeAlert(contactId) {
  const persona = [...(state.alerts?.overdue || []), ...(state.alerts?.today || [])].find((p) => p.id === contactId);
  const nueva = isoPlusDays(1);
  try {
    await api(`/api/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify({ next_action_date: nueva }) });
    toast(`${persona ? persona.name.split(/\s+/)[0] : "Seguimiento"} pospuesto a mañana`, "success");
    await loadDashboard();
  } catch (error) { toast(error.message, "error"); }
}

// --- Avisos: ventana de pendientes, recordatorios y avisos del sistema -------
// Todo funciona mientras BRÚJULA está abierta (en pantalla o en segundo plano en
// el navegador). Los avisos con la app cerrada requerirían un servidor de push.

const AVISO_ANTICIPO_MIN = 10;  // recordar cada actividad 10 minutos antes de su hora
let swRegistro = null;
let pendientesMostradoEn = 0;

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try { swRegistro = await navigator.serviceWorker.register("/sw.js"); } catch (_) { swRegistro = null; }
}

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const appInstalada = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

function notifyState() {
  if (!("Notification" in window)) return esIOS() && !appInstalada() ? "ios-sin-instalar" : "no-soportado";
  return Notification.permission; // granted | denied | default
}

async function requestNotifyPermission() {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso === "granted") {
      toast("Listo: este dispositivo te avisará de tus actividades y seguimientos", "success");
      systemNotify("BRÚJULA · Avisos activados", "Así se verán tus recordatorios.", { tag: "brujula-prueba" });
    } else if (permiso === "denied") {
      toast("Los avisos quedaron bloqueados. Puedes activarlos en los permisos del navegador.", "error");
    }
  } catch (_) { /* algunos navegadores lo bloquean en silencio */ }
  renderNotifyHints();
}

// Android solo acepta avisos desde el service worker; en escritorio sirve el método directo.
async function systemNotify(titulo, cuerpo, { tag = "brujula", url = "/" } = {}) {
  if (notifyState() !== "granted") return false;
  const opciones = { body: cuerpo, icon: "/assets/app-icon-192.png", badge: "/assets/app-icon-192.png", tag, renotify: true, data: { url } };
  try {
    const reg = swRegistro || (navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null);
    if (reg) { await reg.showNotification(titulo, opciones); return true; }
  } catch (_) { /* seguimos con el método de escritorio */ }
  try {
    const n = new Notification(titulo, opciones);
    n.onclick = () => { window.focus(); const vista = url.split("#")[1]; if (vista) goToView(vista); n.close(); };
    return true;
  } catch (_) { return false; }
}

// Botón y texto para activar avisos, según lo que permita cada dispositivo.
function renderNotifyHints() {
  const estado = notifyState();
  const botonPanel = $("#followupNotifyButton");
  if (botonPanel) botonPanel.hidden = estado !== "default";
  const caja = $("#pendingNotify");
  if (!caja) return;
  const texto = $("#pendingNotifyText");
  const boton = $("#pendingNotifyButton");
  caja.hidden = false;
  boton.hidden = estado !== "default";
  if (estado === "default") {
    texto.textContent = "Activa los avisos para que este dispositivo te recuerde cada actividad a su hora mientras BRÚJULA esté abierta.";
  } else if (estado === "ios-sin-instalar") {
    texto.textContent = "En iPhone los avisos funcionan con BRÚJULA instalada en tu pantalla de inicio: botón Compartir y luego “Agregar a pantalla de inicio”.";
  } else if (estado === "denied") {
    texto.textContent = "Los avisos de este dispositivo están bloqueados. Puedes activarlos en los permisos del navegador para este sitio.";
  } else {
    caja.hidden = true;
  }
}

function setupNotifyButton() {
  const boton = $("#followupNotifyButton");
  if (boton && !boton.dataset.wired) {
    boton.dataset.wired = "1";
    boton.addEventListener("click", requestNotifyPermission);
  }
  renderNotifyHints();
}

function resumenPendientes(alerts) {
  const partes = [];
  const hoy = alerts.tasks_today?.length || 0;
  const atrasadas = alerts.tasks_overdue?.length || 0;
  if (hoy) partes.push(`${hoy} actividad${hoy === 1 ? "" : "es"} para hoy`);
  if (atrasadas) partes.push(`${atrasadas} actividad${atrasadas === 1 ? "" : "es"} atrasada${atrasadas === 1 ? "" : "s"}`);
  if (alerts.pending) partes.push(`${alerts.pending} seguimiento${alerts.pending === 1 ? "" : "s"} pendiente${alerts.pending === 1 ? "" : "s"}`);
  return partes.length ? `${partes.join(", ")}.` : "Sin pendientes.";
}

// Resumen del día como aviso del sistema, una vez por día.
function maybeNotify(alerts, force = false) {
  if (!alerts || notifyState() !== "granted") return;
  if (!((alerts.pending || 0) + (alerts.pending_tasks || 0))) return;
  const marca = isoDate();
  if (!force) { try { if (localStorage.getItem("brujula_notify_day") === marca) return; } catch (_) {} }
  try { localStorage.setItem("brujula_notify_day", marca); } catch (_) {}
  systemNotify("BRÚJULA · Tus pendientes de hoy", resumenPendientes(alerts), { tag: "brujula-resumen", url: "/#agenda" });
}

const horaLegible = (hhmm) => (hhmm ? String(hhmm).slice(0, 5) : "Sin hora");

// Cada pendiente trae sus acciones a la mano: dar seguimiento, pasar a mañana o
// marcar como hecho, sin tener que buscarlo en la agenda.
function pendingTaskItem(t) {
  const atrasada = t.due_date < isoDate();
  const cuando = atrasada ? `${shortDate(t.due_date)} · atrasada` : (t.due_time ? `Hoy a las ${horaLegible(t.due_time)}` : "Hoy");
  const quien = t.contact_name ? ` · con ${t.contact_name}` : "";
  const seguir = t.contact_id
    ? `<button type="button" class="pending-btn primary" data-pending-follow-task="${t.id}" data-contact-id="${t.contact_id}">Dar seguimiento</button>`
    : `<button type="button" class="pending-btn primary" data-pending-edit="${t.id}">Abrir</button>`;
  return `<li class="pending-item${atrasada ? " is-overdue" : ""}">
    <span class="pending-icon">${atrasada ? "⏰" : "✓"}</span>
    <div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(cuando + quien)}</small></div>
    <div class="pending-actions">
      ${seguir}
      <button type="button" class="pending-btn" data-pending-postpone="${t.id}" title="Pasar esta actividad a mañana">Mañana</button>
      <button type="button" class="pending-btn done" data-pending-done="${t.id}" title="Marcar como hecha">✓ Hecha</button>
    </div>
  </li>`;
}

function pendingFollowupItem(p) {
  const atrasado = p.bucket === "overdue";
  return `<li class="pending-item${atrasado ? " is-overdue" : ""}">
    <span class="pending-icon">${atrasado ? "⏰" : "☎"}</span>
    <div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(`${p.next_action || "Definir siguiente paso"} · ${relativeDay(p.next_action_date)}`)}</small></div>
    <div class="pending-actions">
      <button type="button" class="pending-btn primary" data-pending-contact="${p.id}">Dar seguimiento</button>
      <button type="button" class="pending-btn" data-pending-postpone-contact="${p.id}" title="Pasar este seguimiento a mañana">Mañana</button>
    </div>
  </li>`;
}

function showPendingPopup(alerts) {
  const dlg = $("#pendingDialog");
  if (!dlg || !alerts) return;
  // Primero lo de hoy con su hora; después lo que quedó atrasado.
  const tareas = [...(alerts.tasks_today || []), ...(alerts.tasks_overdue || [])];
  const seguimientos = [...(alerts.overdue || []), ...(alerts.today || [])];
  const total = tareas.length + seguimientos.length;
  if (!total) return;
  $("#pendingTitle").textContent = `Tienes ${total} pendiente${total === 1 ? "" : "s"}`;
  $("#pendingSummary").textContent = resumenPendientes(alerts);
  $("#pendingTasksBlock").hidden = !tareas.length;
  $("#pendingTasks").innerHTML = tareas.map(pendingTaskItem).join("");
  $("#pendingFollowupsBlock").hidden = !seguimientos.length;
  $("#pendingFollowups").innerHTML = seguimientos.map(pendingFollowupItem).join("");
  renderNotifyHints();
  pendientesMostradoEn = Date.now();
  if (!dlg.open) dlg.showModal();
}

// Sale al abrir la app y, mientras siga abierta, como mucho cada 30 minutos.
function maybeShowPendingPopup(alerts) {
  if (!alerts || !((alerts.pending || 0) + (alerts.pending_tasks || 0))) return;
  try { if (localStorage.getItem("brujula_pending_snooze") === isoDate()) return; } catch (_) {}
  if (document.querySelector("dialog[open]")) return; // no encimar sobre otra ventana
  if (pendientesMostradoEn && Date.now() - pendientesMostradoEn < 30 * 60 * 1000) return;
  showPendingPopup(alerts);
}

function recordados() {
  try { return JSON.parse(localStorage.getItem("brujula_recordados") || "{}"); } catch (_) { return {}; }
}

function marcarRecordado(clave) {
  const r = recordados();
  r[clave] = Date.now();
  for (const k of Object.keys(r)) if (Date.now() - r[k] > 2 * 86400000) delete r[k];
  try { localStorage.setItem("brujula_recordados", JSON.stringify(r)); } catch (_) {}
}

// Recordatorio a la hora: 10 minutos antes (o al abrir, si ya empezó hace menos de una hora).
function checkTaskReminders() {
  const tareas = (state.alerts?.tasks_today || []).filter((t) => t.due_time);
  if (!tareas.length) return;
  // No interrumpir otra ventana (pendientes, editar un contacto…): se avisa en la siguiente revisión.
  const abierta = document.querySelector("dialog[open]");
  if (abierta && abierta.id !== "reminderDialog") return;
  const ahora = new Date();
  const hoy = isoDate();
  const yaRecordadas = recordados();
  const tocan = [];
  for (const t of tareas) {
    const [h, m] = String(t.due_time).split(":").map(Number);
    const hora = new Date(ahora);
    hora.setHours(h, m || 0, 0, 0);
    const minutos = (hora - ahora) / 60000;
    const clave = `${t.id}:${hoy}:${t.due_time}`;
    if (minutos <= AVISO_ANTICIPO_MIN && minutos > -60 && !yaRecordadas[clave]) tocan.push({ ...t, minutos, clave });
  }
  if (!tocan.length) return;
  tocan.forEach((t) => marcarRecordado(t.clave));
  showReminder(tocan);
  for (const t of tocan) {
    const cuando = t.minutos > 1 ? `En ${Math.round(t.minutos)} minutos` : t.minutos >= -1 ? "Es hora" : `Era a las ${horaLegible(t.due_time)}`;
    const cuerpo = [t.detail, t.contact_name ? `Con ${t.contact_name}` : ""].filter(Boolean).join(" · ") || "Abre tu agenda en BRÚJULA.";
    systemNotify(`${cuando}: ${t.title}`, cuerpo, { tag: `brujula-tarea-${t.id}`, url: "/#agenda" });
  }
}

function showReminder(tareas) {
  const dlg = $("#reminderDialog");
  if (!dlg) return;
  const primera = tareas[0];
  const titulo = tareas.length > 1 ? `${tareas.length} actividades por empezar`
    : primera.minutos > 1 ? `En ${Math.round(primera.minutos)} minutos`
    : primera.minutos >= -1 ? "Es hora de tu actividad" : "Tienes una actividad en curso";
  const items = tareas.map(pendingTaskItem).join("");
  const lista = $("#reminderList");
  if (dlg.open) {
    lista.insertAdjacentHTML("beforeend", items);
    $("#reminderTitle").textContent = `${lista.children.length} actividades por empezar`;
    return;
  }
  $("#reminderTitle").textContent = titulo;
  lista.innerHTML = items;
  dlg.showModal();
}

// Tras una acción dentro de la ventana de pendientes, mostrar lo que queda.
function refreshPendingPopup() {
  const dlg = $("#pendingDialog");
  if (!dlg?.open) return;
  const quedan = (state.alerts?.pending || 0) + (state.alerts?.pending_tasks || 0);
  if (quedan) showPendingPopup(state.alerts);
  else { dlg.close(); toast("¡Estás al día! No te quedan pendientes 🎉", "success"); }
}

async function completePendingTask(id, boton) {
  boton.disabled = true;
  try {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
    boton.closest("li")?.classList.add("is-done");
    boton.textContent = "✔ Hecha";
    toast("¡Actividad completada!", "success");
    await loadDashboard();
    refreshPendingPopup();
  } catch (error) {
    boton.disabled = false;
    toast(error.message, "error");
  }
}

async function postponeTask(id, boton) {
  boton.disabled = true;
  try {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ due_date: isoPlusDays(1) }) });
    boton.closest("li")?.classList.add("is-done");
    toast("Actividad pasada a mañana", "success");
    await loadDashboard();
    refreshPendingPopup();
  } catch (error) {
    boton.disabled = false;
    toast(error.message, "error");
  }
}

// Abrir algo desde la ventana de pendientes y regresar a ella al terminar.
function leavePendingFor(abrir) {
  state.reopenPending = true;
  document.querySelectorAll("#pendingDialog[open], #reminderDialog[open]").forEach((d) => d.close());
  abrir();
}

async function returnToPending() {
  if (!state.reopenPending) return;
  state.reopenPending = false;
  state.followupFromTask = null;
  await loadDashboard();
  if (document.querySelector("dialog[open]")) return;
  const quedan = (state.alerts?.pending || 0) + (state.alerts?.pending_tasks || 0);
  if (quedan) showPendingPopup(state.alerts);
  else toast("¡Estás al día! No te quedan pendientes 🎉", "success");
}

// Campana y botón "Ver pendientes": reabrir la ventana cuando se quiera.
function openPendingManually() {
  const quedan = (state.alerts?.pending || 0) + (state.alerts?.pending_tasks || 0);
  if (!quedan) { toast("No tienes pendientes por ahora 🎉", "success"); return; }
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  showPendingPopup(state.alerts);
}

function setupAvisos() {
  registerServiceWorker();
  $$("[data-close-pending]").forEach((b) => b.addEventListener("click", () => $("#pendingDialog").close()));
  $$("[data-close-reminder]").forEach((b) => b.addEventListener("click", () => $("#reminderDialog").close()));
  $("#pendingSnooze").addEventListener("click", () => {
    try { localStorage.setItem("brujula_pending_snooze", isoDate()); } catch (_) {}
    $("#pendingDialog").close();
    toast("Hoy ya no te lo muestro al abrir. Los recordatorios a la hora siguen activos.", "info");
  });
  $("#pendingGoAgenda").addEventListener("click", () => { $("#pendingDialog").close(); goToView("agenda"); });
  $("#reminderGoAgenda").addEventListener("click", () => { $("#reminderDialog").close(); goToView("agenda"); });
  $("#pendingNotifyButton").addEventListener("click", requestNotifyPermission);
  $("#pendingDialog").addEventListener("close", () => setTimeout(checkTaskReminders, 300));
  for (const id of ["#pendingDialog", "#reminderDialog"]) {
    $(id).addEventListener("click", async (event) => {
      const b = event.target.closest("[data-pending-done],[data-pending-postpone],[data-pending-follow-task],[data-pending-edit],[data-pending-contact],[data-pending-postpone-contact]");
      if (!b) return;
      const ds = b.dataset;
      if (ds.pendingDone) { completePendingTask(Number(ds.pendingDone), b); return; }
      if (ds.pendingPostpone) { postponeTask(Number(ds.pendingPostpone), b); return; }
      if (ds.pendingPostponeContact) {
        b.disabled = true;
        await postponeAlert(Number(ds.pendingPostponeContact));
        refreshPendingPopup();
        return;
      }
      if (ds.pendingFollowTask) {
        // Registrar el seguimiento con la persona deja la actividad como hecha.
        state.followupFromTask = { taskId: Number(ds.pendingFollowTask), contactId: Number(ds.contactId) };
        leavePendingFor(() => openContactDialog(Number(ds.contactId), true));
        return;
      }
      if (ds.pendingEdit) { leavePendingFor(() => openTaskDialog(Number(ds.pendingEdit))); return; }
      if (ds.pendingContact) { leavePendingFor(() => openContactDialog(Number(ds.pendingContact), true)); }
    });
  }
  // Al cerrar la ficha o la actividad abiertas desde los pendientes, volver a la ventana.
  $("#contactDialog").addEventListener("close", () => setTimeout(returnToPending, 150));
  $("#taskDialog").addEventListener("close", () => setTimeout(returnToPending, 150));
  $("#openPendingButton").addEventListener("click", openPendingManually);
  $("#agendaPendingButton").addEventListener("click", openPendingManually);
  // Tocar un aviso del sistema puede cambiar la sección (#agenda) con la app abierta.
  window.addEventListener("hashchange", () => { const vista = location.hash.replace("#", ""); if (viewTitles[vista]) goToView(vista); });
  setInterval(checkTaskReminders, 30 * 1000);
  setInterval(() => { if (!document.hidden) loadDashboard(); }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadDashboard(); });
}

// --- Historial de seguimientos en la ficha ----------------------------------

async function loadFollowups(contactId) {
  const lista = $("#followupTimeline");
  lista.innerHTML = `<li class="followup-loading">Cargando seguimientos…</li>`;
  try {
    const seguimientos = await api(`/api/contacts/${contactId}/followups`);
    renderFollowupTimeline(seguimientos);
  } catch (error) {
    lista.innerHTML = `<li class="followup-empty">No pude cargar el historial.</li>`;
  }
}

function renderFollowupTimeline(seguimientos) {
  const lista = $("#followupTimeline");
  if (!seguimientos.length) {
    lista.innerHTML = `<li class="followup-empty">Aún no hay seguimientos. Registra el primero arriba.</li>`;
    return;
  }
  lista.innerHTML = seguimientos.map((s) => `
    <li class="followup-entry">
      <span class="followup-dot">${channelIcons[s.channel] || "•"}</span>
      <div class="followup-entry-body">
        <div class="followup-entry-head"><strong>${escapeHtml(s.channel)}</strong><time>${shortDate(s.followup_date)} · ${relativeDay(s.followup_date)}</time></div>
        ${s.note ? `<p>${escapeHtml(s.note)}</p>` : `<p class="followup-nonote">Sin nota.</p>`}
      </div>
      <button class="row-action danger" data-followup-del="${s.id}" title="Eliminar seguimiento">🗑</button>
    </li>`).join("");
  $$("[data-followup-del]").forEach((b) => b.addEventListener("click", () => deleteFollowup(Number(b.dataset.followupDel))));
}

async function submitFollowup() {
  const contactId = state.editingContactId;
  if (!contactId) return;
  const note = $("#followupNote").value.trim();
  const nextDate = $("#followupNextDate").value;
  const nextAction = $("#followupNextAction").value.trim();
  if (!note && !nextAction) { toast("Escribe qué pasó o agenda el siguiente paso.", "error"); return; }
  const payload = {
    followup_date: $("#followupDate").value || isoDate(),
    channel: $("#followupChannel").value,
    note,
    next_action: nextAction,
    next_action_date: nextDate || "",
  };
  await withLoading($("#followupAddButton"), async () => {
    try {
      const result = await api(`/api/contacts/${contactId}/followups`, { method: "POST", body: JSON.stringify(payload) });
      $("#followupNote").value = "";
      $("#followupNextAction").value = "";
      $("#followupNextDate").value = "";
      // Reflejar en la ficha abierta el nuevo "próximo paso" por si se agendó.
      if (result.contact) {
        if ($("#contactForm").elements.next_action) $("#contactForm").elements.next_action.value = result.contact.next_action || "";
        if ($("#contactForm").elements.next_action_date) $("#contactForm").elements.next_action_date.value = result.contact.next_action_date || "";
      }
      // Si se llegó desde una actividad de la agenda con esta persona, queda como hecha.
      const desdeActividad = state.followupFromTask;
      if (desdeActividad && desdeActividad.contactId === contactId) {
        state.followupFromTask = null;
        try {
          await api(`/api/tasks/${desdeActividad.taskId}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
          toast("Seguimiento registrado y actividad marcada como hecha +10 XP", "success");
        } catch (_) {
          toast("Seguimiento registrado +10 XP (no pude marcar la actividad como hecha)", "info");
        }
      } else {
        toast("Seguimiento registrado +10 XP", "success");
      }
      await loadFollowups(contactId);
      await Promise.all([loadDashboard(), loadContacts()]);
    } catch (error) { toast(error.message, "error"); }
  });
}

async function deleteFollowup(followupId) {
  const ok = await confirmar({ title: "Eliminar seguimiento", message: "Se borra este registro del historial. Esta acción no se puede deshacer.", confirmText: "Sí, eliminar" });
  if (!ok) return;
  try {
    await api(`/api/followups/${followupId}`, { method: "DELETE" });
    toast("Seguimiento eliminado", "success");
    if (state.editingContactId) await loadFollowups(state.editingContactId);
  } catch (error) { toast(error.message, "error"); }
}

// --- Testimonios en video (catálogo) ----------------------------------------

let testimonialsTimer = null;
let testimonialsSeq = 0;

function loadTestimonials() {
  const input = $("#testimonialSearch");
  if (!input.dataset.wired) {
    input.dataset.wired = "1";
    input.addEventListener("input", () => {
      clearTimeout(testimonialsTimer);
      testimonialsTimer = setTimeout(() => searchTestimonials(input.value), 250);
    });
    $("#testimonialList").addEventListener("click", (event) => {
      const boton = event.target.closest("[data-copy-text]");
      if (boton) copyTestimonialLink(boton);
    });
  }
  searchTestimonials(input.value || "");
}

async function searchTestimonials(query) {
  const lista = $("#testimonialList");
  const hint = $("#testimonialsHint");
  // Si llega tarde la respuesta de una búsqueda anterior, no debe pisar la actual.
  const seq = ++testimonialsSeq;
  setBusy("#testimonialList", true);
  try {
    const data = await api(`/api/testimonials?q=${encodeURIComponent(query.trim())}`);
    if (seq !== testimonialsSeq) return;
    $("#testimonialsTotal").textContent = `${data.total_catalog} videos`;
    const q = (query || "").trim();
    hint.hidden = false;
    if (!q) {
      hint.textContent = `Hay ${data.total_catalog} testimonios en el catálogo. Escribe un padecimiento o una palabra para filtrarlos.`;
    } else if (data.generic) {
      hint.textContent = `“${q}” aparece en casi todos los videos. Agrega un padecimiento o algo más específico, por ejemplo “diabetes” o “dolor de rodilla”.`;
    } else if (data.count === 0) {
      hint.textContent = `No encontramos testimonios para “${q}”. Prueba con otra palabra o un padecimiento más general.`;
    } else {
      const total = data.total_matches ?? data.count;
      const mostrados = data.count < total ? ` Te muestro los ${data.count} más relevantes.` : "";
      const sinonimos = (data.expansions || []).map((e) => e.synonyms.slice(0, 5).join(", ")).filter(Boolean);
      const extra = sinonimos.length ? ` También busqué: ${sinonimos.join(" · ")}.` : "";
      hint.textContent = `${total} ${total === 1 ? "testimonio" : "testimonios"} para “${q}”.${mostrados}${extra}`;
    }
    lista.innerHTML = data.results.map(testimonialCard).join("");
  } catch (error) {
    if (seq !== testimonialsSeq) return;
    lista.innerHTML = `<p class="empty-state">No pudimos cargar los testimonios. ${escapeHtml(error.message)}</p>`;
  } finally { if (seq === testimonialsSeq) setBusy("#testimonialList", false); }
}

function testimonialCard(t) {
  const categoria = t.category && t.category !== "(raíz)" ? t.category : "General";
  const titulo = t.name.replace(/\.(webm|mkv|mp4|mov|avi)$/i, "");
  const coincide = (t.matched || []).map((m) => {
    const motivo = m.synonym_of ? `${m.term} (por “${m.synonym_of}”)` : m.term;
    return `<span class="match-chip ${m.where === "video" ? "match-video" : "match-title"}" title="${m.where === "video" ? "Lo dice en el video" : "Está en el título"}">${m.where === "video" ? "🎙" : "🏷"} ${escapeHtml(motivo)}</span>`;
  }).join("");
  const s = t.snippet;
  const fragmento = s ? `<p class="testimonial-snippet"><small>Lo dice en el video:</small> “${escapeHtml(s.before)}<mark>${escapeHtml(s.match)}</mark>${escapeHtml(s.after)}”</p>` : "";
  // Mensaje listo para WhatsApp: la persona solo elige a quién mandarlo.
  const mensaje = `Te comparto este testimonio: ${titulo}\n${t.link}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  return `<article class="testimonial-card">
    <span class="testimonial-icon">▶</span>
    <div class="testimonial-body">
      <strong>${escapeHtml(titulo)}</strong>
      <div class="testimonial-tags"><span class="testimonial-cat">${escapeHtml(categoria)}</span>${coincide}</div>
      ${fragmento}
    </div>
    <div class="testimonial-actions">
      <a class="primary-button tiny" href="${escapeHtml(t.link)}" target="_blank" rel="noopener">Ver video →</a>
      <a class="whatsapp-button" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener" aria-label="Enviar ${escapeHtml(titulo)} por WhatsApp">WhatsApp</a>
      <button type="button" class="copy-link-button" data-copy-text="${escapeHtml(mensaje)}" aria-label="Copiar enlace de ${escapeHtml(titulo)}">Copiar enlace</button>
    </div>
  </article>`;
}

function copyWithTextarea(texto) {
  // Respaldo para navegadores que no permiten el portapapeles moderno.
  const area = document.createElement("textarea");
  area.value = texto; area.setAttribute("readonly", "");
  area.style.position = "fixed"; area.style.top = "0"; area.style.opacity = "0";
  document.body.appendChild(area);
  area.select(); area.setSelectionRange(0, texto.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
  area.remove();
  return ok;
}

async function copyTestimonialLink(boton) {
  const texto = boton.dataset.copyText || "";
  let ok = false;
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(texto); ok = true; } catch (_) { ok = false; }
  }
  if (!ok) ok = copyWithTextarea(texto);
  if (!ok) {
    toast("No pude copiar el enlace en este navegador. Usa el botón de WhatsApp o mantén presionado “Ver video”.", "error");
    return;
  }
  const original = boton.textContent;
  boton.textContent = "¡Copiado!";
  boton.classList.add("copied");
  setTimeout(() => { boton.textContent = original; boton.classList.remove("copied"); }, 1600);
  toast("Enlace copiado: pégalo donde quieras compartirlo", "success");
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

async function openContactDialog(contactId = null, focusFollowups = false) {
  const form = $("#contactForm");
  form.reset();
  state.editingContactId = contactId;
  let contact = contactId ? state.contacts.find((item) => item.id === contactId) : null;
  // Desde el tablero la lista de la red no está cargada: traemos la persona directo.
  if (contactId && !contact) {
    try { contact = await api(`/api/contacts/${contactId}`); } catch (_) { contact = null; }
  }
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
  // Sección de seguimientos: solo tiene sentido en una persona ya guardada.
  const seccion = $("#contactFollowups");
  if (contact) {
    seccion.hidden = false;
    $("#followupDate").value = isoDate();
    $("#followupNote").value = "";
    $("#followupNextAction").value = "";
    $("#followupNextDate").value = "";
    $("#followupTimeline").innerHTML = "";
    loadFollowups(contact.id);
  } else {
    seccion.hidden = true;
  }
  $("#contactDialog").showModal();
  if (contact && focusFollowups) {
    requestAnimationFrame(() => seccion.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
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

// Cinco afirmaciones por perfil, intercaladas para que no se note el patrón.
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
  ["analyst", "Prefiero explicar el porqué antes de pedir una decisión."],
  ["executor", "Prefiero empezar y ajustar sobre la marcha."],
  ["connection", "Me resulta fácil iniciar una conversación con un desconocido."],
  ["constancy", "Cumplo lo que me comprometo, aunque ese día no tenga ganas."],
  ["leadership", "Me buscan cuando alguien necesita orientación."],
  ["analyst", "Me tomo el tiempo de estudiar el producto a fondo."],
  ["executor", "Me cuesta quedarme quieta cuando hay algo por hacer."],
  ["connection", "Prefiero escuchar a la persona antes de proponerle algo."],
  ["constancy", "Prefiero avanzar un poco todos los días que mucho de golpe."],
  ["leadership", "Me interesa enseñar lo que voy aprendiendo."],
  ["analyst", "Me siento más segura cuando domino el tema del que hablo."],
  ["executor", "Me motiva ver resultados en el corto plazo."],
  ["connection", "Recuerdo los detalles personales de la gente que trato."],
  ["constancy", "Llevo registro de mis actividades y mis resultados."],
  ["leadership", "Pienso en cómo hacer crecer al equipo, no solo a mí."],
];

const quizScale = ["Nunca", "Casi nunca", "A veces", "Casi siempre", "Siempre"];

function buildQuiz() {
  $("#quizQuestions").innerHTML = quizStatements.map(([profile, statement], index) => `
    <div class="quiz-question">
      <p><b>${index + 1}.</b> ${statement}</p>
      <div class="quiz-options">
        ${[1, 2, 3, 4, 5].map((value) => `
          <label title="${quizScale[value - 1]}">
            <input type="radio" name="q${index}" value="${value}" data-profile="${profile}" ${value === 3 ? "checked" : ""}>
            <span>${value}</span>
          </label>`).join("")}
      </div>
    </div>`).join("");
  $("#quizProgress").textContent = `${quizStatements.length} afirmaciones`;
}

async function submitQuiz(event) {
  event.preventDefault();
  const scores = { analyst: 0, executor: 0, connection: 0, constancy: 0, leadership: 0 };
  const preguntasPorPerfil = {};
  quizStatements.forEach(([profile], index) => {
    scores[profile] += Number($(`input[name="q${index}"]:checked`).value);
    preguntasPorPerfil[profile] = (preguntasPorPerfil[profile] || 0) + 1;
  });
  // Se normaliza a la escala de 0 a 40 de la rueda, sin importar cuántas
  // afirmaciones tenga cada perfil: así se pueden agregar más sin romper nada.
  Object.keys(scores).forEach((key) => {
    const maximo = (preguntasPorPerfil[key] || 1) * 5;
    scores[key] = Math.round((scores[key] / maximo) * 40);
  });
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
  $("#followupAddButton").addEventListener("click", submitFollowup);
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
  $("#logoutButton").addEventListener("click", logout);
  $("#passwordForm").addEventListener("submit", submitPassword);
  $$('[data-close-password]').forEach((b) => b.addEventListener("click", () => $("#passwordDialog").close()));
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
  $("#avatarControls").addEventListener("change", refreshAvatarPreview);
  $("#avatarRandom").addEventListener("click", randomizeAvatar);
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

async function loadAccount() {
  try {
    const cuenta = await api("/api/auth/me");
    state.account = cuenta;
    $("#accountEmail").textContent = cuenta.email;
    if (cuenta.must_change_password) {
      $("#passwordHint").textContent = "Estás usando la contraseña temporal que te compartieron. Cámbiala por una que solo tú conozcas.";
      $("#passwordDialog").showModal();
    }
  } catch { /* Si no hay sesión, api() ya redirigió al login. */ }
}

async function logout() {
  const ok = await confirmar({
    title: "Cerrar sesión",
    message: "Vas a salir de BRÚJULA. Tus datos quedan guardados.",
    confirmText: "Sí, salir",
    danger: false,
  });
  if (!ok) return;
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch { /* Aunque falle, conviene mandar al login. */ }
  location.href = "/login";
}

async function submitPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  limpiarErrores(form);
  if (!data.current_password) return marcarError(form, "current_password", "Escribe tu contraseña actual.");
  if ((data.new_password || "").length < 10) return marcarError(form, "new_password", "La contraseña nueva debe tener al menos 10 caracteres.");
  if (data.new_password !== data.repeat_password) return marcarError(form, "repeat_password", "Las dos contraseñas no coinciden.");
  await withLoading($("#passwordSubmit"), async () => {
    try {
      const resultado = await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password }),
      });
      $("#passwordDialog").close();
      form.reset();
      toast(resultado.message, "success");
      if (state.account) state.account.must_change_password = false;
    } catch (error) { toast(error.message, "error"); }
  });
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
  setupAvisos();
  setupAgenda();
  applyTodayLabels();
  restoreGuideChecklist();
  // Sin una sección en la dirección, la app abre directo en Mi red.
  const initialView = location.hash.replace("#", "");
  goToView(viewTitles[initialView] ? initialView : "contacts");
  await loadAccount();
  await loadRanks();
  await Promise.all([loadDashboard(), loadMetrics(), showStorageMode()]);
}

init();
