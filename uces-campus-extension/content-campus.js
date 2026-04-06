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

  const subject = extractSubject(element, text, pageSubject);
  const title = resolveActivityTitle(element, subject, pageSubject);
  if (!title) {
    return null;
  }

  const titleKey = normalizeText(title);
  const subjectKey = normalizeText(subject);
  const notes = (element.innerText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .filter((line) => normalizeText(line) !== titleKey)
    .filter((line) => normalizeText(line) !== subjectKey)
    .filter(
      (line) =>
        !/^(estado|apertura|apretura|cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|disponible\s+desde|inicio)\s*:?/i.test(line)
    )
    .slice(0, 3)
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

function stripTitlePrefix(value) {
  return cleanText(value).replace(
    /^(estado|apertura|apretura|cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|pr[oó]xima|pendiente|disponible\s+desde|inicio)\s*:?\s*/i,
    ""
  );
}

function isDateLikeText(value) {
  const text = cleanText(value);

  return /^(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo),?\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{2,4}(?:,?\s+\d{1,2}:\d{2})?$/i.test(text) ||
    /^\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{2,4}(?:,?\s+\d{1,2}:\d{2})?$/i.test(text) ||
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+\d{1,2}:\d{2})?$/.test(text);
}

function resolveActivityTitle(element, subject = "", pageSubject = "") {
  let current = element;
  let depth = 0;

  while (current && depth < 5) {
    const title = extractTitle(current, [subject, pageSubject]);
    if (title) {
      return title;
    }

    current = current.parentElement;
    depth += 1;
  }

  return "";
}

function extractTitle(element, blockedValues = []) {
  const preferredCandidates = [...element.querySelectorAll('a, .aalink, .instancename, .title, .name, h3, h4, strong, b')]
    .map((node) => stripTitlePrefix(node.textContent || ""))
    .filter(Boolean);

  const preferred = preferredCandidates.find((candidate) => isValidTitleCandidate(candidate, blockedValues));
  if (preferred) {
    return preferred;
  }

  const lines = (element.innerText || "")
    .split(/\n+/)
    .map((line) => stripTitlePrefix(line))
    .filter(Boolean);

  return lines.find((line) => isValidTitleCandidate(line, blockedValues)) || "";
}

function isValidTitleCandidate(value, blockedValues = []) {
  const text = stripTitlePrefix(value);
  const blocked = blockedValues.map((item) => normalizeText(item)).filter(Boolean);

  return Boolean(
    text &&
      text.length > 4 &&
      text.length <= 120 &&
      !blocked.includes(normalizeText(text)) &&
      !isGenericSectionLabel(text) &&
      !/^(estado|apertura|apretura|cierre|fecha\s*(?:de\s*)?(?:cierre|entrega|l[ií]mite)|vence|vencimiento|pr[oó]xima|pendiente|disponible\s+desde|inicio)\s*:?$/i.test(text) &&
      !isDateLikeText(text) &&
      !/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.test(text)
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

function isProgramLabel(value) {
  return /^(?:\(?\d+\)?\s*)?(tecnicatura|licenciatura|ingenier[ií]a|profesorado|maestr[ií]a|doctorado|especializaci[oó]n|carrera|facultad|universidad|campus|educaci[oó]n\s+a\s+distancia|modalidad\s+(?:virtual|presencial|mixta)|a\s+distancia)\b/i.test(
    cleanText(value)
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
    .replace(/^(materia|curso|asignatura|c[áa]tedra)\s*:?\s*/i, "")
    .replace(/^((?:1|2|3|4)(?:er|do)?\s*(?:bim\.?|bimestre|cuatrimestre|trimestre)|primer\s+bimestre|segundo\s+bimestre)\s*[:.-]?\s*/i, "")
    .replace(/\b(?:educaci[oó]n\s+a\s+distancia|modalidad\s+(?:virtual|presencial|mixta)|a\s+distancia|virtual|presencial)\b/gi, "")
    .replace(/\b(?:unidad|u)\s*\d+\b.*$/i, "")
    .replace(/\bactividades?\b.*$/i, "")
    .replace(/\b(obligatorias?|optativas?)\b.*$/i, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getPageContextCandidates() {
  const breadcrumbTexts = [...document.querySelectorAll('.breadcrumb li, .breadcrumb-item, nav[aria-label="breadcrumb"] li')]
    .map((item) => item.textContent)
    .filter(Boolean);

  const headingTexts = [
    document.querySelector('.page-header-headings h1')?.textContent,
    document.querySelector('.page-title')?.textContent,
    document.querySelector('h1')?.textContent,
    document.querySelector('h2')?.textContent,
    document.querySelector('[data-region="course-content"] .sectionname')?.textContent,
    document.querySelector('.breadcrumb-button .breadcrumb-text')?.textContent,
  ];

  const candidateSelectors = [document.title, ...headingTexts, ...breadcrumbTexts];

  return candidateSelectors
    .flatMap(splitContextCandidate)
    .map(cleanSubjectCandidate)
    .filter(Boolean)
    .filter((candidate) => !isGenericPageLabel(candidate));
}

function isGenericPageLabel(value) {
  const cleanedValue = cleanText(value);
  const normalizedValue = normalizeText(cleanedValue || "");
  return (
    !normalizedValue ||
    /^\d{4}$/.test(cleanedValue) ||
    isProgramLabel(cleanedValue) ||
    GENERIC_PAGE_LABELS.includes(normalizedValue) ||
    /^(unidad|u)\s*\d+$/i.test(cleanedValue) ||
    /^((?:1|2|3|4)(?:er|do)?\s*(?:bim\.?|bimestre|cuatrimestre|trimestre)|primer\s+bimestre|segundo\s+bimestre)$/i.test(cleanedValue) ||
    isDateLikeText(cleanedValue)
  );
}

function scoreSubjectCandidate(value) {
  const text = cleanSubjectCandidate(value);
  if (!text || isGenericPageLabel(text) || !/[a-záéíóúñ]/i.test(text)) {
    return -1;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return text.length + wordCount * 10;
}

function extractPageSubject() {
  const candidates = getPageContextCandidates()
    .map((candidate) => detectSubjectFromText(candidate))
    .filter(Boolean)
    .sort((left, right) => scoreSubjectCandidate(right) - scoreSubjectCandidate(left));

  return candidates[0] || "";
}

function getPageContextText() {
  return cleanText(getPageContextCandidates().join(" "));
}

function detectSubjectFromText(value) {
  const cleanedValue = cleanSubjectCandidate(value);
  if (
    !cleanedValue ||
    isGenericPageLabel(cleanedValue) ||
    isProgramLabel(cleanedValue) ||
    !/[a-záéíóúñ]/i.test(cleanedValue)
  ) {
    return "";
  }

  const labelledMatch = cleanedValue.match(
    /(?:materia|curso|asignatura|c[áa]tedra)\s*:?\s*(.+)$/i
  );

  if (labelledMatch?.[1]) {
    const labelledValue = cleanSubjectCandidate(labelledMatch[1]);
    if (
      !isGenericPageLabel(labelledValue) &&
      !isProgramLabel(labelledValue) &&
      /[a-záéíóúñ]/i.test(labelledValue)
    ) {
      return labelledValue;
    }
  }

  return cleanedValue.length <= 80 ? cleanedValue : "";
}

function extractSubject(element, text, pageSubject = "") {
  const lines = (element.innerText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);

  const lineCandidate = lines
    .map((line) => detectSubjectFromText(line))
    .find((candidate) => candidate && !isProgramLabel(candidate));

  if (lineCandidate) {
    return lineCandidate;
  }

  const matchedSubject = detectSubjectFromText(text);
  if (matchedSubject && !isProgramLabel(matchedSubject)) {
    return matchedSubject;
  }

  if (pageSubject && !isProgramLabel(pageSubject)) {
    return pageSubject;
  }

  const labeledLine = lines.find((line) => /(materia|curso|asignatura|c[aá]tedra)/i.test(line));
  if (labeledLine) {
    const cleanedLabel = labeledLine
      .replace(/.*?(materia|curso|asignatura|c[aá]tedra)\s*:?\s*/i, "")
      .trim();
    const detected = detectSubjectFromText(cleanedLabel);
    if (detected && !isProgramLabel(detected)) {
      return detected;
    }
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
