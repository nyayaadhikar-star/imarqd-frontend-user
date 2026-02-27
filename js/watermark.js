// js/watermark.js

document.addEventListener("DOMContentLoaded", () => {
  const zone = document.getElementById("watermarkZone");
  const input = document.getElementById("watermarkInput");
  const preview = document.getElementById("watermarkPreview");
  const previewImg = document.getElementById("watermarkPreviewImg");
  const previewInfo = document.getElementById("watermarkPreviewInfo");
  const processing = document.getElementById("watermarkProcessing");
  const downloadBtn = document.getElementById("downloadBtn");
  const msg = document.getElementById("watermarkMessage");

  if (!zone || !input) return;

  let protectedBlobUrl = null;
  let protectedFilename = null;
  let lastMediaId = null;

  function setMsg(type, text) {
    if (!msg) return;
    msg.style.display = text ? "flex" : "none";
    msg.className = `message message-${type || "info"}`;
    msg.innerText = text || "";
  }

  function genMediaId0x() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return (
      "0x" +
      Array.from(arr)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function downloadBlobUrl(blobUrl, filename) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  zone.addEventListener("click", () => input.click());

  zone.addEventListener("dragover", e => {
    e.preventDefault();
    zone.classList.add("dragover");
  });

  zone.addEventListener("dragleave", () =>
    zone.classList.remove("dragover")
  );

  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files?.[0]) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change"));
    }
  });

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!SESSION?.email_sha || !SESSION?.email) {
      setMsg("error", "Not logged in.");
      return;
    }

    zone.style.display = "none";
    preview.style.display = "none";
    downloadBtn.style.display = "none";
    processing.style.display = "block";
    setMsg("info", "Applying invisible watermark…");

    try {
      // 1️⃣ Generate media ID
      lastMediaId = genMediaId0x();

      // 2️⃣ EXACT payload format (matches Swagger)
      const textPayload = `owner:${SESSION.email_sha}|media:${lastMediaId}`;

      // 3️⃣ Send ORIGINAL FILE (NO conversion)
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("text", textPayload);
      fd.append("preset", "facebook");
      fd.append("media_label", file.name);
      if (SESSION.uuid) fd.append("user_uuid", SESSION.uuid);

      const wmRes = await fetch(API() + "/api/watermark/image", {
        method: "POST",
        headers: authHeaders(),
        body: fd
      });

      if (!wmRes.ok) {
        throw new Error(
          `Watermark failed (${wmRes.status}): ${await wmRes.text()}`
        );
      }

      // 4️⃣ RAW API RESPONSE (bit-perfect)
      const wmBlob = await wmRes.blob();
      protectedBlobUrl && URL.revokeObjectURL(protectedBlobUrl);
      protectedBlobUrl = URL.createObjectURL(wmBlob);

      protectedFilename =
        file.name.replace(/\.[^.]+$/, "") + "_protected" +
        (file.name.match(/\.[^.]+$/)?.[0] || ".png");

      // 5️⃣ Save media_id
      const qs = new URLSearchParams({
        email: SESSION.email,
        email_sha: SESSION.email_sha,
        media_id: lastMediaId,
        label: file.name,
        user_uuid: SESSION.uuid || ""
      });

      const saveRes = await fetch(
        API() + "/media/auto-save?" + qs.toString(),
        { method: "POST", headers: authHeaders() }
      );

      if (!saveRes.ok) {
        throw new Error("Media ID save failed");
      }

      // UI
      previewImg.src = protectedBlobUrl;
      previewInfo.innerText =
        `Saved ✓\nmedia_id: ${lastMediaId}\nowner: ${SESSION.email_sha.slice(0, 24)}…`;

      processing.style.display = "none";
      preview.style.display = "block";
      downloadBtn.style.display = "block";
      setMsg("success", "✅ Watermarked successfully");

    } catch (err) {
      console.error(err);
      processing.style.display = "none";
      zone.style.display = "block";
      setMsg("error", err.message || "Watermark failed");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (protectedBlobUrl && protectedFilename) {
      downloadBlobUrl(protectedBlobUrl, protectedFilename);
    }
  });
});