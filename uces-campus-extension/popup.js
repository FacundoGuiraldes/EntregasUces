const syncBtn = document.getElementById("syncBtn");
const statusEl = document.getElementById("status");

const DEFAULT_APP_URL =
  "file:///C:/Users/facun/OneDrive/Escritorio/AppProximasEntregas/index.html";

syncBtn.addEventListener("click", handleSync);

async function handleSync() {
  setStatus("Extrayendo actividades próximas desde Campus UCES...");

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id || !/uces\.edu\.ar/i.test(activeTab.url || "")) {
      throw new Error(
        "Abrí primero una unidad o la sección ACTIVIDADES dentro de Campus UCES."
      );
    }

    const response = await sendMessageWithRetry(
      activeTab.id,
      { type: "UCES_EXTRACT_ACTIVITIES" },
      ["content-campus.js"]
    );

    if (!response?.ok) {
      throw new Error(
        response?.error || "No se pudieron detectar actividades próximas en la página."
      );
    }

    await chrome.storage.local.set({
      ucesPendingImport: response.activities,
      ucesPendingImportAt: Date.now(),
    });

    const appTab = await findAppTab();

    if (appTab?.id) {
      await chrome.tabs.update(appTab.id, { active: true });
      const delivered = await tryDeliverToApp(appTab.id, response.activities);

      if (delivered) {
        setStatus(`Se importaron ${response.activities.length} actividades en la app.`);
        return;
      }
    }

    await chrome.tabs.create({ url: DEFAULT_APP_URL });
    setStatus(
      `Se prepararon ${response.activities.length} actividades. La app las recibirá al abrirse.`
    );
  } catch (error) {
    setStatus(error.message || "Ocurrió un error durante la importación.", true);
  }
}

async function sendMessageWithRetry(tabId, message, files) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const errorMessage = error?.message || "";

    if (!/Receiving end does not exist|Could not establish connection/i.test(errorMessage)) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });

    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function tryDeliverToApp(tabId, assignments) {
  try {
    const response = await sendMessageWithRetry(
      tabId,
      {
        type: "UCES_IMPORT_TO_APP",
        assignments,
      },
      ["content-app.js"]
    );

    return Boolean(response?.ok);
  } catch (error) {
    const message = error?.message || "";

    if (/Cannot access contents of url|Cannot access a chrome:\/\//i.test(message)) {
      setStatus(
        "La app está abierta pero el navegador no permite conectarla todavía. Si usás file:/// activá 'Allow access to file URLs' y recargá la extensión.",
        true
      );
      return false;
    }

    throw error;
  }
}

async function findAppTab() {
  const tabs = await chrome.tabs.query({});

  return tabs.find((tab) => {
    const url = tab.url || "";
    return (
      url.includes("localhost:3000") ||
      url.includes("127.0.0.1") ||
      url.includes("facundoguiraldes.github.io/EntregasUces") ||
      url.includes("AppProximasEntregas/index.html")
    );
  });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}
