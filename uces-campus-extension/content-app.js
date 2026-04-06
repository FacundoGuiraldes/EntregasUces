chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "UCES_IMPORT_TO_APP") {
    return undefined;
  }

  const imported = dispatchAssignmentsToPage(message.assignments || []);
  if (imported) {
    chrome.storage.local.remove("ucesPendingImport");
  }

  sendResponse({ ok: imported });
  return true;
});

window.addEventListener("load", () => {
  setTimeout(importPendingAssignments, 500);
});

async function importPendingAssignments() {
  if (!isTargetApp()) {
    return;
  }

  const stored = await chrome.storage.local.get(["ucesPendingImport"]);
  const assignments = stored.ucesPendingImport;

  if (!Array.isArray(assignments) || !assignments.length) {
    return;
  }

  const imported = dispatchAssignmentsToPage(assignments);
  if (imported) {
    await chrome.storage.local.remove("ucesPendingImport");
  }
}

function dispatchAssignmentsToPage(assignments) {
  if (!isTargetApp() || !Array.isArray(assignments) || !assignments.length) {
    return false;
  }

  window.postMessage(
    {
      type: "UCES_IMPORT_ACTIVITIES",
      source: "uces-campus-extension",
      assignments,
    },
    "*"
  );

  return true;
}

function isTargetApp() {
  return Boolean(document.getElementById("assignmentForm"));
}
