(() => {
  const T = window.__TAURI__;
  const invoke = T.core.invoke;
  const dialogApi = T.dialog;
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ───────── icon SVG nội tuyến (kiểu Lucide, chạy offline) ─────────
  const ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    layout: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
  };
  const icon = (n, c = "") =>
    `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  document.querySelectorAll("[data-i]").forEach((el) => (el.outerHTML = icon(el.dataset.i, el.className)));

  // Logo nền tảng (Simple Icons, CC0) — thêm nền tảng mới: thêm 1 mục ở đây và 1 dòng trong PLATFORMS
  const LOGOS = {
    github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    gitlab: "m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z",
    bitbucket: "M.778 1.213a.768.768 0 00-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 00.77-.646l3.27-20.03a.768.768 0 00-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z",
  };
  const platIcon = (p, cls = "") =>
    LOGOS[p.id]
      ? `<svg class="ic plat ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${LOGOS[p.id]}"/></svg>`
      : icon("globe", cls);

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
  };

  const PAGES = {
    accounts: { title: "Tài khoản", sub: "Chọn tài khoản Git để dùng ngay" },
    log: { title: "Nhật ký", sub: "Lịch sử các thao tác đổi tài khoản trong phiên này" },
    settings: { title: "Cài đặt", sub: "Phiên bản, cập nhật và quyền riêng tư" },
  };

  // Nền tảng: thêm nền tảng mới chỉ cần thêm 1 dòng vào đây
  const PLATFORMS = [
    { id: "github", name: "GitHub", host: "github.com", test: (h) => h.includes("github") },
    { id: "gitlab", name: "GitLab", host: "gitlab.com", test: (h) => h.includes("gitlab") },
    { id: "bitbucket", name: "Bitbucket", host: "bitbucket.org", test: (h) => h.includes("bitbucket") },
  ];
  const platOf = (host) =>
    PLATFORMS.find((p) => p.test(host)) || { id: "host:" + host, name: host, host };

  const S = {
    page: "accounts",
    platform: store.get("platform", "all"),
    accOpen: store.get("accOpen", "1") === "1",
    autoUpd: store.get("autoUpd", "1") === "1",
    version: "",
    update: null,
    profiles: [],
    current: null,
    err: "",
    scope: store.get("scope", "global"),
    repo: store.get("repo", ""),
    convert: store.get("convert", "0") === "1",
    home: "",
    auth: "ssh",
    editId: null,
    busy: null, // "use:<id>" | "test:<id>" | "refresh"
  };

  // ───────── thông báo & nhật ký ─────────
  let toastTimer;
  function toast(msg, kind = "") {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ""), kind === "bad" ? 6000 : 3200);
  }
  const logLines = [];
  function renderLog() {
    $("#log").textContent = logLines.length ? logLines.slice(-300).join("\n") : "Chưa có thao tác nào.";
    const n = $("#logCount");
    n.hidden = !logLines.length;
    n.textContent = logLines.length;
  }
  function log(...lines) {
    const time = new Date().toLocaleTimeString("vi-VN");
    lines.flat().forEach((l) => logLines.push(`${time}  ${l}`));
    renderLog();
  }

  // ───────── tải dữ liệu ─────────
  async function loadProfiles() {
    S.profiles = await invoke("list_profiles");
  }
  async function loadCurrent() {
    S.err = "";
    S.current = null;
    if (S.scope === "repo" && !S.repo) {
      S.err = "Chọn thư mục repo để xem tài khoản đang dùng.";
      return;
    }
    try {
      S.current = await invoke("get_current", { scope: S.scope, repoPath: S.repo || null });
    } catch (e) {
      S.err = String(e);
    }
  }

  // ───────── hiển thị ─────────
  function platformList() {
    const list = PLATFORMS.map((p) => ({ id: p.id, name: p.name, host: p.host }));
    S.profiles.forEach((pr) => {
      const p = platOf(pr.host);
      if (!list.some((x) => x.id === p.id)) list.push({ id: p.id, name: p.name, host: p.host });
    });
    list.forEach((p) => (p.count = S.profiles.filter((pr) => platOf(pr.host).id === p.id).length));
    return list;
  }
  const visibleProfiles = () =>
    S.platform === "all" ? S.profiles : S.profiles.filter((p) => platOf(p.host).id === S.platform);

  function renderSub() {
    const plats = platformList();
    if (S.platform !== "all" && !plats.some((p) => p.id === S.platform)) S.platform = "all";
    const item = (id, ico, name, n) =>
      `<button type="button" class="sub-item ${S.platform === id ? "on" : ""}" data-plat="${esc(id)}">
        <span class="tag">${ico}</span><span class="nm">${esc(name)}</span><em>${n}</em></button>`;
    $("#subNav").innerHTML =
      item("all", icon("layout"), "Tất cả", S.profiles.length) +
      plats.map((p) => item(p.id, platIcon(p), p.name, p.count)).join("");
    $("#accGroup").classList.toggle("open", S.accOpen);
  }

  function accCard(p, active) {
    const busyUse = S.busy === "use:" + p.id;
    const busyTest = S.busy === "test:" + p.id;
    const dis = S.busy ? "disabled" : "";
    const isSsh = p.auth === "ssh";
    const detail = isSsh ? p.ssh_key_path : "user: " + p.login;
    return `<article class="glass-card acc ${active ? "active" : ""}" data-id="${esc(p.id)}">
      <div>
        <div class="acc-top">
          <span class="label plat-label">${platIcon(platOf(p.host))}${esc(p.host)}</span>
          ${active
            ? `<span class="badge"><span class="dot"></span>Đang dùng</span>`
            : `<span class="badge soft">${isSsh ? "SSH key" : "Token"}</span>`}
        </div>
        <div class="acc-name">${esc(p.name)}</div>
        <div class="acc-sub">${esc(p.user_name)} &lt;${esc(p.user_email)}&gt;</div>
        <div class="acc-detail" title="${esc(detail)}">${icon(isSsh ? "key" : "globe")}<span>${esc(detail)}</span></div>
      </div>
      <div class="acc-actions">
        <button class="btn-w" data-act="use" ${dis}>${busyUse ? "Đang chuyển…" : `<span>${active ? "Áp dụng lại" : "Dùng tài khoản này"}</span>${icon(active ? "refresh" : "arrow")}`}</button>
        <button class="btn-g" data-act="test" title="Test kết nối" ${dis}>${busyTest ? "…" : icon("activity")}</button>
        <button class="btn-g" data-act="edit" title="Sửa">${icon("pencil")}</button>
        <button class="btn-g danger" data-act="del" title="Xoá">${icon("trash")}</button>
      </div>
    </article>`;
  }

  function idleCard(platName) {
    const c = S.current;
    let msg;
    if (S.err) msg = S.err;
    else if (platName) msg = `Chưa có tài khoản ${platName} nào đang hoạt động. Chọn một tài khoản bên dưới để dùng.`;
    else if (c && (c.name || c.email))
      msg = `Git đang dùng ${c.name || "(chưa đặt tên)"} <${c.email || "chưa đặt email"}> — không khớp tài khoản nào đã lưu.`;
    else msg = "Chưa cấu hình user.name / user.email. Chọn một tài khoản bên dưới để bắt đầu.";
    return `<div class="idle card-span">${esc(msg)}</div>`;
  }

  function renderCards() {
    const activeSet = new Set(S.current?.active_ids || []);
    const visible = visibleProfiles(); // "Tất cả" = mọi tài khoản; menu nền tảng = chỉ tài khoản của nền tảng đó
    const actives = visible.filter((p) => activeSet.has(p.id));
    const others = visible.filter((p) => !activeSet.has(p.id));
    const plat = S.platform === "all" ? null : platformList().find((p) => p.id === S.platform);
    const sec = (title, n, dot) =>
      `<div class="sec card-span">${dot ? '<span class="dot"></span>' : ""}<span>${title}</span>${n === undefined ? "" : `<em>${n}</em>`}</div>`;
    const html = [];
    html.push(sec("Đang hoạt động", actives.length, actives.length > 0));
    if (actives.length) actives.forEach((p) => html.push(accCard(p, true)));
    else html.push(idleCard(plat?.name));
    html.push('<hr class="divider card-span" />');
    html.push(sec("Tài khoản khác", others.length));
    others.forEach((p) => html.push(accCard(p, false)));
    html.push(`<button type="button" class="add-card" data-act="add"><span class="plus">${icon("plus")}</span>Thêm tài khoản</button>`);
    $("#cards").innerHTML = html.join("");
  }

  function renderChrome() {
    renderSub();
    document.querySelectorAll("#scopeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.scope === S.scope));
    const isRepo = S.scope === "repo";
    $("#repoBar").hidden = !isRepo;
    $("#repoPath").textContent = S.repo || "Chưa chọn thư mục";
    $("#clearRepo").hidden = !S.repo;
    $("#convert").checked = S.convert;
    $("#scopeSeg").title = isRepo
      ? "Chỉ repo này dùng tài khoản đã chọn, các repo khác không bị ảnh hưởng."
      : "Ghi vào ~/.gitconfig: mọi repo chưa có cấu hình riêng sẽ dùng tài khoản này.";

    document.querySelectorAll("#nav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === S.page));
    $("#page-accounts").hidden = S.page !== "accounts";
    $("#page-log").hidden = S.page !== "log";
    $("#page-settings").hidden = S.page !== "settings";
    const curPlat = platformList().find((p) => p.id === S.platform);
    $("#pageTitle").textContent =
      S.page === "accounts" && curPlat ? `${PAGES.accounts.title} · ${curPlat.name}` : PAGES[S.page].title;
    const gv = S.current?.git_version ? " · " + S.current.git_version : "";
    $("#pageSub").textContent = PAGES[S.page].sub + (S.page === "accounts" ? gv : "");
    $("#scopeSeg").hidden = S.page !== "accounts";
    $("#addBtn").hidden = S.page !== "accounts";

    $("#refreshBtn").querySelector(".ic").classList.toggle("spin", S.busy === "refresh");

    const u = S.update;
    const showUpd = !!(u && u.has_update && store.get("dismiss", "") !== u.latest);
    $("#updateBar").hidden = !showUpd;
    if (showUpd) {
      $("#updTitle").textContent = `Có bản mới ${u.latest}`;
      $("#updSub").textContent = `Bạn đang dùng v${String(u.current).replace(/^v/, "")}`;
    }
    $("#verText").textContent = `Manager Account${S.version ? " v" + String(S.version).replace(/^v/, "") : ""}`;
    $("#autoUpd").checked = S.autoUpd;
  }

  function render() {
    renderChrome();
    renderCards();
    renderLog();
  }
  async function refresh() {
    await loadProfiles();
    await loadCurrent();
    render();
  }

  // ───────── hành động ─────────
  async function useProfile(id) {
    const p = S.profiles.find((x) => x.id === id);
    if (S.scope === "repo" && !S.repo) return toast("Hãy chọn thư mục repo trước.", "bad");
    S.busy = "use:" + id;
    renderCards();
    try {
      const lines = await invoke("apply_profile", {
        id,
        scope: S.scope,
        repoPath: S.repo || null,
        convertRemote: S.scope === "repo" && S.convert,
      });
      log(`▶ Chuyển sang “${p.name}”`, lines);
      toast(`Đã chuyển sang “${p.name}”`, "ok");
    } catch (e) {
      log(`✗ Lỗi khi chuyển sang “${p.name}”: ${e}`);
      toast(String(e), "bad");
    } finally {
      S.busy = null;
      await loadCurrent();
      render();
    }
  }

  async function testProfile(id) {
    const p = S.profiles.find((x) => x.id === id);
    S.busy = "test:" + id;
    renderCards();
    try {
      const r = await invoke("test_profile", { id });
      log(`${r.ok ? "✓" : "✗"} Test “${p.name}”: ${r.message}`);
      toast(r.message, r.ok ? "ok" : "bad");
    } catch (e) {
      log(`✗ Test “${p.name}” lỗi: ${e}`);
      toast(String(e), "bad");
    } finally {
      S.busy = null;
      renderCards();
      renderLog();
    }
  }

  async function deleteProfile(id) {
    const p = S.profiles.find((x) => x.id === id);
    let yes = false;
    try {
      yes = await dialogApi.ask(`Xoá tài khoản “${p.name}”? Token/key đã lưu cho tài khoản này cũng bị xoá.`, {
        title: "Xác nhận xoá",
        kind: "warning",
      });
    } catch {
      yes = window.confirm(`Xoá tài khoản “${p.name}”?`);
    }
    if (!yes) return;
    try {
      await invoke("delete_profile", { id });
      log(`Đã xoá tài khoản “${p.name}”`);
      toast("Đã xoá", "ok");
    } catch (e) {
      toast(String(e), "bad");
    }
    await refresh();
  }

  // ───────── form thêm / sửa ─────────
  const dlg = $("#dlg");
  function setAuth(a) {
    S.auth = a;
    document.querySelectorAll("#authSeg button").forEach((b) => b.classList.toggle("on", b.dataset.auth === a));
    $("#authSsh").hidden = a !== "ssh";
    $("#authToken").hidden = a !== "token";
  }
  function openForm(p) {
    S.editId = p ? p.id : null;
    $("#dlgTitle").textContent = p ? "Sửa tài khoản" : "Thêm tài khoản";
    $("#f_name").value = p?.name ?? "";
    const pl = platformList().find((x) => x.id === S.platform);
    $("#f_host").value = p?.host ?? pl?.host ?? "github.com";
    $("#f_uname").value = p?.user_name ?? "";
    $("#f_email").value = p?.user_email ?? "";
    $("#f_keypath").value = p?.ssh_key_path ?? "";
    $("#f_keytext").value = "";
    $("#f_login").value = p?.login ?? "";
    $("#f_token").value = "";
    $("#f_token").placeholder = p?.has_token ? "Đã lưu — để trống nếu giữ nguyên" : "ghp_… / glpat-…";
    $("#formErr").hidden = true;
    setAuth(p?.auth ?? "ssh");
    dlg.showModal();
    $("#f_name").focus();
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const btn = $("#saveBtn");
    btn.disabled = true;
    $("#formErr").hidden = true;
    try {
      const input = {
        id: S.editId,
        name: $("#f_name").value,
        host: $("#f_host").value,
        user_name: $("#f_uname").value,
        user_email: $("#f_email").value,
        auth: S.auth,
        login: $("#f_login").value,
        ssh_key_path: $("#f_keypath").value,
        ssh_private_key: $("#f_keytext").value,
        token: $("#f_token").value,
      };
      const saved = await invoke("save_profile", { input });
      log(`Đã lưu tài khoản “${saved.name}” (${saved.auth})`);
      dlg.close();
      toast("Đã lưu tài khoản", "ok");
      await refresh();
    } catch (e) {
      const el = $("#formErr");
      el.textContent = String(e);
      el.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  async function pickKey() {
    try {
      const sep = S.home.includes("\\") ? "\\" : "/";
      const picked = await dialogApi.open({
        multiple: false,
        directory: false,
        title: "Chọn file SSH private key",
        defaultPath: S.home ? S.home + sep + ".ssh" : undefined,
      });
      if (picked) $("#f_keypath").value = Array.isArray(picked) ? picked[0] : picked;
    } catch (e) {
      toast(String(e), "bad");
    }
  }

  async function pickRepo() {
    try {
      const picked = await dialogApi.open({ directory: true, multiple: false, title: "Chọn thư mục repo" });
      if (picked) {
        S.repo = Array.isArray(picked) ? picked[0] : picked;
        store.set("repo", S.repo);
        await loadCurrent();
        render();
      }
    } catch (e) {
      toast(String(e), "bad");
    }
  }

  // ───────── cập nhật app (chỉ GET tới GitHub Releases, không gửi dữ liệu người dùng) ─────────
  function setStatus(msg, kind = "") {
    const el = $("#chkStatus");
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = "set-status " + kind;
  }
  async function checkUpdate(manual) {
    const btn = $("#chkBtn");
    if (manual) {
      btn.disabled = true;
      setStatus("Đang kiểm tra…");
    }
    try {
      const r = await invoke("check_update");
      S.version = r.current;
      S.update = r;
      let msg, kind = "ok";
      if (r.none_published) msg = "Chưa có bản phát hành nào trên GitHub.";
      else if (r.has_update) msg = `Có bản mới ${r.latest} (bạn đang dùng v${r.current}).`;
      else msg = `Bạn đang dùng bản mới nhất (v${r.current}).`;
      if (manual) {
        store.set("dismiss", "");
        setStatus(msg, kind);
        toast(msg, "ok");
      }
      log(`Kiểm tra cập nhật: ${msg}`);
    } catch (e) {
      if (manual) {
        setStatus(String(e), "bad");
        toast(String(e), "bad");
      }
      log(`✗ Kiểm tra cập nhật lỗi: ${e}`);
    } finally {
      btn.disabled = false;
      render();
    }
  }

  async function doRefresh() {
    S.busy = "refresh";
    renderChrome();
    try { await refresh(); } catch (e) { S.err = String(e); }
    S.busy = null;
    render();
  }

  // ───────── sự kiện ─────────
  document.querySelectorAll("#scopeSeg button").forEach((b) =>
    b.addEventListener("click", async () => {
      S.scope = b.dataset.scope;
      store.set("scope", S.scope);
      await loadCurrent();
      render();
    })
  );
  document.querySelectorAll("#nav .nav-item").forEach((b) =>
    b.addEventListener("click", () => {
      const isAcc = b.dataset.page === "accounts";
      if (isAcc && S.page === "accounts") S.accOpen = !S.accOpen; // bấm lần nữa để thu gọn
      else if (isAcc) S.accOpen = true;
      S.page = b.dataset.page;
      store.set("accOpen", S.accOpen ? "1" : "0");
      render();
    })
  );
  $("#subNav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-plat]");
    if (!b) return;
    S.platform = b.dataset.plat;
    S.page = "accounts";
    store.set("platform", S.platform);
    render();
  });
  document.querySelectorAll("#authSeg button").forEach((b) => b.addEventListener("click", () => setAuth(b.dataset.auth)));
  $("#convert").addEventListener("change", (e) => {
    S.convert = e.target.checked;
    store.set("convert", S.convert ? "1" : "0");
  });
  $("#pickRepo").addEventListener("click", pickRepo);
  $("#chkBtn").addEventListener("click", () => checkUpdate(true));
  $("#autoUpd").addEventListener("change", (e) => {
    S.autoUpd = e.target.checked;
    store.set("autoUpd", S.autoUpd ? "1" : "0");
  });
  $("#updOpen").addEventListener("click", async () => {
    try { await invoke("open_release_page", { url: S.update.url }); } catch (e) { toast(String(e), "bad"); }
  });
  $("#updLater").addEventListener("click", () => {
    store.set("dismiss", S.update?.latest || "");
    renderChrome();
  });
  $("#clearRepo").addEventListener("click", async () => {
    S.repo = "";
    store.set("repo", "");
    await loadCurrent();
    render();
  });
  $("#pickKey").addEventListener("click", pickKey);
  $("#addBtn").addEventListener("click", () => openForm(null));
  $("#refreshBtn").addEventListener("click", doRefresh);
  $("#clearLog").addEventListener("click", () => { logLines.length = 0; renderLog(); });
  $("#cancel").addEventListener("click", () => dlg.close());
  $("#form").addEventListener("submit", submitForm);
  $("#cards").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "add") return openForm(null);
    const id = btn.closest(".acc").dataset.id;
    if (act === "use") useProfile(id);
    else if (act === "test") testProfile(id);
    else if (act === "edit") openForm(S.profiles.find((x) => x.id === id));
    else if (act === "del") deleteProfile(id);
  });
  window.addEventListener("focus", () => { if (!S.busy && !dlg.open) loadCurrent().then(render); });

  // ───────── khởi động ─────────
  (async () => {
    try { S.home = await invoke("user_home"); } catch { /* bỏ qua */ }
    try { S.version = await T.app.getVersion(); } catch { /* bỏ qua */ }
    render();
    try {
      await refresh();
    } catch (e) {
      S.err = String(e);
      render();
    }
    if (S.autoUpd) checkUpdate(false);
  })();
})();
