const SUBJECTS = [
  "Arquitectura en Computadoras",
  "Integración Tecnológico Académica",
  "Base de Datos I",
  "Programación I",
  "Diseño de Objetos",
  "Diseño de Interfaces",
];

const SUBJECT_METADATA = [
  {
    name: SUBJECTS[0],
    aliases: ["arquitectura en computadoras", "arquitectura", "computadoras"],
  },
  {
    name: SUBJECTS[1],
    aliases: [
      "integracion tecnologico academica",
      "integracion academica",
      "integracion",
      "ita",
    ],
  },
  {
    name: SUBJECTS[2],
    aliases: ["base de datos i", "base de datos", "bd1", "sql"],
  },
  {
    name: SUBJECTS[3],
    aliases: ["programacion i", "programacion", "algoritmos"],
  },
  {
    name: SUBJECTS[4],
    aliases: ["diseno de objetos", "diseño de objetos", "objetos", "poo"],
  },
  {
    name: SUBJECTS[5],
    aliases: ["diseno de interfaces", "diseño de interfaces", "interfaces", "interfaz"],
  },
];

const STORAGE_KEY = "uces-upcoming-assignments";
const ALERTS_KEY = "uces-upcoming-alerts";

const state = {
  assignments: [],
  filter: "all",
};

const form = document.getElementById("assignmentForm");
const subjectSelect = document.getElementById("subject");
const list = document.getElementById("assignmentList");
const totalCount = document.getElementById("totalCount");
const upcomingCount = document.getElementById("upcomingCount");
const overdueCount = document.getElementById("overdueCount");
const notificationText = document.getElementById("notificationText");
const enableNotificationsBtn = document.getElementById("enableNotificationsBtn");
const loadExampleBtn = document.getElementById("loadExampleBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const emptyStateTemplate = document.getElementById("emptyStateTemplate");
const importStatus = document.getElementById("importStatus");
const subjectsMenuBtn = document.getElementById("subjectsMenuBtn");
const remindersMenuBtn = document.getElementById("remindersMenuBtn");
const subjectsDropdown = document.getElementById("subjectsDropdown");
const remindersDropdown = document.getElementById("remindersDropdown");
const subjectSections = document.getElementById("subjectSections");

init();

function init() {
  loadSubjects();
  state.assignments = loadAssignments();
  bindEvents();
  bindImportBridge();
  updateImportStatus(
    "Esperando actividades próximas importadas desde una unidad de la materia o desde la sección ACTIVIDADES de Campus UCES."
  );
  render();
  updateNotificationUI();
  checkUpcomingNotifications();
  setInterval(checkUpcomingNotifications, 60 * 1000);
}

function loadSubjects() {
  subjectSelect.innerHTML = SUBJECTS.map(
    (subject) => `<option value="${subject}">${subject}</option>`
  ).join("");
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  enableNotificationsBtn.addEventListener("click", requestNotificationPermission);
  loadExampleBtn.addEventListener("click", loadExampleData);
  clearAllBtn.addEventListener("click", clearAll);
  subjectsMenuBtn?.addEventListener("click", () => toggleDropdown("subjects"));
  remindersMenuBtn?.addEventListener("click", () => toggleDropdown("reminders"));

  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      applyFilter(button.dataset.filter || "all");
    });
  });

  subjectsDropdown?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-subject-anchor]");
    if (!link) {
      return;
    }

    subjectSelect.value = link.dataset.subjectValue || SUBJECTS[0];
    closeDropdowns();
  });

  remindersDropdown?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reminder-id]");
    if (!button) {
      return;
    }

    const reminderId = button.dataset.reminderId;
    applyFilter("upcoming");
    closeDropdowns();

    const target = list.querySelector(`[data-assignment-id="${reminderId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-dropdown")) {
      closeDropdowns();
    }
  });

  list.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    const id = event.target.dataset.id;

    if (!action || !id) {
      return;
    }

    if (action === "toggle") {
      toggleCompleted(id);
    }

    if (action === "delete") {
      deleteAssignment(id);
    }
  });
}

function bindImportBridge() {
  window.addEventListener("message", (event) => {
    const payload = event.data;

    if (!payload || payload.type !== "UCES_IMPORT_ACTIVITIES") {
      return;
    }

    const importedCount = importAssignmentsFromCampus(payload.assignments || []);
    updateImportStatus(
      importedCount
        ? `Se importaron ${importedCount} actividades próximas desde Campus UCES.`
        : "No se encontraron actividades nuevas para importar desde Campus UCES."
    );
  });

  window.importUCESActivities = (assignments = []) => {
    const importedCount = importAssignmentsFromCampus(assignments);
    updateImportStatus(
      importedCount
        ? `Se importaron ${importedCount} actividades próximas desde Campus UCES.`
        : "No se encontraron actividades nuevas para importar desde Campus UCES."
    );
    return importedCount;
  };
}

function updateImportStatus(message) {
  if (importStatus) {
    importStatus.textContent = message;
  }
}

function importAssignmentsFromCampus(items) {
  if (!Array.isArray(items) || !items.length) {
    return 0;
  }

  let importedCount = 0;

  items.forEach((item) => {
    const normalized = normalizeImportedAssignment(item);

    if (!normalized || isDuplicateAssignment(normalized)) {
      return;
    }

    state.assignments.push(normalized);
    importedCount += 1;
  });

  if (importedCount) {
    persistAssignments();
    render();
    checkUpcomingNotifications(true);
  }

  return importedCount;
}

function normalizeImportedAssignment(item) {
  const rawText = [
    item?.title,
    item?.subject,
    item?.sourceSubject,
    item?.course,
    item?.materia,
    item?.notes,
    item?.context,
  ]
    .filter(Boolean)
    .join(" · ");
  const title = String(item?.title || item?.name || item?.activity || "Actividad Campus")
    .trim();
  const subject = inferSubject(
    item?.subject || item?.sourceSubject || item?.course || item?.materia || "",
    item?.context || rawText
  );
  const dueAt = normalizeDueAt(
    item?.dueAt || item?.dueDate || item?.deadline || item?.fecha || item?.date
  );

  if (!title || !dueAt) {
    return null;
  }

  if (new Date(dueAt).getTime() < Date.now()) {
    return null;
  }

  const notes = [
    "Importado desde Campus UCES",
    item?.status ? `Estado: ${String(item.status).trim()}` : "",
    item?.notes ? String(item.notes).trim() : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: createId(),
    title,
    subject,
    dueAt,
    notes,
    sourceContext: item?.context || "",
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

function normalizeDueAt(value) {
  if (!value) {
    return "";
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");
    const hours = String(parsedDate.getHours()).padStart(2, "0");
    const minutes = String(parsedDate.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const match = text.match(
    /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\D+(\d{1,2})[:.](\d{2}))?/
  );

  if (!match) {
    return "";
  }

  const [, day, month, year, hours = "23", minutes = "59"] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;

  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resolveExactSubject(value) {
  const normalizedValue = normalizeText(value || "");
  if (!normalizedValue) {
    return "";
  }

  const exactMatch = SUBJECT_METADATA.find(
    (entry) =>
      normalizedValue === normalizeText(entry.name) ||
      entry.aliases.some((alias) => normalizedValue === normalizeText(alias))
  );

  return exactMatch?.name || "";
}

function detectSubjectFromText(value) {
  const normalizedValue = normalizeText(value || "");
  if (!normalizedValue) {
    return "";
  }

  const bestMatch = SUBJECT_METADATA.map((entry) => ({
    name: entry.name,
    score: entry.aliases.reduce((total, alias) => {
      const normalizedAlias = normalizeText(alias);
      return total + (normalizedValue.includes(normalizedAlias) ? normalizedAlias.length : 0);
    }, 0),
  })).sort((a, b) => b.score - a.score)[0];

  return bestMatch?.score ? bestMatch.name : "";
}

function inferSubject(value, fallbackContext = "") {
  const exactSubject = resolveExactSubject(value);
  if (exactSubject) {
    return exactSubject;
  }

  const detectedSubject = detectSubjectFromText(`${value || ""} ${fallbackContext || ""}`);
  if (detectedSubject) {
    return detectedSubject;
  }

  const fallback = String(value || fallbackContext || "").trim();
  return fallback && fallback.length <= 60 ? fallback : "Campus UCES";
}

function getAssignmentSubject(item) {
  return inferSubject(item?.subject || "", `${item?.sourceContext || ""} ${item?.title || ""} ${item?.notes || ""}`);
}

function isDuplicateAssignment(candidate) {
  return state.assignments.some(
    (item) =>
      normalizeText(item.title) === normalizeText(candidate.title) &&
      normalizeText(getAssignmentSubject(item)) === normalizeText(getAssignmentSubject(candidate)) &&
      item.dueAt === candidate.dueAt
  );
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toggleDropdown(type) {
  const isSubjects = type === "subjects";
  const targetMenu = isSubjects ? subjectsDropdown : remindersDropdown;
  const targetButton = isSubjects ? subjectsMenuBtn : remindersMenuBtn;

  if (!targetMenu || !targetButton) {
    return;
  }

  const shouldOpen = !targetMenu.classList.contains("open");
  closeDropdowns();

  if (shouldOpen) {
    targetMenu.classList.add("open");
    targetButton.setAttribute("aria-expanded", "true");
  }
}

function closeDropdowns() {
  subjectsDropdown?.classList.remove("open");
  remindersDropdown?.classList.remove("open");
  subjectsMenuBtn?.setAttribute("aria-expanded", "false");
  remindersMenuBtn?.setAttribute("aria-expanded", "false");
}

function applyFilter(filter) {
  state.filter = filter;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  renderAssignments();
}

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const title = formData.get("title")?.toString().trim();
  const subject = formData.get("subject")?.toString().trim();
  const dueDate = formData.get("dueDate")?.toString();
  const dueTime = formData.get("dueTime")?.toString() || "23:59";
  const notes = formData.get("notes")?.toString().trim() || "";

  if (!title || !subject || !dueDate) {
    return;
  }

  state.assignments.push({
    id: createId(),
    title,
    subject,
    dueAt: `${dueDate}T${dueTime}`,
    notes,
    completed: false,
    createdAt: new Date().toISOString(),
  });

  persistAssignments();
  form.reset();
  document.getElementById("dueTime").value = "23:59";
  render();
  checkUpcomingNotifications();
}

function render() {
  renderStats();
  renderHeaderMenus();
  renderAssignments();
  renderSubjectSections();
}

function renderHeaderMenus() {
  if (subjectsDropdown) {
    subjectsDropdown.innerHTML = SUBJECTS.map((subject) => {
      const anchorId = createSubjectAnchorId(subject);
      const totalBySubject = state.assignments.filter(
        (item) => getAssignmentSubject(item) === subject
      ).length;

      return `
        <a
          class="dropdown-item dropdown-link"
          href="#${anchorId}"
          data-subject-anchor="${anchorId}"
          data-subject-value="${escapeHtml(subject)}"
        >
          <strong>${escapeHtml(subject)}</strong>
          <small>${totalBySubject} actividad${totalBySubject === 1 ? "" : "es"}</small>
        </a>
      `;
    }).join("");
  }

  const upcomingAssignments = state.assignments
    .filter((item) => !item.completed && new Date(item.dueAt) >= new Date())
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5);

  if (remindersMenuBtn) {
    remindersMenuBtn.textContent = `Recordatorios${upcomingAssignments.length ? ` (${upcomingAssignments.length})` : ""} ▾`;
  }

  if (!remindersDropdown) {
    return;
  }

  if (!upcomingAssignments.length) {
    remindersDropdown.innerHTML = `
      <div class="dropdown-empty">
        No hay entregas próximas por ahora.
      </div>
    `;
    return;
  }

  remindersDropdown.innerHTML = upcomingAssignments
    .map((item) => {
      const status = getStatus(item);
      return `
        <button class="dropdown-item reminder-dropdown-item" type="button" data-reminder-id="${item.id}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(getAssignmentSubject(item))}</span>
          <small>${formatDue(item.dueAt)} · ${status.relative}</small>
        </button>
      `;
    })
    .join("");
}

function createSubjectAnchorId(subject) {
  return `subject-${normalizeText(subject).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function renderSubjectSections() {
  if (!subjectSections) {
    return;
  }

  subjectSections.innerHTML = SUBJECTS.map((subject) => {
    const items = state.assignments
      .filter((item) => getAssignmentSubject(item) === subject)
      .sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return new Date(a.dueAt) - new Date(b.dueAt);
      });

    const upcomingForSubject = items.filter(
      (item) => !item.completed && new Date(item.dueAt) >= new Date()
    ).length;

    return `
      <section id="${createSubjectAnchorId(subject)}" class="subject-section">
        <div class="subject-section-header">
          <div>
            <h3>${escapeHtml(subject)}</h3>
            <p>
              ${items.length ? `${upcomingForSubject} próxima${upcomingForSubject === 1 ? "" : "s"} · ${items.length} total` : "Sin actividades cargadas todavía."}
            </p>
          </div>
          <span class="subject-count">${items.length}</span>
        </div>

        <div class="subject-assignments">
          ${
            items.length
              ? items
                  .map((item) => {
                    const status = getStatus(item);
                    return `
                      <article class="subject-card">
                        <div class="assignment-top">
                          <div>
                            <h4>${escapeHtml(item.title)}</h4>
                            <p class="subject">${escapeHtml(getAssignmentSubject(item))}</p>
                          </div>
                          <span class="badge ${status.type}">${status.label}</span>
                        </div>
                        <div class="item-meta">
                          <span>⏰ ${formatDue(item.dueAt)}</span>
                          <span>${status.relative}</span>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : '<div class="subject-empty">No hay actividades registradas para esta materia.</div>'
          }
        </div>
      </section>
    `;
  }).join("");
}

function renderStats() {
  const now = new Date();
  const pending = state.assignments.filter((item) => !item.completed);
  const upcoming = pending.filter((item) => {
    const diff = new Date(item.dueAt).getTime() - now.getTime();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  });
  const overdue = pending.filter((item) => new Date(item.dueAt) < now);

  totalCount.textContent = String(state.assignments.length);
  upcomingCount.textContent = String(upcoming.length);
  overdueCount.textContent = String(overdue.length);
}

function renderAssignments() {
  const filtered = getFilteredAssignments();

  if (!filtered.length) {
    list.innerHTML = emptyStateTemplate.innerHTML;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return new Date(a.dueAt) - new Date(b.dueAt);
  });

  list.innerHTML = sorted
    .map((item) => {
      const status = getStatus(item);
      const displaySubject = getAssignmentSubject(item);
      return `
        <article class="assignment-item ${item.completed ? "completed" : ""}" data-assignment-id="${item.id}">
          <div class="assignment-top">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p class="subject">${escapeHtml(displaySubject)}</p>
            </div>
            <span class="badge ${status.type}">${status.label}</span>
          </div>

          <div class="item-meta">
            <span>⏰ ${formatDue(item.dueAt)}</span>
            <span>${status.relative}</span>
          </div>

          ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ""}

          <div class="item-actions">
            <button class="secondary-btn" data-action="toggle" data-id="${item.id}" type="button">
              ${item.completed ? "Marcar pendiente" : "Completar"}
            </button>
            <button class="danger-btn" data-action="delete" data-id="${item.id}" type="button">
              Eliminar
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getFilteredAssignments() {
  const now = new Date();

  switch (state.filter) {
    case "upcoming":
      return state.assignments.filter(
        (item) => !item.completed && new Date(item.dueAt) >= now
      );
    case "overdue":
      return state.assignments.filter(
        (item) => !item.completed && new Date(item.dueAt) < now
      );
    case "completed":
      return state.assignments.filter((item) => item.completed);
    default:
      return state.assignments;
  }
}

function toggleCompleted(id) {
  state.assignments = state.assignments.map((item) =>
    item.id === id ? { ...item, completed: !item.completed } : item
  );
  persistAssignments();
  render();
}

function deleteAssignment(id) {
  state.assignments = state.assignments.filter((item) => item.id !== id);
  persistAssignments();
  render();
}

function clearAll() {
  if (!state.assignments.length) {
    return;
  }

  const confirmed = window.confirm("¿Seguro que querés borrar todas las entregas?");
  if (!confirmed) {
    return;
  }

  state.assignments = [];
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ALERTS_KEY);
  render();
}

function loadExampleData() {
  if (state.assignments.length) {
    const confirmed = window.confirm(
      "Ya hay entregas guardadas. ¿Querés agregar ejemplos de todas formas?"
    );
    if (!confirmed) {
      return;
    }
  }

  const today = new Date();
  const inDays = (days, hour) => {
    const date = new Date(today);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString().slice(0, 16);
  };

  const examples = [
    {
      id: createId(),
      title: "TP Arquitectura · Unidad 1",
      subject: SUBJECTS[0],
      dueAt: inDays(2, 19),
      notes: "Revisar consignas y subir PDF.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Foro de integración",
      subject: SUBJECTS[1],
      dueAt: inDays(4, 21),
      notes: "Responder con reflexión breve.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Ejercicio SQL",
      subject: SUBJECTS[2],
      dueAt: inDays(6, 20),
      notes: "Entregar script y capturas.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Práctica de funciones",
      subject: SUBJECTS[3],
      dueAt: inDays(8, 18),
      notes: "Subir ejercicios resueltos.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Diagrama de clases",
      subject: SUBJECTS[4],
      dueAt: inDays(10, 20),
      notes: "Entregar modelo en PDF.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Wireframe de pantalla principal",
      subject: SUBJECTS[5],
      dueAt: inDays(12, 19),
      notes: "Adjuntar prototipo y breve explicación.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ];

  state.assignments.push(...examples);
  persistAssignments();
  render();
}

function loadAssignments() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map((item) => ({
      ...item,
      subject: inferSubject(item.subject || "", `${item.sourceContext || ""} ${item.title || ""} ${item.notes || ""}`),
    }));
  } catch {
    return [];
  }
}

function persistAssignments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.assignments));
}

function getStatus(item) {
  if (item.completed) {
    return {
      type: "completed",
      label: "Completada",
      relative: "✅ Lista",
    };
  }

  const now = new Date();
  const dueDate = new Date(item.dueAt);
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    return {
      type: "overdue",
      label: "Vencida",
      relative: `Hace ${Math.abs(diffHours)} h`,
    };
  }

  if (diffHours <= 24) {
    return {
      type: "today",
      label: "Muy cerca",
      relative: diffHours <= 1 ? "En menos de 1 h" : `En ${diffHours} h`,
    };
  }

  return {
    type: "upcoming",
    label: "Próxima",
    relative: `En ${diffDays} día${diffDays === 1 ? "" : "s"}`,
  };
}

function formatDue(dateString) {
  return new Date(dateString).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    notificationText.textContent =
      "Este navegador no soporta notificaciones de escritorio.";
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotificationUI();

  if (permission === "granted") {
    checkUpcomingNotifications(true);
  }
}

function updateNotificationUI() {
  if (!("Notification" in window)) {
    enableNotificationsBtn.disabled = true;
    notificationText.textContent =
      "Este navegador no soporta notificaciones de escritorio.";
    return;
  }

  if (Notification.permission === "granted") {
    enableNotificationsBtn.textContent = "Notificaciones activadas";
    enableNotificationsBtn.disabled = true;
    notificationText.textContent =
      "Recibirás recordatorios automáticos de las entregas cercanas mientras la app esté abierta.";
    return;
  }

  if (Notification.permission === "denied") {
    enableNotificationsBtn.disabled = true;
    notificationText.textContent =
      "Las notificaciones están bloqueadas. Podés habilitarlas manualmente desde el navegador.";
    return;
  }

  enableNotificationsBtn.disabled = false;
  enableNotificationsBtn.textContent = "Activar notificaciones";
}

function checkUpcomingNotifications(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const now = new Date();
  const soon = state.assignments
    .filter((item) => !item.completed)
    .filter((item) => {
      const diff = new Date(item.dueAt).getTime() - now.getTime();
      return diff >= 0 && diff <= 48 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  if (!soon.length) {
    return;
  }

  const alerted = loadAlertedMap();
  const next = soon[0];
  const shouldNotify = force || alerted[next.id] !== next.dueAt;

  if (!shouldNotify) {
    return;
  }

  const body =
    soon.length === 1
      ? `${next.title} · ${next.subject} vence ${formatDue(next.dueAt)}.`
      : `Tenés ${soon.length} entregas próximas. La más cercana es ${next.title}, que vence ${formatDue(next.dueAt)}.`;

  new Notification("UCES · Próxima entrega", {
    body,
    tag: "uces-upcoming-reminder",
  });

  alerted[next.id] = next.dueAt;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerted));
}

function loadAlertedMap() {
  try {
    return JSON.parse(localStorage.getItem(ALERTS_KEY) || "{}");
  } catch {
    return {};
  }
}
