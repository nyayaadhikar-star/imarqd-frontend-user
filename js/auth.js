// js/auth.js

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const loginScreen = document.getElementById("loginScreen");
  const app = document.getElementById("app");
  const err = document.getElementById("loginError");

  // Try multiple possible IDs (so we don't break on small HTML changes)
  const emailEl =
    document.getElementById("loginEmail") ||
    document.getElementById("signupEmail") ||
    document.getElementById("email");

  const passEl =
    document.getElementById("loginPassword") ||
    document.getElementById("password") ||
    document.getElementById("signupPassword");

  // Restore session
  const saved = localStorage.getItem("imarqd_session");
  if (saved && loginScreen && app) {
    SESSION = JSON.parse(saved);
    loginScreen.style.display = "none";
    app.style.display = "block";
  }

  if (!loginBtn) return;

  loginBtn.addEventListener("click", async () => {
    if (!emailEl || !passEl) {
      if (err) {
        err.style.display = "block";
        err.innerText =
          "Login inputs not found. Check IDs: loginEmail/loginPassword in index.html.";
      }
      console.error("Missing login input elements", { emailEl, passEl });
      return;
    }

    const email = (emailEl.value || "").trim();
    const password = (passEl.value || "").trim();

    if (err) err.style.display = "none";

    if (!email || !password) {
      if (err) {
        err.innerText = "Email and password required";
        err.style.display = "block";
      }
      return;
    }

    try {
      const res = await fetch(API() + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Invalid credentials");

      const data = await res.json();

      SESSION = {
  token: data.token,
  email: data.email,
  uuid: data.uuid,
  email_sha: data.email_sha,
  apiBase: API()   // ✅ important
};

      localStorage.setItem("imarqd_session", JSON.stringify(SESSION));

      if (loginScreen) loginScreen.style.display = "none";
      if (app) app.style.display = "block";
    } catch (e) {
      if (err) {
        err.innerText = e.message;
        err.style.display = "block";
      }
    }
  });
});


// Logout (global so other modules can use it)
window.doLogout = function () {
  SESSION = null;
  localStorage.removeItem("imarqd_session");

  const loginScreen = document.getElementById("loginScreen");
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  if (loginScreen) loginScreen.style.display = "flex";
};

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", window.doLogout);
});