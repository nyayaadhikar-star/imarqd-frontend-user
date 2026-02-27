// js/verify.js

document.addEventListener("DOMContentLoaded", () => {

  const zone = document.getElementById("verifyZone");
  const input = document.getElementById("verifyInput");
  const processing = document.getElementById("verifyProcessing");
  const msg = document.getElementById("verifyMessage");

  if (!zone || !input) return;

  function setMessage(type, text) {
    if (!msg) return;
    msg.style.display = "flex";
    msg.className = `message message-${type}`;
    msg.innerText = text;
  }

  // ===============================
  // Fetch User Media IDs
  // ===============================
  async function fetchUserMediaIds() {

    // console.log("SESSION:", SESSION);

    const qs = new URLSearchParams({
      owner_sha: SESSION.email_sha
    });

    const url = API() + "/api/media/ids/me?" + qs.toString();

    // console.log("Fetching media IDs from:", url);

    const res = await fetch(url, {
      method: "GET",
      headers: authHeaders()
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error("Unable to fetch media IDs.");
    }

    const data = await res.json();

    // console.log("Fetched media rows:", data);

    return data;
  }

  // ===============================
  // Verify Against Single Media ID
  // ===============================
  async function checkSingleMedia(file, mediaId) {

    const mediaIdNorm = String(mediaId).startsWith("0x")
      ? String(mediaId)
      : `0x${mediaId}`;

    const checkText = `owner:${SESSION.email_sha}|media:${mediaIdNorm}`;

    // console.log("Checking media ID:", mediaIdNorm);
    // console.log("Using checkText:", checkText);

    // console.log("VERIFY FILE DETAILS:");
    // console.log("Name:", file.name);
    // console.log("Type:", file.type);
    // console.log("Size:", file.size);

    const fd = new FormData();
    fd.append("file", file);

    // Must match embed parameters exactly
    fd.append("payload_bitlen", "768");
    fd.append("qim_step", "24");
    fd.append("repetition", "160");
    fd.append("use_y_channel", "true");
    fd.append("use_ecc", "true");
    fd.append("ecc_parity_bytes", "64");

    fd.append("check_text", checkText);

    const res = await fetch(API() + "/api/watermark/image/extract", {
      method: "POST",
      headers: authHeaders(),
      body: fd
    });

    if (!res.ok) {
      // console.log("Extract failed:", await res.text());
      return { match: false, similarity: 0 };
    }

    const data = await res.json();

    // console.log("Extract response:", data);

    const sim = typeof data.similarity === "number"
      ? data.similarity
      : 0;

    return {
      match: sim >= 0.90,
      similarity: sim
    };
  }

  // ===============================
  // Drag & Drop Handling
  // ===============================
  zone.addEventListener("click", () => input.click());

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("dragover");
  });

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change"));
    }
  });

  // ===============================
  // Main Verify Flow
  // ===============================
  input.addEventListener("change", async () => {

    const file = input.files?.[0];
    if (!file) return;

    if (!SESSION || !SESSION.email_sha) {
      setMessage("error", "Please login first.");
      return;
    }

    processing.style.display = "block";
    setMessage("info", "Verifying ownership...");

    try {

      const mediaData = await fetchUserMediaIds();

      if (!mediaData?.items?.length) {
        throw new Error("No registered media found for this account.");
      }

      let matchFound = false;

      for (const row of mediaData.items) {

        const mediaId = row.media_id;

        const result = await checkSingleMedia(file, mediaId);

        if (result.match) {
          matchFound = true;
          break;
        }
      }

      processing.style.display = "none";

      if (matchFound) {
        setMessage("success", "Ownership verified successfully.");
      } else {
        setMessage("error", "This image is not watermarked or not owned by you.");
      }

    } catch (e) {
      processing.style.display = "none";
      setMessage("error", e.message || "Verification failed.");
      console.error(e);
    }

  });

});