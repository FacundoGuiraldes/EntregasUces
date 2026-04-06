const DEFAULT_SAMPLE_SUBJECTS = [
  "Materia de ejemplo A",
  "Materia de ejemplo B",
  "Materia de ejemplo C",
];

const STORAGE_KEY = "uces-upcoming-assignments";
const SUBJECTS_STORAGE_KEY = "uces-subjects";
const SUBJECT_SCHEDULES_KEY = "uces-subject-schedules";
const ALERTS_KEY = "uces-upcoming-alerts";
const WEEKDAY_OPTIONS = [
  { value: 0, short: "Lun", label: "Lunes" },
  { value: 1, short: "Mar", label: "Martes" },
  { value: 2, short: "Mié", label: "Miércoles" },
  { value: 3, short: "Jue", label: "Jueves" },
  { value: 4, short: "Vie", label: "Viernes" },
  { value: 5, short: "Sáb", label: "Sábado" },
  { value: 6, short: "Dom", label: "Domingo" },
];

const state = {
  assignments: [],
  subjects: [],
  subjectSchedules: {},
  filter: "all",
  editingId: null,
  calendarDate: getMonthStart(new Date()),
};

const form = document.getElementById("assignmentForm");
const subjectSelect = document.getElementById("subject");
const subjectManagerForm = document.getElementById("subjectManagerForm");
const newSubjectInput = document.getElementById("newSubjectInput");
const addSubjectBtn = document.getElementById("addSubjectBtn");
const subjectChipList = document.getElementById("subjectChipList");
const subjectCount = document.getElementById("subjectCount");
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
const formTitle = document.getElementById("formTitle");
const formModeHint = document.getElementById("formModeHint");
const submitAssignmentBtn = document.getElementById("submitAssignmentBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const calendarGrid = document.getElementById("calendarGrid");
const calendarAgenda = document.getElementById("calendarAgenda");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

init();

function init() {
  state.subjects = loadStoredSubjects();
  state.subjectSchedules = loadStoredSubjectSchedules();
  state.assignments = loadAssignments();
  loadSubjects();
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
  renderSubjectControls();
}

function loadStoredSubjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(SUBJECTS_STORAGE_KEY) || "[]");
    return uniqueSubjectList(
      stored
        .map((subject) => stripSubjectNoise(subject))
        .filter((subject) => subject && !isLikelyPlaceholderSubject(subject))
    );
  } catch {
    return [];
  }
}

function persistSubjects() {
  localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(state.subjects));
}

function loadStoredSubjectSchedules() {
  try {
    const stored = JSON.parse(localStorage.getItem(SUBJECT_SCHEDULES_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(stored || {})
        .map(([subject, days]) => {
          const sanitizedSubject = sanitizeSubjectName(subject);
          const validDays = [...new Set((Array.isArray(days) ? days : []).map(Number))]
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            .sort((left, right) => left - right);

          return [sanitizedSubject, validDays];
        })
        .filter(([subject, days]) => subject && days.length)
    );
  } catch {
    return {};
  }
}

function persistSubjectSchedules() {
  localStorage.setItem(SUBJECT_SCHEDULES_KEY, JSON.stringify(state.subjectSchedules));
}

function sanitizeSubjectName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueSubjectList(subjects) {
  const seen = new Set();

  return subjects
    .map(sanitizeSubjectName)
    .filter((subject) => {
      if (!subject) {
        return false;
      }

      const key = normalizeText(subject);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function getVisibleSubjects() {
  return uniqueSubjectList(
    [
      ...state.subjects.map((subject) => stripSubjectNoise(subject)),
      ...state.assignments.map((item) => stripSubjectNoise(item.subject || item.sourceSubject || "")),
    ].filter((subject) => subject && !isLikelyPlaceholderSubject(subject))
  );
}

function renderSubjectControls() {
  renderSubjectOptions();
  renderSubjectChipList();

  if (subjectCount) {
    subjectCount.textContent = String(getVisibleSubjects().length);
  }
}

function renderSubjectOptions() {
  const visibleSubjects = getVisibleSubjects();
  const previousValue = subjectSelect?.value || "";

  if (!subjectSelect) {
    return;
  }

  if (!visibleSubjects.length) {
    subjectSelect.innerHTML = '<option value="">Primero agregá una materia</option>';
    subjectSelect.disabled = true;
    return;
  }

  subjectSelect.disabled = false;
  subjectSelect.innerHTML = visibleSubjects
    .map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join("");

  const selected = visibleSubjects.find((subject) => subject === previousValue) || visibleSubjects[0];
  subjectSelect.value = selected;
}

function getSubjectScheduleDays(subject) {
  const sanitized = sanitizeSubjectName(subject);
  const storedEntry = Object.entries(state.subjectSchedules).find(
    ([key]) => normalizeText(key) === normalizeText(sanitized)
  );

  return storedEntry ? storedEntry[1] : [];
}

function renderSubjectChipList() {
  if (!subjectChipList) {
    return;
  }

  if (!state.subjects.length) {
    subjectChipList.innerHTML = '<p class="subject-empty-chip">Todavía no cargaste materias propias.</p>';
    return;
  }

  subjectChipList.innerHTML = state.subjects
    .map((subject) => {
      const selectedDays = getSubjectScheduleDays(subject);
      const summary = selectedDays.length
        ? `Cursás: ${selectedDays
            .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day)?.label)
            .filter(Boolean)
            .join(", ")}`
        : "Marcá los días de cursada de esta materia.";

      return `
        <div class="subject-schedule-item">
          <div class="subject-chip">
            <span>${escapeHtml(subject)}</span>
            <button type="button" class="subject-chip-remove" data-remove-subject="${escapeHtml(subject)}" aria-label="Quitar ${escapeHtml(subject)}">×</button>
          </div>
          <div class="subject-weekdays" aria-label="Días de cursada de ${escapeHtml(subject)}">
            ${WEEKDAY_OPTIONS.map(
              (day) => `
                <button
                  type="button"
                  class="weekday-toggle ${selectedDays.includes(day.value) ? "active" : ""}"
                  data-schedule-subject="${escapeHtml(subject)}"
                  data-schedule-day="${day.value}"
                  aria-pressed="${selectedDays.includes(day.value) ? "true" : "false"}"
                  title="${day.label}"
                >
                  ${day.short}
                </button>
              `
            ).join("")}
          </div>
          <small class="subject-schedule-summary">${escapeHtml(summary)}</small>
        </div>
      `;
    })
    .join("");
}

function handleSubjectSubmit(event) {
  event?.preventDefault?.();
  addSubject(newSubjectInput?.value || "");

  if (newSubjectInput) {
    newSubjectInput.value = "";
    newSubjectInput.focus();
  }
}

function ensureSubjects(subjects, persist = true) {
  const cleanedSubjects = subjects
    .map((subject) => stripSubjectNoise(subject))
    .filter((subject) => subject && !isLikelyPlaceholderSubject(subject));
  const nextSubjects = uniqueSubjectList([...state.subjects, ...cleanedSubjects]);
  const changed = nextSubjects.length !== state.subjects.length;

  if (!changed) {
    return false;
  }

  state.subjects = nextSubjects;

  if (persist) {
    persistSubjects();
  }

  return true;
}

function toggleSubjectScheduleDay(subjectName, dayValue) {
  const sanitized = sanitizeSubjectName(subjectName);
  if (!sanitized || !Number.isInteger(dayValue) || dayValue < 0 || dayValue > 6) {
    return;
  }

  const currentDays = getSubjectScheduleDays(sanitized);
  const nextDays = currentDays.includes(dayValue)
    ? currentDays.filter((day) => day !== dayValue)
    : [...currentDays, dayValue].sort((left, right) => left - right);

  if (nextDays.length) {
    state.subjectSchedules = {
      ...state.subjectSchedules,
      [sanitized]: nextDays,
    };
  } else {
    Object.keys(state.subjectSchedules).forEach((key) => {
      if (normalizeText(key) === normalizeText(sanitized)) {
        delete state.subjectSchedules[key];
      }
    });
  }

  persistSubjectSchedules();
  render();
}

function addSubject(subjectName) {
  const sanitized = sanitizeSubjectName(subjectName);
  if (!sanitized) {
    return;
  }

  const changed = ensureSubjects([sanitized]);
  if (!changed) {
    return;
  }

  render();
}

function removeSubject(subjectName) {
  const sanitized = sanitizeSubjectName(subjectName);
  if (!sanitized) {
    return;
  }

  const relatedAssignments = state.assignments.filter(
    (item) => getAssignmentSubject(item) === sanitized
  );

  const confirmed = window.confirm(
    relatedAssignments.length
      ? `Si quitás la materia "${sanitized}", las ${relatedAssignments.length} entrega(s) asociada(s) quedarán sin materia para que puedas reasignarlas. ¿Querés continuar?`
      : `¿Querés quitar la materia "${sanitized}"?`
  );

  if (!confirmed) {
    return;
  }

  state.subjects = state.subjects.filter((subject) => normalizeText(subject) !== normalizeText(sanitized));
  if (relatedAssignments.length) {
    state.assignments = state.assignments.map((item) =>
      getAssignmentSubject(item) === sanitized
        ? {
            ...item,
            subject: "Sin materia asignada",
            sourceSubject: "",
          }
        : item
    );
    persistAssignments();
  }

  Object.keys(state.subjectSchedules).forEach((key) => {
    if (normalizeText(key) === normalizeText(sanitized)) {
      delete state.subjectSchedules[key];
    }
  });

  persistSubjects();
  persistSubjectSchedules();
  render();
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  addSubjectBtn?.addEventListener("click", handleSubjectSubmit);
  newSubjectInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSubjectSubmit(event);
    }
  });
  enableNotificationsBtn.addEventListener("click", requestNotificationPermission);
  loadExampleBtn.addEventListener("click", loadExampleData);
  clearAllBtn.addEventListener("click", clearAll);
  cancelEditBtn?.addEventListener("click", resetAssignmentForm);
  prevMonthBtn?.addEventListener("click", () => shiftCalendarMonth(-1));
  nextMonthBtn?.addEventListener("click", () => shiftCalendarMonth(1));
  subjectsMenuBtn?.addEventListener("click", () => toggleDropdown("subjects"));
  remindersMenuBtn?.addEventListener("click", () => toggleDropdown("reminders"));

  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      applyFilter(button.dataset.filter || "all");
    });
  });

  subjectChipList?.addEventListener("click", (event) => {
    const scheduleButton = event.target.closest("[data-schedule-subject]");
    if (scheduleButton) {
      toggleSubjectScheduleDay(
        scheduleButton.dataset.scheduleSubject || "",
        Number(scheduleButton.dataset.scheduleDay)
      );
      return;
    }

    const button = event.target.closest("[data-remove-subject]");
    if (!button) {
      return;
    }

    removeSubject(button.dataset.removeSubject || "");
  });

  subjectsDropdown?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-subject-anchor]");
    if (!link) {
      return;
    }

    const visibleSubjects = getVisibleSubjects();
    subjectSelect.value = link.dataset.subjectValue || visibleSubjects[0] || "";
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
    const actionButton = event.target.closest("[data-action][data-id]");
    if (!actionButton) {
      return;
    }

    event.preventDefault();
    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id;

    if (!action || !id) {
      return;
    }

    if (action === "toggle") {
      toggleCompleted(id);
    }

    if (action === "edit") {
      startEditingAssignment(id);
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
  let subjectsChanged = false;

  items.forEach((item) => {
    const normalized = normalizeImportedAssignment(item);

    if (!normalized) {
      return;
    }

    const existingMatchIndex = findExistingAssignmentMatch(normalized);
    if (existingMatchIndex >= 0) {
      const currentItem = state.assignments[existingMatchIndex];
      const shouldRefreshTitle =
        isMetadataOnlyTitle(currentItem.title) ||
        normalizeText(currentItem.title) === "actividad campus" ||
        normalizeText(currentItem.title) === normalizeText(getAssignmentSubject(currentItem)) ||
        isDateLikeText(currentItem.title);

      state.assignments[existingMatchIndex] = {
        ...currentItem,
        title: shouldRefreshTitle ? normalized.title : currentItem.title,
        subject: normalized.subject,
        dueAt: normalized.dueAt,
        notes: normalized.notes || currentItem.notes,
        sourceContext: normalized.sourceContext || currentItem.sourceContext,
      };
      importedCount += shouldRefreshTitle ? 1 : 0;
      return;
    }

    if (isDuplicateAssignment(normalized)) {
      return;
    }

    subjectsChanged = ensureSubjects([normalized.subject], false) || subjectsChanged;
    state.assignments.push(normalized);
    importedCount += 1;
  });

  if (importedCount || subjectsChanged) {
    if (subjectsChanged) {
      persistSubjects();
    }
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
  const subject = inferSubject(
    item?.sourceSubject || item?.subject || item?.course || item?.materia || "",
    item?.context || rawText
  );
  const rawImportedNotes = sanitizeImportedNotes(item?.notes ? String(item.notes).trim() : "");
  const title = sanitizeImportedTitle(
    item?.title || item?.name || item?.activity || "Actividad Campus",
    `${rawImportedNotes} · ${rawText}`,
    [subject]
  );
  const notes = buildImportedDescription(title, rawImportedNotes);
  const dueAt = normalizeDueAt(
    item?.dueAt || item?.dueDate || item?.deadline || item?.fecha || item?.date
  );

  if (!title || !dueAt) {
    return null;
  }

  if (new Date(dueAt).getTime() < Date.now()) {
    return null;
  }

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

function stripSubjectNoise(value) {
  return sanitizeSubjectName(value)
    .replace(/^(materia|curso|asignatura|c[áa]tedra)\s*:?\s*/i, "")
    .replace(/^((?:1|2|3|4)(?:er|do)?\s*(?:bim\.?|bimestre|cuatrimestre|trimestre)|primer\s+bimestre|segundo\s+bimestre)\s*[:.-]?\s*/i, "")
    .replace(/\b(?:educaci[oó]n\s+a\s+distancia|modalidad\s+(?:virtual|presencial|mixta)|a\s+distancia|virtual|presencial)\b/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\b(?:campus|inicio|actividades?|obligatorias?|optativas?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function matchExistingSubject(value) {
  const normalizedValue = normalizeText(stripSubjectNoise(value));
  if (!normalizedValue) {
    return "";
  }

  const visibleSubjects = getVisibleSubjects().filter(
    (subject) => !isLikelyPlaceholderSubject(subject)
  );

  return (
    visibleSubjects.find((subject) => normalizeText(subject) === normalizedValue) ||
    visibleSubjects.find(
      (subject) =>
        normalizedValue.includes(normalizeText(subject)) ||
        normalizeText(subject).includes(normalizedValue)
    ) ||
    ""
  );
}

function extractSubjectLabel(value) {
  const cleanedValue = stripSubjectNoise(value);
  if (!cleanedValue || isLikelyPlaceholderSubject(cleanedValue) || !/[a-záéíóúñ]/i.test(cleanedValue)) {
    return "";
  }

  const labelledMatch = cleanedValue.match(
    /(?:materia|curso|asignatura|c[áa]tedra)\s*:?\s*([^|·]+?)(?=\s{2,}|·|$)/i
  );

  if (labelledMatch?.[1]) {
    const labelledValue = stripSubjectNoise(labelledMatch[1]);
    if (!isLikelyPlaceholderSubject(labelledValue) && /[a-záéíóúñ]/i.test(labelledValue)) {
      return labelledValue;
    }
  }

  const candidateParts = cleanedValue
    .split(/\s*[>|»/·-]\s*/)
    .map(stripSubjectNoise)
    .filter(Boolean);

  const bestCandidate = candidateParts.find(
    (part) =>
      part.length <= 60 &&
      !isLikelyPlaceholderSubject(part) &&
      /[a-záéíóúñ]/i.test(part)
  );

  return bestCandidate || (cleanedValue.length <= 60 && !isLikelyPlaceholderSubject(cleanedValue) ? cleanedValue : "");
}

function inferSubject(value, fallbackContext = "") {
  const directValue = sanitizeSubjectName(value);
  const existingSubject = matchExistingSubject(directValue) || matchExistingSubject(fallbackContext);

  if (existingSubject) {
    return existingSubject;
  }

  const extractedSubject = extractSubjectLabel(directValue) || extractSubjectLabel(fallbackContext);
  if (extractedSubject) {
    return extractedSubject;
  }

  return !isLikelyPlaceholderSubject(directValue) && /[a-záéíóúñ]/i.test(directValue)
    ? directValue
    : "Sin materia asignada";
}

function getAssignmentSubject(item) {
  return inferSubject(
    item?.subject || item?.sourceSubject || "",
    `${item?.sourceContext || ""} ${item?.title || ""} ${item?.notes || ""}`
  );
}

function isDuplicateAssignment(candidate) {
  return state.assignments.some(
    (item) =>
      normalizeText(item.title) === normalizeText(candidate.title) &&
      normalizeText(getAssignmentSubject(item)) === normalizeText(getAssignmentSubject(candidate)) &&
      item.dueAt === candidate.dueAt
  );
}

function findExistingAssignmentMatch(candidate) {
  return state.assignments.findIndex((item) => {
    const currentSubject = getAssignmentSubject(item);
    const candidateSubject = getAssignmentSubject(candidate);

    return (
      item.dueAt === candidate.dueAt &&
      (
        normalizeText(currentSubject) === normalizeText(candidateSubject) ||
        isLikelyPlaceholderSubject(currentSubject)
      ) &&
      (
        normalizeText(item.title) === normalizeText(candidate.title) ||
        isMetadataOnlyTitle(item.title) ||
        normalizeText(item.title) === "actividad campus" ||
        normalizeText(item.title) === normalizeText(currentSubject) ||
        isDateLikeText(item.title)
      )
    );
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stripMetadataPrefix(value) {
  return String(value || "")
    .replace(
      /^(estado|apertura|apretura|cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|disponible\s+desde|inicio|pr[oó]xima|pendiente)\s*:?\s*/i,
      ""
    )
    .trim();
}

function isDateLikeText(value) {
  const text = String(value || "").trim();

  return /^(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo),?\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{2,4}(?:,?\s+\d{1,2}:\d{2})?$/i.test(text) ||
    /^\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{2,4}(?:,?\s+\d{1,2}:\d{2})?$/i.test(text) ||
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+\d{1,2}:\d{2})?$/.test(text);
}

function isLikelyPlaceholderSubject(value) {
  const text = String(value || "").trim();
  return /^\d{4}$/.test(text) ||
    /^(?:\(?\d+\)?\s*)?(tecnicatura|licenciatura|ingenier[ií]a|profesorado|maestr[ií]a|doctorado|especializaci[oó]n|carrera|facultad|universidad|campus)\b/i.test(text) ||
    /^(educaci[oó]n\s+a\s+distancia|modalidad\s+(?:virtual|presencial|mixta)|a\s+distancia|virtual|presencial)$/i.test(text) ||
    /^((?:1|2|3|4)(?:er|do)?\s*(?:bim\.?|bimestre|cuatrimestre|trimestre)|primer\s+bimestre|segundo\s+bimestre|sin\s+materia\s+asignada)(?:\s|$|[:.-])/i.test(text) ||
    isDateLikeText(text);
}

function isMetadataOnlyTitle(value) {
  const rawValue = String(value || "").trim();
  const strippedValue = stripMetadataPrefix(rawValue);
  return Boolean(rawValue) && (!strippedValue || isDateLikeText(strippedValue));
}

function sanitizeImportedTitle(value, fallbackText = "", blockedValues = []) {
  const blocked = blockedValues.map((item) => normalizeText(item)).filter(Boolean);
  const cleanValue = stripMetadataPrefix(value);

  if (
    cleanValue &&
    !blocked.includes(normalizeText(cleanValue)) &&
    !isDateLikeText(cleanValue) &&
    !isLikelyPlaceholderSubject(cleanValue)
  ) {
    return cleanValue;
  }

  const fallback = String(fallbackText || "")
    .split(/\s*·\s*/)
    .map((part) => stripMetadataPrefix(part))
    .find(
      (part) =>
        part.length > 4 &&
        part.length <= 120 &&
        !blocked.includes(normalizeText(part)) &&
        !isMetadataOnlyTitle(part) &&
        !isDateLikeText(part) &&
        !isLikelyPlaceholderSubject(part) &&
        !/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.test(part)
    );

  return fallback || "Actividad Campus";
}

function sanitizeImportedNotes(value) {
  const rawText = String(value || "").trim();
  if (!rawText) {
    return "";
  }

  const parts = rawText
    .split(/\s*·\s*/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts
    .filter(
      (part) =>
        !/^(importado\s+desde\s+campus\s+uces|estado|apertura|apretura|cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|disponible\s+desde|inicio)\s*:?/i.test(part)
    )
    .filter(
      (part, index, collection) =>
        collection.findIndex((candidate) => normalizeText(candidate) === normalizeText(part)) === index
    )
    .join(" · ");
}

function buildImportedDescription(title, notes = "") {
  const cleanTitle = String(title || "").trim();
  const cleanNotes = String(notes || "").trim();

  if (cleanTitle) {
    return cleanTitle;
  }

  return cleanNotes;
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

  const normalizedSubject = inferSubject(subject);
  const dueAt = `${dueDate}T${dueTime}`;
  ensureSubjects([normalizedSubject], false);

  if (state.editingId) {
    state.assignments = state.assignments.map((item) =>
      item.id === state.editingId
        ? {
            ...item,
            title,
            subject: normalizedSubject,
            dueAt,
            notes,
          }
        : item
    );
  } else {
    state.assignments.push({
      id: createId(),
      title,
      subject: normalizedSubject,
      dueAt,
      notes,
      completed: false,
      createdAt: new Date().toISOString(),
    });
  }

  persistSubjects();
  persistAssignments();
  resetAssignmentForm();
  render();
  checkUpcomingNotifications();
}

function render() {
  renderSubjectControls();
  renderFormMode();
  renderStats();
  renderCalendar();
  renderHeaderMenus();
  renderAssignments();
  renderSubjectSections();
}

function renderFormMode() {
  const isEditing = Boolean(state.editingId);

  if (formTitle) {
    formTitle.textContent = isEditing ? "Editar entrega" : "Cargar entrega manual";
  }

  if (formModeHint) {
    formModeHint.hidden = !isEditing;
    formModeHint.textContent = isEditing
      ? "Estás editando una entrega existente. Podés cambiar la materia desde el selector y guardar los cambios."
      : "";
  }

  if (submitAssignmentBtn) {
    submitAssignmentBtn.textContent = isEditing ? "Guardar cambios" : "Guardar entrega";
  }

  if (cancelEditBtn) {
    cancelEditBtn.hidden = !isEditing;
  }
}

function resetAssignmentForm() {
  state.editingId = null;
  form?.reset();

  const dueTimeInput = document.getElementById("dueTime");
  if (dueTimeInput) {
    dueTimeInput.value = "23:59";
  }

  renderSubjectControls();
  renderFormMode();
}

function startEditingAssignment(id) {
  const item = state.assignments.find((assignment) => assignment.id === id);
  if (!item || !form) {
    return;
  }

  state.editingId = id;
  renderSubjectControls();

  const [dueDate = "", dueTime = "23:59"] = String(item.dueAt || "").split("T");
  const visibleSubjects = getVisibleSubjects();
  const preferredSubject = getAssignmentSubject(item);

  form.elements.title.value = item.title || "";
  form.elements.subject.value = visibleSubjects.includes(preferredSubject)
    ? preferredSubject
    : visibleSubjects[0] || "";
  form.elements.dueDate.value = dueDate;
  form.elements.dueTime.value = dueTime.slice(0, 5) || "23:59";
  form.elements.notes.value = item.notes || "";

  renderFormMode();
  form.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!preferredSubject || isLikelyPlaceholderSubject(preferredSubject)) {
    form.elements.subject?.focus();
  } else {
    form.elements.title?.focus();
    form.elements.title?.select?.();
  }
}

function renderHeaderMenus() {
  const visibleSubjects = getVisibleSubjects();

  if (subjectsDropdown) {
    if (!visibleSubjects.length) {
      subjectsDropdown.innerHTML = `
        <div class="dropdown-empty">
          Agregá una materia para empezar.
        </div>
      `;
    } else {
      subjectsDropdown.innerHTML = visibleSubjects
        .map((subject) => {
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
        })
        .join("");
    }
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

  const visibleSubjects = getVisibleSubjects();

  if (!visibleSubjects.length) {
    subjectSections.innerHTML = '<div class="subject-empty">Agregá tus materias o importalas desde Campus para empezar a organizar la cursada.</div>';
    return;
  }

  subjectSections.innerHTML = visibleSubjects
    .map((subject) => {
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
    })
    .join("");
}

function getCalendarWeekdayValue(date) {
  return (date.getDay() + 6) % 7;
}

function getScheduledSubjectsForDate(date) {
  const dayValue = getCalendarWeekdayValue(date);
  const visibleSubjects = getVisibleSubjects();

  return Object.entries(state.subjectSchedules)
    .filter(
      ([subject, days]) =>
        visibleSubjects.some((visible) => normalizeText(visible) === normalizeText(subject)) &&
        Array.isArray(days) &&
        days.includes(dayValue)
    )
    .map(([subject]) => subject)
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
}

function renderCalendar() {
  if (!calendarGrid || !calendarAgenda || !calendarMonthLabel) {
    return;
  }

  const viewDate = getMonthStart(state.calendarDate || new Date());
  state.calendarDate = viewDate;

  calendarMonthLabel.textContent = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(viewDate);

  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const lastDay = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const todayKey = formatDateKey(new Date());
  const pendingAssignments = state.assignments.filter((item) => !item.completed);
  const assignmentsByDate = pendingAssignments.reduce((acc, item) => {
    const key = formatDateKey(item.dueAt);
    if (!key) {
      return acc;
    }

    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  const weekdayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const cells = [];

  weekdayNames.forEach((dayName) => {
    cells.push(`<div class="calendar-weekday">${dayName}</div>`);
  });

  for (let index = 0; index < totalCells; index += 1) {
    const cellDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), index - startOffset + 1);
    const key = formatDateKey(cellDate);
    const dayItems = (assignmentsByDate[key] || []).sort(
      (a, b) => new Date(a.dueAt) - new Date(b.dueAt)
    );
    const scheduledSubjects = getScheduledSubjectsForDate(cellDate);
    const isCurrentMonth = cellDate.getMonth() === viewDate.getMonth();
    const hasOverdue = dayItems.some((item) => new Date(item.dueAt) < new Date());
    const classes = ["calendar-day"];

    if (!isCurrentMonth) {
      classes.push("is-muted");
    }

    if (key === todayKey) {
      classes.push("is-today");
    }

    if (dayItems.length) {
      classes.push("has-items");
    }

    if (scheduledSubjects.length) {
      classes.push("has-class");
    }

    if (hasOverdue) {
      classes.push("is-overdue");
    }

    const preview = dayItems
      .slice(0, 2)
      .map((item) => `<span class="calendar-pill ${getStatus(item).type}">${escapeHtml(item.title)}</span>`)
      .join("");

    const classPreview = scheduledSubjects
      .slice(0, 3)
      .map((subject) => `<span class="calendar-pill class-day">Clase · ${escapeHtml(subject)}</span>`)
      .join("");

    cells.push(`
      <article class="${classes.join(" ")}">
        <div class="calendar-day-top">
          <span class="calendar-date-number">${cellDate.getDate()}</span>
          ${dayItems.length ? `<span class="calendar-count">${dayItems.length}</span>` : ""}
        </div>
        <div class="calendar-preview">
          ${preview || ""}
          ${classPreview || ""}
          ${dayItems.length > 2 ? `<span class="calendar-more">+${dayItems.length - 2} más</span>` : ""}
          ${scheduledSubjects.length > 3 ? `<span class="calendar-more">+${scheduledSubjects.length - 3} clase${scheduledSubjects.length - 3 === 1 ? "" : "s"}</span>` : ""}
        </div>
      </article>
    `);
  }

  calendarGrid.innerHTML = cells.join("");

  const monthItems = pendingAssignments
    .filter((item) => {
      const dueDate = new Date(item.dueAt);
      return (
        dueDate.getFullYear() === viewDate.getFullYear() &&
        dueDate.getMonth() === viewDate.getMonth()
      );
    })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  if (!monthItems.length) {
    calendarAgenda.innerHTML = '<div class="subject-empty">No hay pendientes cargados para este mes.</div>';
    return;
  }

  calendarAgenda.innerHTML = `
    <div class="calendar-agenda-header">
      <strong>Agenda del mes</strong>
      <span>${monthItems.length} pendiente${monthItems.length === 1 ? "" : "s"}</span>
    </div>
    <div class="calendar-agenda-list">
      ${monthItems
        .slice(0, 8)
        .map((item) => {
          const status = getStatus(item);
          return `
            <article class="calendar-agenda-item ${status.type}">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(getAssignmentSubject(item))}</p>
              </div>
              <span>${formatDue(item.dueAt)}</span>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function shiftCalendarMonth(delta) {
  const current = getMonthStart(state.calendarDate || new Date());
  state.calendarDate = new Date(current.getFullYear(), current.getMonth() + delta, 1);
  renderCalendar();
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
            <button class="ghost-btn" data-action="edit" data-id="${item.id}" type="button">
              Editar
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

  if (state.editingId === id) {
    resetAssignmentForm();
  }

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
  resetAssignmentForm();
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

  ensureSubjects(DEFAULT_SAMPLE_SUBJECTS, false);

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
      title: "Resumen de lectura",
      subject: DEFAULT_SAMPLE_SUBJECTS[0],
      dueAt: inDays(2, 19),
      notes: "Subir el archivo en PDF.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Participación en foro",
      subject: DEFAULT_SAMPLE_SUBJECTS[1],
      dueAt: inDays(4, 21),
      notes: "Responder con una breve reflexión.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "Entrega de ejercicio práctico",
      subject: DEFAULT_SAMPLE_SUBJECTS[2],
      dueAt: inDays(6, 20),
      notes: "Adjuntar material y comentario final.",
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ];

  state.assignments.push(...examples);
  persistSubjects();
  persistAssignments();
  render();
}

function loadAssignments() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map((item) => {
      const subject = inferSubject(
        item.subject || item.sourceSubject || "",
        `${item.sourceContext || ""} ${item.title || ""} ${item.notes || ""}`
      );
      const title = sanitizeImportedTitle(
        item.title || "",
        `${item.notes || ""} · ${item.sourceContext || ""}`,
        [subject]
      );
      const cleanedNotes = sanitizeImportedNotes(item.notes || "");
      const isImported = Boolean(item.sourceContext);

      return {
        ...item,
        title,
        notes: isImported ? buildImportedDescription(title, cleanedNotes) : cleanedNotes,
        subject,
      };
    });
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

function getMonthStart(date) {
  const baseDate = date instanceof Date ? date : new Date(date);
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function formatDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
