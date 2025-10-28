// background.js (service worker)

// --- Suspicious TLDs ---
const suspiciousTlds = ['cn', 'ru', 'xyz', 'club', 'top', 'info'];

// --- Utility Functions ---
function getHostname(url) {
  try { return new URL(url).hostname; } 
  catch { return null; }
}
function isIpAddress(hostname) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname || ''); }
function hasPunycode(hostname) { return hostname && hostname.toLowerCase().startsWith('xn--'); }
function containsAtSymbol(url) { return url.includes('@'); }
function suspiciousLength(url) { return url.length > 75; }
function usesHttp(url) { try { return new URL(url).protocol === 'http:'; } catch { return false; } }
function topLevelDomain(hostname) { 
  if (!hostname) return ''; 
  const parts = hostname.split('.'); 
  return parts[parts.length - 1].toLowerCase(); 
}
function domainDiffers(fromPage, link) {
  try { return new URL(fromPage).hostname !== new URL(link, fromPage).hostname; }
  catch { return true; }
}
function containsSuspiciousKeywords(url) {
  const suspicious = ['login','secure','account','verify','update','bank','confirm','password','signin','pay'];
  const lower = url.toLowerCase();
  return suspicious.filter(s => lower.includes(s));
}
function scoreFromChecks(checks) {
  let score = 100;
  if (checks.isIp) score -= 40;
  if (checks.punycode) score -= 30;
  if (checks.hasAt) score -= 30;
  if (checks.http) score -= 30;
  if (checks.suspiciousLength) score -= 15;
  if (checks.external) score -= 10;
  if (checks.suspKeywords.length > 0) score -= Math.min(25, 5 * checks.suspKeywords.length);
  if (checks.suspTld) score -= 15;
  return Math.max(0, Math.min(score, 100));
}

// --- Offline OpenPhish Feed ---
let openPhishSet = new Set();
async function loadOfflineOpenPhish() {
  try {
    const res = await fetch(chrome.runtime.getURL('feeds/openphish_offline.json'));
    const urls = await res.json();
    openPhishSet = new Set(urls.map(u => u.toLowerCase()));
    console.log('[LinkGuard] Offline OpenPhish loaded:', openPhishSet.size, 'entries');
  } catch (e) {
    console.error('[LinkGuard] Failed to load offline OpenPhish:', e);
  }
}
function isUrlKnownPhish(url) {
  const normalized = url.toLowerCase();
  for (let bad of openPhishSet) {
    if (normalized.includes(bad)) {
      return { matched: true, source: 'offline OpenPhish feed' };
    }
  }
  return { matched: false };
}

// --- ML Model ---
let model = null;
async function loadModel() {
  try {
    const res = await fetch(chrome.runtime.getURL('model.json'));
    model = await res.json();
    console.log('[LinkGuard] ML model loaded');
  } catch (e) {
    console.error('[LinkGuard] Failed to load ML model', e);
  }
}

function shannonEntropy(s) {
  if (!s) return 0;
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  let ent = 0;
  const L = s.length;
  for (const k in freq) {
    const p = freq[k] / L;
    ent -= p * Math.log2(p);
  }
  return ent;
}

function extractFeaturesJS(rawUrl) {
  if (!/:\//.test(rawUrl)) rawUrl = 'http://' + rawUrl;
  const u = new URL(rawUrl);
  const hostname = u.hostname || '';
  const pathname = u.pathname || '';
  const query = u.search ? u.search.slice(1) : '';
  const parts = hostname.split('.');
  const susp_keywords_list = ['login','secure','account','verify','update','bank','confirm','password','signin','pay','credit','card'];

  return [
    rawUrl.length,
    hostname.length,
    Math.max(0, parts.length - 2),
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ? 1 : 0,
    hostname.startsWith('xn--') ? 1 : 0,
    u.protocol === 'http:' ? 1 : 0,
    query.length,
    (new URLSearchParams(query)).toString().split('&').filter(Boolean).length,
    pathname.length,
    (rawUrl.match(/\d/g) || []).length,
    (hostname.match(/-/g) || []).length,
    susp_keywords_list.reduce((acc,k)=>acc+(rawUrl.toLowerCase().includes(k)?1:0),0),
    shannonEntropy(pathname),
    ['cn','ru','xyz','club','top','info','pw','icu','zip','loan'].includes(parts[parts.length-1]) ? 1 : 0
  ];
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function predictUrlPhishProb(rawUrl) {
  if (!model) return 0.0;
  const feats = extractFeaturesJS(rawUrl);
  const means = model.scaler.means;
  const stds = model.scaler.stds;
  const scaled = feats.map((v,i)=>(v-means[i])/stds[i]);
  let linear = model.intercept;
  for (let i=0;i<model.coef.length;i++) linear += model.coef[i]*scaled[i];
  return sigmoid(linear);
}

// --- Handle messages from content scripts ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'assessLink') return;

  (async () => {
    const url = message.url;
    const pageUrl = message.pageUrl || '';

    // 1️⃣ Feed check
    const feedCheck = isUrlKnownPhish(url);
    if (feedCheck.matched) {
      sendResponse({ level: 'dangerous', score: 5, reasons: [`URL appears in ${feedCheck.source}.`] });
      return;
    }

    // 2️⃣ Heuristic checks
    const hostname = getHostname(url);
    const checks = {
      isIp: isIpAddress(hostname),
      punycode: hasPunycode(hostname),
      hasAt: containsAtSymbol(url),
      suspiciousLength: suspiciousLength(url),
      http: usesHttp(url),
      external: domainDiffers(pageUrl, url),
      suspKeywords: containsSuspiciousKeywords(url),
      suspTld: suspiciousTlds.includes(topLevelDomain(hostname))
    };

    let score = scoreFromChecks(checks);
    let level = 'safe';
    if (score < 40) level = 'dangerous';
    else if (score < 70) level = 'suspicious';

    const reasons = [];
    if (checks.isIp) reasons.push('Link uses IP address.');
    if (checks.punycode) reasons.push('Domain uses punycode.');
    if (checks.hasAt) reasons.push('Contains "@" in URL.');
    if (checks.http) reasons.push('Uses HTTP (not encrypted).');
    if (checks.suspiciousLength) reasons.push('Very long URL.');
    if (checks.external) reasons.push('External domain link.');
    if (checks.suspKeywords.length) reasons.push('Suspicious keywords: ' + checks.suspKeywords.join(', '));
    if (checks.suspTld) reasons.push('Suspicious TLD.');

    // 3️⃣ ML Model check
    const mlProb = predictUrlPhishProb(url);
    if (mlProb >= 0.8) {
      reasons.push(`ML model flags this URL (p=${mlProb.toFixed(2)})`);
      score = Math.min(score, 20);
      level = 'dangerous';
    }

    if (level === 'safe') reasons.unshift('Looks safe by heuristics.');

    sendResponse({ level, score, reasons, mlProb });
  })();

  return true; // indicates async sendResponse
});

// --- Initialize ---
(async function init() {
  await loadOfflineOpenPhish();
  await loadModel();
})();
