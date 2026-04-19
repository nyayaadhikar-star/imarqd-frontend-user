// js/auth.js
// iMARQd — Real authentication wiring
// Handles: login, signup (toggle), logout, session restore
// Session stored as "imarqd_session" in localStorage — compatible with
// watermark.js / verify.js / main.js that read the global SESSION variable.

document.addEventListener("DOMContentLoaded", () => {

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const loginScreen    = document.getElementById("loginScreen");
  const app            = document.getElementById("app");
  const loginBtn       = document.getElementById("loginBtn");
  const logoutBtn      = document.getElementById("logoutBtn");
  const emailEl        = document.getElementById("loginEmail");
  const passEl         = document.getElementById("loginPassword");
  const errEl          = document.getElementById("loginError");
  const authTitle      = document.getElementById("authTitle");
  const authSubtitle   = document.getElementById("authSubtitle");
  const authToggleText = document.getElementById("authToggleText");

  if (!loginBtn) return; // guard: not on a page with login UI

  // ── State ─────────────────────────────────────────────────────────────────
  let authMode = "login"; // "login" | "signup"

  // ── UI helpers ────────────────────────────────────────────────────────────
  function showError(msg) {
    errEl.textContent   = msg;
    errEl.style.display = "block";
  }

  function clearError() {
    errEl.textContent   = "";
    errEl.style.display = "none";
  }

  function setLoading(on) {
    loginBtn.disabled    = on;
    loginBtn.textContent = on
      ? (authMode === "login" ? "Signing in\u2026" : "Creating account\u2026")
      : (authMode === "login" ? "Sign In"           : "Create Account");
  }

  // ── Session helpers ───────────────────────────────────────────────────────
  function saveSession(data) {
    SESSION = {
      token:     data.token,
      uuid:      data.uuid,
      email:     data.email,
      email_sha: data.email_sha,
      apiBase:   API()
    };
    localStorage.setItem("imarqd_session", JSON.stringify(SESSION));
  }

  function clearSessionData() {
    SESSION = null;
    localStorage.removeItem("imarqd_session");
  }

  function showApp() {
    if (loginScreen) loginScreen.style.display = "none";
    if (app)         app.style.display         = "block";
  }

  function showLogin() {
    if (app)         app.style.display         = "none";
    if (loginScreen) loginScreen.style.display = "";
    if (emailEl)     emailEl.value             = "";
    if (passEl)      passEl.value              = "";
    clearError();
  }

  // ── Login / Signup toggle ─────────────────────────────────────────────────
  function setMode(mode) {
    authMode = mode;
    if (mode === "login") {
      if (authTitle)    authTitle.textContent    = "Welcome to iMARQd";
      if (authSubtitle) authSubtitle.textContent = "Sign in to protect your digital content";
      loginBtn.textContent = "Sign In";
      if (authToggleText)
        authToggleText.innerHTML =
          'Don\'t have an account? <a href="#" id="authToggleLink">Sign Up</a>';
    } else {
      if (authTitle)    authTitle.textContent    = "Create your account";
      if (authSubtitle) authSubtitle.textContent = "Start protecting your digital content";
      loginBtn.textContent = "Create Account";
      if (authToggleText)
        authToggleText.innerHTML =
          'Already have an account? <a href="#" id="authToggleLink">Sign In</a>';
    }
    const link = document.getElementById("authToggleLink");
    if (link) link.addEventListener("click", handleToggle);
    clearError();
  }

  function handleToggle(e) {
    e.preventDefault();
    setMode(authMode === "login" ? "signup" : "login");
  }

  // ── API call ──────────────────────────────────────────────────────────────
  // Reads body as text first so a plain-text 500 never throws a JSON parse crash
  async function callAuthAPI(email, password) {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";

    let res;
    try {
      res = await fetch(API() + endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password })
      });
    } catch (networkErr) {
      throw new Error("Network error \u2014 please check your connection and try again.");
    }

    // Safe parse: server may return plain text on 5xx (e.g. Azure "Internal Server Error")
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}

    if (!res.ok) {
      const detail = data && data.detail;
      if (Array.isArray(detail))      throw new Error(detail.map(d => d.msg).join(", "));
      if (typeof detail === "string") throw new Error(detail);
      // Non-JSON body or unrecognised shape — show a friendly message
      throw new Error(
        authMode === "login"
          ? "Login failed. Please check your credentials and try again."
          : "Could not create account. Please try again later."
      );
    }

    return data; // { token, uuid, email, email_sha }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    clearError();
    const email    = (emailEl ? emailEl.value : "").trim();
    const password = passEl ? passEl.value : "";

    if (!email)              { showError("Please enter your email address."); return; }
    if (!password)           { showError("Please enter your password."); return; }
    if (password.length < 6) { showError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      const data = await callAuthAPI(email, password);
      saveSession(data);
      showApp();
    } catch (e) {
      showError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  window.doLogout = async function () {
    if (SESSION && SESSION.token) {
      try {
        await fetch(API() + "/api/auth/logout", {
          method:  "POST",
          headers: { "Authorization": SESSION.token }
        });
      } catch (_) {}
    }
    clearSessionData();
    showLogin();
  };

  if (logoutBtn) logoutBtn.addEventListener("click", window.doLogout);

  // ── Keyboard UX ───────────────────────────────────────────────────────────
  if (emailEl) emailEl.addEventListener("keydown", function(e) { if (e.key === "Enter" && passEl) passEl.focus(); });
  if (passEl)  passEl.addEventListener("keydown",  function(e) { if (e.key === "Enter") handleSubmit(); });
  loginBtn.addEventListener("click", handleSubmit);

  const initialToggle = document.getElementById("authToggleLink");
  if (initialToggle) initialToggle.addEventListener("click", handleToggle);

  // ── Restore session on page load ──────────────────────────────────────────
  const saved = localStorage.getItem("imarqd_session");
  if (saved) {
    try {
      SESSION = JSON.parse(saved);
      SESSION.apiBase = API();
      showApp();
    } catch (_) {
      clearSessionData();
      showLogin();
    }
  } else {
    showLogin();
  }

});
