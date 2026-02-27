// js/monitor.js (DROP-IN FIX + FULL DEBUG LOGS)

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("searchBtn") || document.getElementById("monitorBtn");
  const input = document.getElementById("handleInput");
  const msg = document.getElementById("searchMessage");
  const results = document.getElementById("searchResults");

  if (!btn) return;

  console.log("✅ Monitor module loaded");

  function setMessage(type, text) {
    if (!msg) return;
    msg.style.display = "flex";
    msg.className = `message message-${type}`;
    msg.innerText = text;
  }

  function normalizeMediaId(id) {
    const s = String(id || "").trim();
    if (!s) return "";
    const out = s.startsWith("0x") ? s : `0x${s}`;
    console.log("🔧 normalizeMediaId:", s, "→", out);
    return out;
  }

  async function fetchUserMediaIds() {
    console.log("🧠 SESSION:", SESSION);

    if (!SESSION?.email_sha) throw new Error("Not logged in (missing email_sha).");

    const qs = new URLSearchParams({ owner_sha: SESSION.email_sha });
    const url = API() + "/api/media/ids/me?" + qs.toString();

    console.log("➡️ GET media IDs:", url);

    const res = await fetch(url, { method: "GET", headers: authHeaders() });
    console.log("⬅️ media IDs status:", res.status);

    if (!res.ok) {
      const t = await res.text();
      console.error("❌ media IDs fetch failed:", t);
      throw new Error("Failed to fetch your media IDs.");
    }

    const data = await res.json();
    console.log("📦 media IDs response:", data);

    const items = data?.items || [];
    const mediaIds = items
      .map((x) => x.media_id)
      .filter(Boolean)
      .map(normalizeMediaId);

    console.log("📋 normalized media IDs:", mediaIds);

    return mediaIds;
  }

  async function fetchImageAsFile(imageUrl) {
    console.log("🌐 Fetching image as blob:", imageUrl);

    const res = await fetch(imageUrl, { method: "GET" });
    console.log("⬅️ image fetch status:", res.status);

    if (!res.ok) {
      throw new Error(`Failed to download image from URL: ${imageUrl}`);
    }

    const blob = await res.blob();
    console.log("📦 blob type:", blob.type, "size:", blob.size);

    // try to infer extension
    let ext = "jpg";
    if (blob.type.includes("png")) ext = "png";
    else if (blob.type.includes("webp")) ext = "webp";
    else if (blob.type.includes("jpeg") || blob.type.includes("jpg")) ext = "jpg";

    const file = new File([blob], `tweet_image.${ext}`, { type: blob.type || "image/jpeg" });

    console.log("📄 Created file:", file.name, file.type, file.size);

    return file;
  }

  async function extractSimilarityFromFile(file, checkText) {
    console.log("🔍 Calling extract with checkText:", checkText);

    const fd = new FormData();
    fd.append("file", file);

    // EXACT params (same as your verify.js working version / Swagger)
    fd.append("payload_bitlen", "768");
    fd.append("qim_step", "24");
    fd.append("repetition", "160");
    fd.append("use_y_channel", "true");
    fd.append("use_ecc", "true");
    fd.append("ecc_parity_bytes", "64");
    fd.append("check_text", checkText);

    // IMPORTANT: do NOT manually set Content-Type for multipart
    const headers = authHeaders();

    const url = API() + "/api/watermark/image/extract";
    console.log("➡️ POST extract:", url);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: fd,
    });

    console.log("⬅️ extract status:", res.status);

    if (!res.ok) {
      const t = await res.text();
      console.warn("⚠️ extract failed:", t);
      return { ok: false, similarity: 0, raw: t };
    }

    const data = await res.json();
    console.log("📦 extract response:", data);

    const sim = typeof data.similarity === "number" ? data.similarity : 0;

    // we’ll accept either similarity >= 0.90 OR match_text_hash true
    const matchTextHash = data.match_text_hash === true;

    return { ok: true, similarity: sim, matchTextHash, raw: data };
  }

  async function verifyImageUrlAgainstAllMediaIds(imageUrl, mediaIds) {
    console.log("🧪 Verifying image URL against ALL media IDs:", imageUrl);

    const file = await fetchImageAsFile(imageUrl);

    for (const mid of mediaIds) {
      const checkText = `owner:${SESSION.email_sha}|media:${mid}`;
      console.log("➡️ Trying mediaId:", mid);
      console.log("➡️ checkText:", checkText);

      const out = await extractSimilarityFromFile(file, checkText);

      console.log("📊 similarity:", out.similarity, "match_text_hash:", out.matchTextHash);

      if (out.matchTextHash || out.similarity >= 0.9) {
        console.log("✅ MATCH FOUND for mediaId:", mid);
        return { match: true, mediaId: mid, extract: out };
      }
    }

    console.log("❌ No match for this image");
    return { match: false };
  }

  btn.addEventListener("click", async () => {
    if (results) results.innerHTML = "";

    let handle = (input?.value || "").trim();
    console.log("👤 handle raw:", handle);

    if (!SESSION?.email_sha) {
      setMessage("error", "Please login first.");
      return;
    }

    if (!handle) {
      setMessage("error", "Enter a Twitter handle.");
      return;
    }

    if (handle.startsWith("@")) handle = handle.slice(1);
    console.log("👤 handle normalized:", handle);

    try {
      setMessage("info", "Fetching your media IDs...");
      const mediaIds = await fetchUserMediaIds();

      if (!mediaIds.length) {
        setMessage("error", "No media IDs found for your account.");
        return;
      }

      // Use the FIRST mediaId for the single twitter call check_text (per your decision)
      const primaryCheckText = `owner:${SESSION.email_sha}|media:${mediaIds[0]}`;
      console.log("🎯 primaryCheckText for Twitter:", primaryCheckText);

      setMessage("info", "Scanning Twitter (single call)...");

      const payload = {
        usernames: [handle],
        hashtags: [],
        max_results: 20,

        // NOTE: your backend expects bearer_token in payload (as per Swagger)
        bearer_token: "AAAAAAAAAAAAAAAAAAAAAE145gEAAAAA8m5n9Iad5pkenaTAGXQurIdbMrE%3DShnqYeRJ4ty8XrljTkJqaUK9Wtub1jbokULLA78RevRAMfIJtD",

        check_text: primaryCheckText,

        extract_params: {
          qim_step: 24,
          repetition: 160,
          ecc_parity_bytes: 64,
          use_y_channel: true,
          use_ecc: true,
          payload_bitlen: 768
        },

        save_images: false,
        save_dir: "downloaded_twitter_images",
        dedupe: true,
        extract_url: "",
        include_raw_twitter_meta: false,
        request_timeout_sec: 20
      };

      console.log("📤 Twitter payload:", payload);

      const scanRes = await fetch(API() + "/api/scanner/twitter/combined", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("⬅️ Twitter status:", scanRes.status);

      if (!scanRes.ok) {
        const t = await scanRes.text();
        console.error("❌ Twitter scan failed:", t);
        setMessage("error", "Twitter scan failed.");
        return;
      }

      const scanData = await scanRes.json();
      console.log("📦 Twitter response:", scanData);

      const items = scanData?.results || [];
      if (!items.length) {
        setMessage("error", "No images found on this handle.");
        return;
      }

      let found = null;

      setMessage("info", `Processing ${items.length} image(s) from Twitter...`);

      for (const item of items) {
        const imageUrl = item?.image?.image_url;

        console.log("🖼 Processing result item:", item);

        if (!imageUrl) {
          console.warn("⚠️ Missing image_url for this item, skipping.");
          continue;
        }

        // ✅ DO NOT trust parsed_payload from twitter scanner
        // Instead, do our own verification using extract endpoint (same as Verify tab)
        const verdict = await verifyImageUrlAgainstAllMediaIds(imageUrl, mediaIds);

        if (verdict.match) {
          found = { item, verdict };
          break;
        }
      }

      if (!found) {
        console.warn("❌ No misuse detected in Twitter results.");
        setMessage("error", "No misuse found.");
        return;
      }

      console.log("🎉 MATCH FOUND:", found);

      setMessage("success", "Potential misuse detected.");

      if (results) {
        const item = found.item;
        const div = document.createElement("div");
        div.className = "result-card";
        div.innerHTML = `
          <div><strong>Tweet:</strong> ${item?.tweet?.tweet_url || "-"}</div>
          <div><strong>Author:</strong> @${item?.tweet?.author_username || "-"}</div>
          <div><strong>Image:</strong> <a href="${item?.image?.image_url}" target="_blank">open</a></div>
          <div><strong>Matched Media ID:</strong> ${found.verdict.mediaId}</div>
          <div><strong>Similarity:</strong> ${(found.verdict.extract?.similarity ?? 0).toFixed(4)}</div>
        `;
        results.appendChild(div);
      }

    } catch (e) {
      console.error("🔥 Monitor flow crashed:", e);
      setMessage("error", e.message || "Monitor failed.");
    }
  });
});