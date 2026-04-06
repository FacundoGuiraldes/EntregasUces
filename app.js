const SUBJECTS = [
  "Arquitectura en Computadoras",
  "Integración Tecnológico Académica",
  "Base de Datos I",
  "Programación I",
  "Diseño de Objetos",
  "Diseño de Interfaces",
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

init();

function init() {
  loadSubjects();
  state.assignments = loadAssignments();
  bindEvents();
  bindImportBridge();
  updateImportStatus(
    "Esperando actividades próximas importadas desde la sección ACTIVIDADES de Campus UCES."
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

  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      renderAssignments();
    });
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
  const rawText = [item?.title, item?.subject, item?.notes].filter(Boolean).join(" · ");
  const title = String(item?.title || item?.name || item?.activity || "Actividad Campus")
    .trim();
  const subject = inferSubject(item?.subject || item?.course || item?.materia || rawText);
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

function inferSubject(value) {
  const normalizedValue = normalizeText(value || "");
  const matched = SUBJECTS.find((subject) =>
    normalizedValue.includes(normalizeText(subject))
  );

  if (matched) {
    return matched;
  }

  const fallback = String(value || "").trim();
  return fallback && fallback.length <= 60 ? fallback : "Campus UCES";
}

function isDuplicateAssignment(candidate) {
  return state.assignments.some(
    (item) =>
      normalizeText(item.title) === normalizeText(candidate.title) &&
      normalizeText(item.subject) === normalizeText(candidate.subject) &&
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
  renderAssignments();
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
      return `
        <article class="assignment-item ${item.completed ? "completed" : ""}">
          <div class="assignment-top">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p class="subject">${escapeHtml(item.subject)}</p>
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
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
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
