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
  let protectedFilename = "protected_image.png";
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
    const hex = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
    return "0x" + hex;
  }

  function downloadBlobUrl(blobUrl, filename) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "protected_image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function toPngFile(file) {
    // Convert any browser-decodable image to PNG to avoid backend decode issues.
    // If the browser can't decode (common for HEIC), we show a clear message.
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 1.0)
      );
      if (!blob) throw new Error("PNG conversion failed.");

      return new File([blob], (file.name || "image").replace(/\.[^.]+$/, "") + ".png", {
        type: "image/png"
      });
    } catch (e) {
      // Likely HEIC/HEIF or unsupported decode
      throw new Error(
        "This image format is not supported for watermarking in browser. Please upload JPG/PNG (avoid HEIC/HEIF)."
      );
    }
  }

  zone.addEventListener("click", () => input.click());

  // drag/drop support
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      // note: assigning input.files directly can fail in some browsers, but change event will still run for click flow
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change"));
    }
  });

  input.addEventListener("change", async () => {
    const rawFile = input.files?.[0];
    if (!rawFile) return;

    if (!SESSION || !SESSION.email || !SESSION.email_sha || !SESSION.token) {
      setMsg("error", "Not logged in. Please login again.");
      return;
    }

    // UI
    zone.style.display = "none";
    preview.style.display = "none";
    downloadBtn.style.display = "none";
    processing.style.display = "block";
    setMsg("info", "Preparing image...");

    try {
      // 0) Convert input to PNG for reliable backend decode
      const file = await toPngFile(rawFile);

      // 1) Create media_id and watermark payload
      lastMediaId = genMediaId0x();
      const textPayload = `${SESSION.email_sha}|${lastMediaId}`;

      // 2) Watermark
      setMsg("info", "Applying watermark...");
      const fd = new FormData();
      fd.append("file", file, file.name);          // ensure filename is sent
      fd.append("text", textPayload);

      // optional knobs
      fd.append("preset", "facebook");
      fd.append("media_label", rawFile.name);
      if (SESSION.uuid) fd.append("user_uuid", SESSION.uuid);

      const wmRes = await fetch(API() + "/api/watermark/image", {
        method: "POST",
        headers: authHeaders(), // Authorization only, do NOT set Content-Type for FormData
        body: fd
      });

      if (!wmRes.ok) {
        const t = await wmRes.text();
        throw new Error(`Watermark failed (HTTP ${wmRes.status}): ${t}`);
      }

      const wmBlob = await wmRes.blob();
      if (protectedBlobUrl) URL.revokeObjectURL(protectedBlobUrl);
      protectedBlobUrl = URL.createObjectURL(wmBlob);

      protectedFilename =
        (rawFile.name?.replace(/\.[^.]+$/, "") || "image") + "_protected.png";

      // 3) Save media_id to DB using /media/auto-save (the one you tested)
      setMsg("info", "Saving Media ID to database...");
      const qs = new URLSearchParams({
        email: SESSION.email,
        email_sha: SESSION.email_sha,
        media_id: lastMediaId,
        label: rawFile.name,
        user_uuid: SESSION.uuid || ""
      });

      const saveRes = await fetch(API() + "/media/auto-save?" + qs.toString(), {
        method: "POST",
        headers: authHeaders()
      });

      if (!saveRes.ok) {
        const t = await saveRes.text();
        throw new Error(`DB save failed (HTTP ${saveRes.status}): ${t}`);
      }

      const saveJson = await saveRes.json();
      if (!saveJson || saveJson.ok !== true) {
        throw new Error(`DB save failed: ${JSON.stringify(saveJson)}`);
      }

      // 4) UI success
      previewImg.src = protectedBlobUrl;
      if (previewInfo) {
        previewInfo.innerText =
          `Saved ✓  media_id: ${lastMediaId}\n` +
          `owner_sha: ${SESSION.email_sha.slice(0, 24)}…`;
      }

      processing.style.display = "none";
      preview.style.display = "block";
      downloadBtn.style.display = "block";
      setMsg("success", "✅ Watermarked + Media ID saved.");

    } catch (e) {
      console.error(e);
      processing.style.display = "none";
      zone.style.display = "block";
      setMsg("error", e.message || String(e));
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!protectedBlobUrl) return;
    downloadBlobUrl(protectedBlobUrl, protectedFilename);
  });
});