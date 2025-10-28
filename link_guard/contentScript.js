(() => {
  if (typeof document === "undefined") return;
  if (window.__linkGuardInjected) return;
  window.__linkGuardInjected = true;

  // --- Modal HTML ---
  const modalHtml = `
    <div id="lg-overlay" class="lg-hidden">
      <div id="lg-modal">
        <div id="lg-header">
          <span id="lg-title">🔒 LinkGuard Safety Check</span>
          <button id="lg-close" aria-label="close">✕</button>
        </div>
        <div id="lg-body">
          <p id="lg-resultText">Analyzing...</p>
          <ul id="lg-reasons"></ul>
        </div>
        <div id="lg-footer">
          <button id="lg-go" class="lg-btn">Continue Anyway</button>
          <button id="lg-back" class="lg-btn lg-secondary">Go Back</button>
          <button id="lg-report" class="lg-btn lg-secondary">Report Phish</button>
        </div>
      </div>
    </div>
  `;

  const container = document.createElement("div");
  container.innerHTML = modalHtml;
  document.documentElement.appendChild(container);

  // --- DOM Elements ---
  const overlay = document.getElementById("lg-overlay");
  if (!overlay) return;
  const resultText = document.getElementById("lg-resultText");
  const reasonsList = document.getElementById("lg-reasons");
  const goBtn = document.getElementById("lg-go");
  const backBtn = document.getElementById("lg-back");
  const closeBtn = document.getElementById("lg-close");
  const reportBtn = document.getElementById("lg-report");

  // --- Modal Styles ---
  const style = document.createElement("style");
  style.textContent = `
    #lg-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
      z-index: 999999;
    }
    #lg-modal {
      background: #1e1e1e; color: #ffffff; border-radius: 16px; padding: 20px;
      width: 400px; max-width: 90%; text-align: center;
      box-shadow: 0 0 25px rgba(0,0,0,0.5);
      animation: fadeIn 0.25s ease-in-out;
      font-family: 'Segoe UI', sans-serif;
    }
    #lg-header span { color: #440303ff; }
    #lg-close{ color: #dd3636ff }
    #lg-body p, #lg-reasons li, #lg-footer button { color: #ffffff; }
    #lg-footer { display: flex; justify-content: space-evenly; margin-top: 15px; }
    .lg-btn { padding: 8px 14px; border-radius: 8px; border: none; cursor: pointer; }
    .lg-btn.lg-secondary { background: #444; color: #ffffff; }
    .lg-btn:not(.lg-secondary) { background: #e63946; color: #ffffff; }
    .lg-hidden { display: none !important; }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity:1; transform: scale(1); } }
    #lg-reasons details pre {
      background: #2b2b2b; color: #fff; padding: 8px; border-radius: 6px; border: 1px solid #555;
      font-size: 12px; text-align: left; white-space: pre-wrap;
    }
    #lg-reasons details summary { cursor: pointer; color: #00aaff; }
  `;
  document.head.appendChild(style);

  // --- State ---
  let lastHref = null;
  let lastTarget = null;
  let lastEvent = null;

  // --- Utility: Safe sendMessage with timeout ---
  function sendMessageSafe(msg, timeout = 1000) {
    return new Promise(resolve => {
      let called = false;
      try {
        chrome.runtime.sendMessage(msg, resp => {
          if (!called) { called = true; resolve(resp); }
        });
        setTimeout(() => { if (!called) resolve(null); }, timeout);
      } catch (e) {
        resolve(null);
      }
    });
  }

  // --- Functions ---
  function showModal(assessment, href, target) {
    lastHref = href;
    lastTarget = target;

    const level = assessment.level || "unknown";
    const prob = assessment.mlProb ? (assessment.mlProb * 100).toFixed(1) + "%" : "N/A";

    const icons = { safe: "🟢", suspicious: "🟠", dangerous: "🔴" };
    resultText.innerHTML = `
      ${icons[level]} <strong>${level.toUpperCase()}</strong> (${assessment.score}/100)<br>
      ML Probability: ${prob}
    `;
    if (level === "safe") resultText.style.color = "#00ff00";
    else if (level === "suspicious") resultText.style.color = "#ffaa00";
    else if (level === "dangerous") resultText.style.color = "#ff4444";
    else resultText.style.color = "#ffffff";

    reasonsList.innerHTML = "";
    (assessment.reasons || []).forEach(r => {
      const li = document.createElement("li"); li.textContent = r; reasonsList.appendChild(li);
    });

    const details = document.createElement("details");
    details.innerHTML = `<summary>🔍 Show Technical Details</summary><pre>${JSON.stringify(assessment, null, 2)}</pre>`;
    reasonsList.appendChild(details);

    overlay.classList.remove("lg-hidden");
  }

  function hideModal() { if (overlay) overlay.classList.add("lg-hidden"); }

  function continueToLink() {
    hideModal();
    if (!lastHref) return;
    if (lastTarget === "_blank" || (lastEvent && (lastEvent.metaKey || lastEvent.ctrlKey || lastEvent.shiftKey))) {
      window.open(lastHref, "_blank", "noopener");
    } else window.location.href = lastHref;
  }

  // --- Event Listeners ---
  goBtn.addEventListener("click", continueToLink);
  backBtn.addEventListener("click", hideModal);
  closeBtn.addEventListener("click", hideModal);
  reportBtn.addEventListener("click", async () => {
    console.log("[LinkGuard] Reported suspicious URL:", lastHref);
    alert("Thank you for reporting this suspicious link!");
    hideModal();
    await sendMessageSafe({ type: "reportLink", url: lastHref });
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) hideModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideModal(); });

  // --- Capture Link Clicks ---
  document.addEventListener("click", async e => {
    if (e.button !== 0) return;
    let el = e.target, depth = 0;
    while (el && el.nodeName !== "A" && depth < 10) { el = el.parentElement; depth++; }
    if (!el || el.nodeName !== "A") return;

    const href = el.getAttribute("href") || el.href;
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;

    e.preventDefault(); e.stopPropagation();
    lastEvent = e; lastTarget = el.target || null;

    const resp = await sendMessageSafe({ type: "assessLink", url: href, pageUrl: window.location.href });
    if (!resp) window.location.href = href;
    else showModal(resp, href, el.target);
  }, true);
})();
