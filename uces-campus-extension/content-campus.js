const SUBJECT_HINTS = [
  "Arquitectura en Computadoras",
  "Integración Tecnológico Académica",
  "Base de Datos I",
  "Programación I",
  "Diseño de Objetos",
  "Diseño de Interfaces",
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
          "No se encontraron actividades próximas visibles. Abrí la sección ACTIVIDADES y volvé a intentar.",
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

  if (!/actividades?/i.test(pageSnapshot)) {
    throw new Error("Abrí la sección ACTIVIDADES de Campus UCES antes de importar.");
  }

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
  const seen = new Set();
  const now = new Date();

  const activities = elements
    .map((element) => buildActivityFromElement(element, now, seen))
    .filter(Boolean)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return activities.slice(0, 50);
}

function buildActivityFromElement(element, now, seen) {
  const text = cleanText(element.innerText || "");

  if (text.length < 20 || text.length > 800) {
    return null;
  }

  if (/(cerrad|entregad|completad|finalizad|vencid|calificad)/i.test(text)) {
    return null;
  }

  const dueAt = parseDueAtFromText(text);
  const hasUpcomingHint = /(proxim|pendient|abierta|fecha de entrega|fecha limite|vence|entrega)/i.test(
    text
  );

  if (!dueAt && !hasUpcomingHint) {
    return null;
  }

  if (!dueAt || dueAt.getTime() < now.getTime()) {
    return null;
  }

  const title = extractTitle(element);
  if (!title) {
    return null;
  }

  const subject = extractSubject(element, text);
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
    element.querySelector('h1, h2, h3, h4, strong, b, a, .title, .name, .instancename')
      ?.textContent || ""
  );

  if (preferred && preferred.length <= 120) {
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
        !/(actividad|estado|fecha|entrega|vence|pr[oó]xima|pendiente)/i.test(line) &&
        !/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.test(line)
    ) || ""
  );
}

function extractSubject(element, text) {
  const normalizedText = normalizeText(text);
  const matchedSubject = SUBJECT_HINTS.find((subject) =>
    normalizedText.includes(normalizeText(subject))
  );

  if (matchedSubject) {
    return matchedSubject;
  }

  const lines = (element.innerText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);

  const labeledLine = lines.find((line) => /(materia|curso|asignatura|c[aá]tedra)/i.test(line));
  if (labeledLine) {
    return labeledLine.replace(/.*?(materia|curso|asignatura|c[aá]tedra)\s*:?\s*/i, "").trim();
  }

  return "Campus UCES";
}

function parseDueAtFromText(text) {
  const numericMatch = text.match(
    /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\D+(\d{1,2})[:.](\d{2}))?/
  );

  if (numericMatch) {
    const [, day, month, year, hours = "23", minutes = "59"] = numericMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
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

  const textMatch = text.match(
    /(\d{1,2})\s+(ene|enero|feb|febrero|mar|marzo|abr|abril|may|mayo|jun|junio|jul|julio|ago|agosto|sep|sept|septiembre|oct|octubre|nov|noviembre|dic|diciembre)\s+(\d{2,4})(?:\D+(\d{1,2})[:.](\d{2}))?/i
  );

  if (!textMatch) {
    return null;
  }

  const [, day, monthName, year, hours = "23", minutes = "59"] = textMatch;
  const monthIndex = monthMap[monthName.toLowerCase()];
  const fullYear = year.length === 2 ? `20${year}` : year;
  const result = new Date(
    Number(fullYear),
    monthIndex,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0
  );

  return Number.isNaN(result.getTime()) ? null : result;
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
