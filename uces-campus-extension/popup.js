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
      throw new Error("Abrí primero Campus UCES en la sección ACTIVIDADES.");
    }

    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "UCES_EXTRACT_ACTIVITIES",
    });

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
      await chrome.tabs.sendMessage(appTab.id, {
        type: "UCES_IMPORT_TO_APP",
        assignments: response.activities,
      });
      setStatus(`Se importaron ${response.activities.length} actividades en la app.`);
      return;
    }

    await chrome.tabs.create({ url: DEFAULT_APP_URL });
    setStatus(
      `Se prepararon ${response.activities.length} actividades. La app las recibirá al abrirse.`
    );
  } catch (error) {
    setStatus(error.message || "Ocurrió un error durante la importación.", true);
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
