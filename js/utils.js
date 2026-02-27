function API() {
  // Prefer apiBase stored in session
  if (SESSION && SESSION.apiBase) return String(SESSION.apiBase).replace(/\/+$/, "");

  // If you still have cfgApiBase in some versions, use it safely
  const cfg = document.getElementById("cfgApiBase");
  if (cfg && cfg.value) return String(cfg.value).replace(/\/+$/, "");

  // Final fallback (your deployed backend)
  return "https://imarqd-backend-app.azurewebsites.net";
}

function sha256hex(s) {
  return crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(s)
  ).then(buf =>
    Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

function toast(id, type, html, ms = 8000) {
  const el = document.getElementById(id);
  el.className = 'toast toast-' + type;
  el.innerHTML = html;
  el.style.display = 'block';
  if (ms > 0) {
    setTimeout(() => el.style.display = 'none', ms);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn')
    .forEach(btn => btn.classList.remove('active'));

  document.querySelectorAll('.tab-panel')
    .forEach(p => p.classList.remove('active'));

  document.querySelector(`[onclick="switchTab('${name}')"]`)
    .classList.add('active');

  document.getElementById('panel-' + name)
    .classList.add('active');
}


function authHeaders(extra) {
  const headers = extra || {};
  if (SESSION && SESSION.token) {
    headers["Authorization"] = "Bearer " + SESSION.token;
  }
  return headers;
}


function genMediaIdHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function downloadBlobUrl(blobUrl, filename) {
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename || "protected_image.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}