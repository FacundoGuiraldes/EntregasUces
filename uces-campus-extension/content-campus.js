const GENERIC_PAGE_LABELS = [
  "campus",
  "inicio",
  "actividades",
  "actividad",
  "obligatorias",
  "obligatoria",
  "optativas",
  "optativa",
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "UCES_EXTRACT_ACTIVITIES") {
    return undefined;
  }

  try {
    const activities = extractUpcomingActivities();

    if (!activities.length) {
      sendResponse({
        ok: false,
        error:
          "No se encontraron actividades próximas visibles. Abrí una unidad de la materia o la sección ACTIVIDADES donde aparezcan las entregas y volvé a intentar.",
      });
      return true;
    }

    sendResponse({ ok: true, activities });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error.message || "No se pudieron extraer las actividades.",
    });
  }

  return true;
});

function extractUpcomingActivities() {
  const pageSnapshot = cleanText(`${document.title}\n${document.body?.innerText || ""}`);
  const pageSubject = extractPageSubject();

  const selectors = [
    '[class*="activity"]',
    '[id*="activity"]',
    '.card',
    '.list-group-item',
    '.event',
    '.task',
    '.assignment',
    'article',
    'li',
    'tr',
  ];

  const elements = [...document.querySelectorAll(selectors.join(','))];
  const candidateElements = elements.filter((element) => isLikelyActivityElement(element));
  const leafElements = candidateElements.filter(
    (element) =>
      !candidateElements.some(
        (other) =>
          other !== element &&
          element.contains(other) &&
          cleanText(other.innerText || "").length < cleanText(element.innerText || "").length
      )
  );

  const seen = new Set();
  const now = new Date();

  const activityContextVisible = /(actividades?|apertura|cierre|fecha\s+de\s+entrega|fecha\s+l[ií]mite|vencimiento|obligatorias?|unidad|gu[ií]a|foro|tarea)/i.test(
    pageSnapshot
  );

  const activities = leafElements
    .map((element) => buildActivityFromElement(element, now, seen, pageSubject))
    .filter(Boolean)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  if (!activities.length && !activityContextVisible) {
    throw new Error(
      "Abrí una unidad de la materia o la sección ACTIVIDADES donde se vean entregas con fecha límite."
    );
  }

  return activities.slice(0, 50);
}

function buildActivityFromElement(element, now, seen, pageSubject = "") {
  const text = cleanText(element.innerText || "");

  if (text.length < 20 || text.length > 800) {
    return null;
  }

  if (/(cerrad|entregad|completad|finalizad|vencid|calificad)/i.test(text)) {
    return null;
  }

  if (!hasVisibleDeadline(text)) {
    return null;
  }

  const dueAt = parseDueAtFromText(text);

  if (!dueAt || dueAt.getTime() < now.getTime()) {
    return null;
  }

  const title = extractTitle(element);
  if (!title) {
    return null;
  }

  const subject = extractSubject(element, text, pageSubject);
  const notes = (element.innerText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ")
    .slice(0, 180);

  const activity = {
    title,
    subject,
    dueAt: formatLocalIso(dueAt),
    status: "Próxima",
    notes,
    sourceSubject: pageSubject || subject,
    context: getPageContextText(),
    url: element.querySelector('a[href]')?.href || location.href,
  };

  const key = `${normalizeText(activity.title)}|${normalizeText(activity.subject)}|${activity.dueAt}`;
  if (seen.has(key)) {
    return null;
  }

  seen.add(key);
  return activity;
}

function extractTitle(element) {
  const preferred = cleanText(
    element.querySelector('a, .aalink, .instancename, .title, .name, h3, h4, strong, b')
      ?.textContent || ""
  );

  if (preferred && preferred.length <= 120 && !isGenericSectionLabel(preferred)) {
    return preferred;
  }

  const lines = (element.innerText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);

  return (
    lines.find(
      (line) =>
        line.length > 4 &&
        line.length <= 120 &&
        !isGenericSectionLabel(line) &&
        !/(estado|fecha|apertura|cierre|vence|pr[oó]xima|pendiente|disponible\s+desde)/i.test(line) &&
        !/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.test(line)
    ) || ""
  );
}

function isLikelyActivityElement(element) {
  const text = cleanText(element.innerText || "");

  if (text.length < 20 || text.length > 800) {
    return false;
  }

  if (!hasVisibleDeadline(text)) {
    return false;
  }

  if (isGenericSectionLabel(text)) {
    return false;
  }

  return Boolean(
    element.querySelector('a, .aalink, .instancename, .title, .name, strong, b') ||
      /(apertura|cierre|fecha\s+de\s+entrega|fecha\s+l[ií]mite|vence)/i.test(text)
  );
}

function isGenericSectionLabel(text) {
  return /^(actividades?|obligatorias?|optativas?|disponible\s+desde.*)$/i.test(
    cleanText(text)
  );
}

function splitContextCandidate(value) {
  return String(value || "")
    .split(/\s*[>|»|/]\s*|\s+-\s+/g)
    .map(cleanText)
    .filter(Boolean);
}

function cleanSubjectCandidate(value) {
  return cleanText(value)
    .replace(/^(mis cursos|campus|inicio)\s*:?\s*/i, "")
    .replace(/\b(?:unidad|u)\s*\d+\b.*$/i, "")
    .replace(/\bactividades?\b.*$/i, "")
    .replace(/\b(obligatorias?|optativas?)\b.*$/i, "")
    .trim();
}

function getPageContextCandidates() {
  const candidateSelectors = [
    document.title,
    document.querySelector('.page-header-headings h1')?.textContent,
    document.querySelector('.page-title')?.textContent,
    document.querySelector('h1')?.textContent,
    document.querySelector('.breadcrumb li:last-child')?.textContent,
    document.querySelector('.breadcrumb li:nth-last-child(2)')?.textContent,
    document.querySelector('.breadcrumb li:nth-last-child(3)')?.textContent,
    document.querySelector('[data-region="course-content"] .sectionname')?.textContent,
  ];

  return candidateSelectors
    .flatMap(splitContextCandidate)
    .map(cleanSubjectCandidate)
    .filter(Boolean)
    .filter((candidate) => !isGenericPageLabel(candidate));
}

function isGenericPageLabel(value) {
  const normalizedValue = normalizeText(value || "");
  return (
    !normalizedValue ||
    GENERIC_PAGE_LABELS.includes(normalizedValue) ||
    /^(unidad|u)\s*\d+$/i.test(cleanText(value))
  );
}

function extractPageSubject() {
  const candidates = getPageContextCandidates();

  for (const candidate of candidates) {
    const detected = detectSubjectFromText(candidate);
    if (detected && !isGenericPageLabel(detected)) {
      return detected;
    }
  }

  return "";
}

function getPageContextText() {
  return cleanText(getPageContextCandidates().join(" "));
}

function detectSubjectFromText(value) {
  const cleanedValue = cleanSubjectCandidate(value);
  if (!cleanedValue || isGenericPageLabel(cleanedValue)) {
    return "";
  }

  const labelledMatch = cleanedValue.match(
    /(?:materia|curso|asignatura|c[áa]tedra)\s*:?\s*(.+)$/i
  );

  if (labelledMatch?.[1]) {
    return cleanSubjectCandidate(labelledMatch[1]);
  }

  return cleanedValue.length <= 80 ? cleanedValue : "";
}

function extractSubject(element, text, pageSubject = "") {
  if (pageSubject) {
    return pageSubject;
  }

  const matchedSubject = detectSubjectFromText(text);

  if (matchedSubject) {
    return matchedSubject;
  }

  const lines = (element.innerText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);

  const labeledLine = lines.find((line) => /(materia|curso|asignatura|c[aá]tedra)/i.test(line));
  if (labeledLine) {
    const cleanedLabel = labeledLine
      .replace(/.*?(materia|curso|asignatura|c[aá]tedra)\s*:?\s*/i, "")
      .trim();
    return detectSubjectFromText(cleanedLabel) || cleanedLabel;
  }

  return "Sin materia asignada";
}

function hasVisibleDeadline(text) {
  return /(cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|entrega\s+hasta|hasta\s+el)/i.test(
    text
  );
}

function parseDueAtFromText(text) {
  const deadlineSegmentMatch = text.match(
    /(cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|entrega\s+hasta|hasta\s+el)\s*:?\s*(.{0,120})/i
  );

  if (deadlineSegmentMatch) {
    const deadlineCandidates = getDateCandidates(deadlineSegmentMatch[2]);
    if (deadlineCandidates.length) {
      return deadlineCandidates[0];
    }
  }

  const allCandidates = getDateCandidates(text);

  if (/(apertura|inicio)/i.test(text) && allCandidates.length >= 2) {
    return allCandidates[allCandidates.length - 1];
  }

  return null;
}

function getDateCandidates(text) {
  const candidates = [];
  const numericRegex = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\D+(\d{1,2})[:.](\d{2}))?/g;
  const textRegex = /(\d{1,2})\s*(?:de\s+)?(ene|enero|feb|febrero|mar|marzo|abr|abril|may|mayo|jun|junio|jul|julio|ago|agosto|sep|sept|septiembre|oct|octubre|nov|noviembre|dic|diciembre)\s*(?:de\s+)?(\d{2,4})(?:\D+(\d{1,2})[:.](\d{2}))?/gi;
  let match;

  while ((match = numericRegex.exec(text)) !== null) {
    const parsed = createDateFromParts(match[1], match[2], match[3], match[4], match[5]);
    if (parsed) {
      candidates.push(parsed);
    }
  }

  while ((match = textRegex.exec(text)) !== null) {
    const parsed = createDateFromTextMonth(match[1], match[2], match[3], match[4], match[5]);
    if (parsed) {
      candidates.push(parsed);
    }
  }

  return candidates;
}

function createDateFromParts(day, month, year, hours = "23", minutes = "59") {
  const fullYear = String(year).length === 2 ? `20${year}` : String(year);
  const result = new Date(
    Number(fullYear),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0
  );

  return Number.isNaN(result.getTime()) ? null : result;
}

function createDateFromTextMonth(day, monthName, year, hours = "23", minutes = "59") {
  const monthMap = {
    ene: 0,
    enero: 0,
    feb: 1,
    febrero: 1,
    mar: 2,
    marzo: 2,
    abr: 3,
    abril: 3,
    may: 4,
    mayo: 4,
    jun: 5,
    junio: 5,
    jul: 6,
    julio: 6,
    ago: 7,
    agosto: 7,
    sep: 8,
    sept: 8,
    septiembre: 8,
    oct: 9,
    octubre: 9,
    nov: 10,
    noviembre: 10,
    dic: 11,
    diciembre: 11,
  };

  const monthIndex = monthMap[String(monthName).toLowerCase()];
  if (monthIndex === undefined) {
    return null;
  }

  return createDateFromParts(day, monthIndex + 1, year, hours, minutes);
}

function formatLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
