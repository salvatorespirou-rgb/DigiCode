/* DigiCode — attach files to a request form.
 *
 * Uploads straight to Supabase Storage from the browser. The bucket is
 * write-only for visitors (see supabase/024): they can add a file but cannot
 * list, read, overwrite or delete anything, so nobody can reach anyone else's
 * files and it can't be used as a free file host.
 */
(function () {
  "use strict";

  var mount = document.getElementById("fileUpload");
  if (!mount || typeof digicodeSupabase === "undefined") return;

  var BUCKET = "project-uploads";
  var MAX_BYTES = 10 * 1024 * 1024;
  var MAX_FILES = 12;
  var OK = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain)$/;

  // One id for everything attached to this enquiry, so the dev side can group
  // the files against the message that arrives.
  var batch = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

  var service = document.querySelector(".request-form")?.dataset.service || "Website";
  var done = [];

  mount.innerHTML =
    '<div class="upload-drop" id="uploadDrop" tabindex="0" role="button" ' +
    'aria-label="Choose files to attach">' +
      '<span class="upload-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" width="26" height="26">' +
        '<path d="M12 16V4m0 0L7 9m5-5l5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" ' +
        'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</span>' +
      '<span class="upload-copy"><strong>Attach files</strong>' +
      '<span>Logo, photos, brand guidelines, a document with your content — drag them here or click to browse</span></span>' +
    '</div>' +
    '<input type="file" id="uploadInput" multiple hidden ' +
    'accept="image/*,.pdf,.zip,.doc,.docx,.txt" />' +
    '<ul class="upload-list" id="uploadList"></ul>' +
    '<p class="form-note upload-note">Up to ' + MAX_FILES + ' files, 10MB each. ' +
    'Images, PDFs, Word documents or a zip. Optional — send them later if it\'s easier.</p>';

  var drop = document.getElementById("uploadDrop");
  var input = document.getElementById("uploadInput");
  var list = document.getElementById("uploadList");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function sizeLabel(n) {
    return n > 1048576
      ? (n / 1048576).toFixed(1) + " MB"
      : Math.max(1, Math.round(n / 1024)) + " KB";
  }

  function row(name, state, detail) {
    var li = document.createElement("li");
    li.className = "upload-item upload-" + state;
    li.innerHTML =
      '<span class="upload-name">' + esc(name) + "</span>" +
      '<span class="upload-state">' + esc(detail) + "</span>";
    return li;
  }

  async function send(file) {
    if (done.length >= MAX_FILES) return;

    if (file.size > MAX_BYTES) {
      list.appendChild(row(file.name, "bad", "too big — 10MB max"));
      return;
    }
    if (file.type && !OK.test(file.type)) {
      list.appendChild(row(file.name, "bad", "not a supported file type"));
      return;
    }

    var li = row(file.name, "busy", "uploading…");
    list.appendChild(li);

    // Keep the original name for the dev side, but never trust it as a path.
    var safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
    var path = batch + "/" + Date.now() + "-" + safe;

    try {
      var up = await digicodeSupabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });

      if (up.error) throw up.error;

      await digicodeSupabase.rpc("record_upload", {
        p_batch: batch,
        p_service: service,
        p_path: path,
        p_name: file.name,
        p_size: file.size,
        p_mime: file.type || "",
      });

      done.push(file.name);
      li.className = "upload-item upload-ok";
      li.querySelector(".upload-state").textContent = sizeLabel(file.size) + " · attached";
    } catch (err) {
      li.className = "upload-item upload-bad";
      li.querySelector(".upload-state").textContent = "couldn't upload — try again";
    }
  }

  function take(files) {
    [].slice.call(files).forEach(send);
  }

  drop.addEventListener("click", function () { input.click(); });
  drop.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", function () { take(input.files); input.value = ""; });

  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) {
      e.preventDefault();
      drop.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) {
      e.preventDefault();
      drop.classList.remove("is-over");
    });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) take(e.dataTransfer.files);
  });

  // So the emailed enquiry says what was attached and under which batch.
  window.digicodeUploads = function () {
    return done.length
      ? ["Files attached (" + done.length + "): " + done.join(", "), "Upload reference: " + batch]
      : [];
  };
})();
