(() => {
  const T = window.__TAURI__;
  // macOS dùng thanh tiêu đề overlay; Windows/Linux tự vẽ thanh tiêu đề và nút điều khiển cửa sổ
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  document.documentElement.classList.add(isMac ? "mac" : "csd");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wc]");
    if (!b || !T.window) return;
    const w = T.window.getCurrentWindow();
    if (b.dataset.wc === "min") w.minimize();
    else if (b.dataset.wc === "max") w.toggleMaximize();
    else w.close();
  });
  // dải mờ ở mép trên/dưới chỉ bật khi còn nội dung bị cuộn khuất
  const updFade = () => {
    const el = document.documentElement;
    const y = window.scrollY, max = el.scrollHeight - window.innerHeight;
    el.classList.toggle("fade-t", y > 2);
    el.classList.toggle("fade-b", max - y > 2);
  };
  window.addEventListener("scroll", updFade, { passive: true });
  window.addEventListener("resize", updFade);
  new ResizeObserver(updFade).observe(document.body);
  setTimeout(updFade, 0);
  const invoke = T.core.invoke;
  const dialogApi = T.dialog;
  const { t, tr } = window.I18N;
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
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
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
    p.id === "ssh"
      ? icon("terminal", cls)
      : LOGOS[p.id]
      ? `<svg class="ic plat ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${LOGOS[p.id]}"/></svg>`
      : icon("globe", cls);

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
  };

  const PAGES = {
    accounts: { title: "Tài khoản", sub: "Chọn tài khoản để dùng ngay" },
    hosts: { title: "SSH host", sub: "Chọn tài khoản SSH để kết nối vào máy chủ ngay" },
    backup: { title: "Kho lưu trữ", sub: "Sao lưu và khôi phục toàn bộ tài khoản khi đổi máy" },
    stats: { title: "Hiệu năng", sub: "RAM, CPU và tài nguyên mà app đang dùng" },
    settings: { title: "Cài đặt", sub: "Phiên bản, cập nhật và quyền riêng tư" },
    about: { title: "Giới thiệu", sub: "App này làm gì, chính sách dữ liệu và giấy phép" },
  }; // khoá tiếng Việt, dịch qua t() khi hiển thị

  // Nền tảng: thêm nền tảng mới chỉ cần thêm 1 dòng vào đây
  LOGOS.k8s = "M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 0 1-2.075-2.597l2.578-.437.004.005a.44.44 0 0 1 .484.606zm-.833-2.129a.44.44 0 0 0 .173-.756l.002-.011L7.585 9.7a5.143 5.143 0 0 0-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 0 0 .699-.337l.01-.005.15-2.62a5.144 5.144 0 0 0-3.01 1.442l2.147 1.523.004-.002zm.76 2.75l.723.349.722-.347.18-.78-.5-.623h-.804l-.5.623.179.779zm1.5-3.095a.44.44 0 0 0 .7.336l.008.003 2.134-1.513a5.188 5.188 0 0 0-2.992-1.442l.148 2.615.002.001zm10.876 5.97l-5.773 7.181a1.6 1.6 0 0 1-1.248.594l-9.261.003a1.6 1.6 0 0 1-1.247-.596l-5.776-7.18a1.583 1.583 0 0 1-.307-1.34L2.1 5.573c.108-.47.425-.864.863-1.073L11.305.513a1.606 1.606 0 0 1 1.385 0l8.345 3.985c.438.209.755.604.863 1.073l2.062 8.955c.108.47-.005.963-.308 1.34zm-3.289-2.057c-.042-.01-.103-.026-.145-.034-.174-.033-.315-.025-.479-.038-.35-.037-.638-.067-.895-.148-.105-.04-.18-.165-.216-.216l-.201-.059a6.45 6.45 0 0 0-.105-2.332 6.465 6.465 0 0 0-.936-2.163c.052-.047.15-.133.177-.159.008-.09.001-.183.094-.282.197-.185.444-.338.743-.522.142-.084.273-.137.415-.242.032-.024.076-.062.11-.089.24-.191.295-.52.123-.736-.172-.216-.506-.236-.745-.045-.034.027-.08.062-.111.088-.134.116-.217.23-.33.35-.246.25-.45.458-.673.609-.097.056-.239.037-.303.033l-.19.135a6.545 6.545 0 0 0-4.146-2.003l-.012-.223c-.065-.062-.143-.115-.163-.25-.022-.268.015-.557.057-.905.023-.163.061-.298.068-.475.001-.04-.001-.099-.001-.142 0-.306-.224-.555-.5-.555-.275 0-.499.249-.499.555l.001.014c0 .041-.002.092 0 .128.006.177.044.312.067.475.042.348.078.637.056.906a.545.545 0 0 1-.162.258l-.012.211a6.424 6.424 0 0 0-4.166 2.003 8.373 8.373 0 0 1-.18-.128c-.09.012-.18.04-.297-.029-.223-.15-.427-.358-.673-.608-.113-.12-.195-.234-.329-.349-.03-.026-.077-.062-.111-.088a.594.594 0 0 0-.348-.132.481.481 0 0 0-.398.176c-.172.216-.117.546.123.737l.007.005.104.083c.142.105.272.159.414.242.299.185.546.338.743.522.076.082.09.226.1.288l.16.143a6.462 6.462 0 0 0-1.02 4.506l-.208.06c-.055.072-.133.184-.215.217-.257.081-.546.11-.895.147-.164.014-.305.006-.48.039-.037.007-.09.02-.133.03l-.004.002-.007.002c-.295.071-.484.342-.423.608.061.267.349.429.645.365l.007-.001.01-.003.129-.029c.17-.046.294-.113.448-.172.33-.118.604-.217.87-.256.112-.009.23.069.288.101l.217-.037a6.5 6.5 0 0 0 2.88 3.596l-.09.218c.033.084.069.199.044.282-.097.252-.263.517-.452.813-.091.136-.185.242-.268.399-.02.037-.045.095-.064.134-.128.275-.034.591.213.71.248.12.556-.007.69-.282v-.002c.02-.039.046-.09.062-.127.07-.162.094-.301.144-.458.132-.332.205-.68.387-.897.05-.06.13-.082.215-.105l.113-.205a6.453 6.453 0 0 0 4.609.012l.106.192c.086.028.18.042.256.155.136.232.229.507.342.84.05.156.074.295.145.457.016.037.043.09.062.129.133.276.442.402.69.282.247-.118.341-.435.213-.71-.02-.039-.045-.096-.065-.134-.083-.156-.177-.261-.268-.398-.19-.296-.346-.541-.443-.793-.04-.13.007-.21.038-.294-.018-.022-.059-.144-.083-.202a6.499 6.499 0 0 0 2.88-3.622c.064.01.176.03.213.038.075-.05.144-.114.28-.104.266.039.54.138.87.256.154.06.277.128.448.173.036.01.088.019.13.028l.009.003.007.001c.297.064.584-.098.645-.365.06-.266-.128-.537-.423-.608zM16.4 9.701l-1.95 1.746v.005a.44.44 0 0 0 .173.757l.003.01 2.526.728a5.199 5.199 0 0 0-.108-1.674A5.208 5.208 0 0 0 16.4 9.7zm-4.013 5.325a.437.437 0 0 0-.404-.232.44.44 0 0 0-.372.233h-.002l-1.268 2.292a5.164 5.164 0 0 0 3.326.003l-1.27-2.296h-.01zm1.888-1.293a.44.44 0 0 0-.27.036.44.44 0 0 0-.214.572l-.003.004 1.01 2.438a5.15 5.15 0 0 0 2.081-2.615l-2.6-.44-.004.005z";
  LOGOS.npm = "M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z";
  const NPM_PLAT = { id: "npm", name: "npm", host: "registry.npmjs.org" };
  const SSH_PLAT = { id: "ssh", name: "SSH", host: "ssh" };
  const K8S_PLAT = { id: "k8s", name: "Kubernetes", host: "kubernetes" };
  const ENV_LABEL = { prod: "PRODUCTION", staging: "STAGING", dev: "DEV" };
  const PLATFORMS = [
    { id: "github", name: "GitHub", host: "github.com", test: (h) => h.includes("github") },
    { id: "gitlab", name: "GitLab", host: "gitlab.com", test: (h) => h.includes("gitlab") },
    { id: "bitbucket", name: "Bitbucket", host: "bitbucket.org", test: (h) => h.includes("bitbucket") },
  ];
  const platOf = (host) =>
    PLATFORMS.find((p) => p.test(host)) || { id: "host:" + host, name: host, host };
  // nền tảng của một tài khoản (npm nhóm riêng, không theo host)
  const platOfP = (pr) => (pr.kind === "npm" ? NPM_PLAT : pr.kind === "ssh" ? SSH_PLAT : pr.kind === "k8s" ? K8S_PLAT : platOf(pr.host));

  const S = {
    page: "accounts",
    platform: store.get("platform", "all"),
    accOpen: store.get("accOpen", "1") === "1",
    autoUpd: store.get("autoUpd", "1") === "1",
    version: "",
    update: null,
    profiles: [],
    hosts: [],
    hostEdit: null,
    current: null,
    err: "",
    scope: store.get("scope", "global"),
    repo: store.get("repo", ""),
    convert: store.get("convert", "0") === "1",
    home: "",
    auth: "ssh",
    kind: "git",
    editId: null,
    busy: null, // "use:<id>" | "test:<id>" | "refresh"
  };

  // ───────── thông báo ─────────
  let toastTimer;
  function toast(msg, kind = "") {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ""), kind === "bad" ? 6000 : 3200);
  }

  // ───────── tải dữ liệu ─────────
  async function loadProfiles() {
    S.profiles = await invoke("list_profiles");
    S.hosts = await invoke("list_hosts");
    try {
      S.rules = await invoke("rules_list");
    } catch {
      S.rules = [];
    }
  }
  async function loadCurrent() {
    S.err = "";
    S.current = null;
    const sc = S.platform === "k8s" ? "global" : S.scope; // Kubernetes không theo repo
    if (sc === "repo" && !S.repo) {
      S.err = t("Chọn thư mục repo để xem tài khoản đang dùng.");
      return;
    }
    try {
      S.current = await invoke("get_current", { scope: sc, repoPath: S.repo || null });
    } catch (e) {
      S.err = tr(e);
    }
  }

  // ───────── hiển thị ─────────
  function platformList() {
    const list = PLATFORMS.map((p) => ({ id: p.id, name: p.name, host: p.host }));
    list.push({ ...NPM_PLAT }, { ...K8S_PLAT }, { ...SSH_PLAT });
    S.profiles.forEach((pr) => {
      const p = platOfP(pr);
      if (!list.some((x) => x.id === p.id)) list.push({ id: p.id, name: p.name, host: p.host });
    });
    list.forEach((p) => (p.count = S.profiles.filter((pr) => platOfP(pr).id === p.id).length));
    return list;
  }
  const visibleProfiles = () =>
    S.platform === "all" ? S.profiles : S.profiles.filter((p) => platOfP(p).id === S.platform);

  function renderSub() {
    const plats = platformList();
    if (S.platform !== "all" && !plats.some((p) => p.id === S.platform)) S.platform = "all";
    const item = (id, ico, name, n) =>
      `<button type="button" class="sub-item ${S.platform === id ? "on" : ""}" data-plat="${esc(id)}">
        <span class="tag">${ico}</span><span class="nm">${esc(name)}</span><em>${n}</em></button>`;
    $("#subNav").innerHTML =
      item("all", icon("layout"), t("Tất cả"), S.profiles.length) +
      plats.map((p) => item(p.id, platIcon(p), p.name, p.count)).join("");
    $("#accGroup").classList.toggle("open", S.accOpen);
  }

  function accCard(p, active) {
    const busyUse = S.busy === "use:" + p.id;
    const busyTest = S.busy === "test:" + p.id;
    const dis = S.busy ? "disabled" : "";
    const isNpm = p.kind === "npm";
    const isSshAcc = p.kind === "ssh"; // tài khoản dùng để SSH vào server
    const isK8s = p.kind === "k8s";
    const isSsh = p.auth === "ssh";
    const sshDetail = [p.ssh_key_path, p.has_token ? t("mật khẩu đã lưu") : ""].filter(Boolean).join(" · ") || t("Không có key / mật khẩu (nhập khi kết nối)");
    const detail = isK8s ? p.host : isNpm ? p.registry : isSshAcc ? sshDetail : isSsh ? p.ssh_key_path : "user: " + p.login;
    const subLine = isK8s
      ? esc(p.context ? "context: " + p.context : t("Context mặc định"))
      : isNpm
      ? esc(p.scope || t("Registry mặc định"))
      : isSshAcc
        ? esc(p.login)
        : `${esc(p.user_name)} &lt;${esc(p.user_email)}&gt;`;
    return `<article class="glass-card acc ${active ? "active" : ""}" data-id="${esc(p.id)}">
      <div>
        <div class="acc-top">
          <span class="label plat-label">${platIcon(platOfP(p))}${esc(p.host)}</span>
          ${active
            ? `<span class="badge"><span class="dot"></span>${t("Đang dùng")}</span>`
            : `<span class="badge soft">${isK8s ? "kubeconfig" : isNpm ? "npm" : isSshAcc ? (p.ssh_key_path && p.has_token ? t("Key + mật khẩu") : p.has_token ? t("Mật khẩu") : "SSH key") : isSsh ? "SSH key" : "Token"}</span>`}
        </div>
        <div class="acc-name">${esc(p.name)}${isK8s && p.env ? ` <span class="env env-${esc(p.env)}">${ENV_LABEL[p.env] || ""}</span>` : ""}</div>
        <div class="acc-sub">${subLine}</div>
        <div class="acc-detail" title="${esc(detail)}">${isK8s ? platIcon(K8S_PLAT) : icon(isSsh || isSshAcc ? "key" : "globe")}<span>${esc(detail)}</span></div>
      </div>
      <div class="acc-actions">
        ${isSshAcc ? `<div class="grow-note">${t("Dùng ở menu SSH host")}</div>` : `<button class="btn-w" data-act="use" ${dis}>${busyUse ? t("Đang chuyển…") : `<span>${active ? t("Áp dụng lại") : t("Dùng tài khoản này")}</span>${icon(active ? "refresh" : "arrow")}`}</button>
        <button class="btn-g" data-act="test" title="${t("Test kết nối")}" ${dis}>${busyTest ? "…" : icon("activity")}</button>`}
        <button class="btn-g" data-act="edit" title="${t("Sửa")}">${icon("pencil")}</button>
        <button class="btn-g danger" data-act="del" title="${t("Xoá")}">${icon("trash")}</button>
      </div>
    </article>`;
  }

  function idleCard(platName) {
    const c = S.current;
    let msg;
    if (S.err) msg = S.err;
    else if (platName) msg = t("Chưa có tài khoản {p} nào đang hoạt động. Chọn một tài khoản bên dưới để dùng.", { p: platName });
    else if (c && (c.name || c.email))
      msg = t("Git đang dùng {n} <{e}> — không khớp tài khoản nào đã lưu.", { n: c.name || t("(chưa đặt tên)"), e: c.email || t("chưa đặt email") });
    else msg = t("Chưa cấu hình user.name / user.email. Chọn một tài khoản bên dưới để bắt đầu.");
    return `<div class="idle card-span">${esc(msg)}</div>`;
  }

  function renderCards() {
    if (S.platform === "ssh") {
      const list = visibleProfiles();
      const h = [`<div class="sec card-span"><span>${t("Tài khoản SSH")}</span><em>${list.length}</em></div>`];
      list.forEach((p) => h.push(accCard(p, false)));
      h.push(`<button type="button" class="add-card" data-act="add"><span class="plus">${icon("plus")}</span>${t("Thêm tài khoản")}</button>`);
      $("#cards").innerHTML = h.join("");
      return;
    }
    const activeSet = new Set(S.current?.active_ids || []);
    const visible = visibleProfiles(); // "Tất cả" = mọi tài khoản; menu nền tảng = chỉ tài khoản của nền tảng đó
    const actives = visible.filter((p) => activeSet.has(p.id));
    const others = visible.filter((p) => !activeSet.has(p.id));
    const plat = S.platform === "all" ? null : platformList().find((p) => p.id === S.platform);
    const sec = (title, n, dot) =>
      `<div class="sec card-span">${dot ? '<span class="dot"></span>' : ""}<span>${title}</span>${n === undefined ? "" : `<em>${n}</em>`}</div>`;
    const html = [];
    html.push(sec(t("Đang hoạt động"), actives.length, actives.length > 0));
    if (actives.length) actives.forEach((p) => html.push(accCard(p, true)));
    else html.push(idleCard(plat?.name));
    html.push('<hr class="divider card-span" />');
    html.push(sec(t("Tài khoản khác"), others.length));
    others.forEach((p) => html.push(accCard(p, false)));
    if (S.platform !== "all")
      html.push(`<button type="button" class="add-card" data-act="add"><span class="plus">${icon("plus")}</span>${t("Thêm tài khoản")}</button>`);
    $("#cards").innerHTML = html.join("");
  }

  // ───────── SSH host ─────────
  // ───────── ô chọn (select) tuỳ biến, đồng bộ với giao diện app ─────────
  const selOpts = {};
  let selMenu = null;
  function closeSel() {
    if (selMenu) {
      selMenu.btn.classList.remove("open");
      selMenu.el.remove();
      selMenu = null;
    }
  }
  function openSel(btn) {
    if (selMenu && selMenu.btn === btn) return closeSel();
    closeSel();
    const hid = btn.dataset.sel;
    const options = selOpts[hid] || [];
    const el = document.createElement("div");
    el.className = "sel-menu";
    el.setAttribute("role", "listbox");
    el.innerHTML = options
      .map(
        (o) => `<div class="sel-item ${o.v === btn.dataset.value ? "on" : ""}" role="option" data-v="${esc(o.v)}">
          <span class="sel-l">${esc(o.label)}${o.sub ? ` <em>${esc(o.sub)}</em>` : ""}</span>${o.v === btn.dataset.value ? icon("check", "sel-ck") : ""}</div>`
      )
      .join("");
    document.body.appendChild(el);
    const r = btn.getBoundingClientRect();
    el.style.minWidth = r.width + "px";
    el.style.left = Math.min(r.left, window.innerWidth - el.offsetWidth - 12) + "px";
    const below = window.innerHeight - r.bottom;
    if (below < el.offsetHeight + 12 && r.top > below) el.style.bottom = window.innerHeight - r.top + 6 + "px";
    else el.style.top = r.bottom + 6 + "px";
    btn.classList.add("open");
    selMenu = { btn, el };
    el.addEventListener("click", (e) => {
      const it = e.target.closest(".sel-item");
      if (!it) return;
      const o = options.find((x) => x.v === it.dataset.v) || options[0];
      btn.dataset.value = o.v;
      btn.querySelector(".sel-v").innerHTML = `${esc(o.label)}${o.sub ? ` <em>${esc(o.sub)}</em>` : ""}`;
      store.set("hostAcc:" + hid, o.v);
      closeSel();
      btn.focus();
    });
  }
  document.addEventListener("mousedown", (e) => {
    if (selMenu && !selMenu.el.contains(e.target) && !selMenu.btn.contains(e.target)) closeSel();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSel(); });
  window.addEventListener("resize", closeSel);
  document.addEventListener("scroll", (e) => { if (selMenu && !selMenu.el.contains(e.target)) closeSel(); }, true);

  const liveCount = (hid) => (S.terms || []).filter((x) => x.hostId === hid && !x.ended).length;

  function renderHosts() {
    closeSel();
    const accs = S.profiles.filter((p) => p.kind === "ssh");
    const out = S.hosts.map((h) => {
      const saved = store.get("hostAcc:" + h.id, "");
      const options = [{ v: "", label: t("Không dùng tài khoản"), sub: "" }, ...accs.map((a) => ({ v: a.id, label: a.name, sub: a.login }))];
      selOpts[h.id] = options;
      const cur = options.find((o) => o.v === saved) || options[0];
      return `<article class="glass-card acc host" data-hid="${esc(h.id)}">
        <div>
          <div class="acc-top"><span class="label plat-label">${icon("server")}${esc(h.address)}${h.port !== 22 ? ":" + h.port : ""}</span>
            ${liveCount(h.id) ? `<span class="badge"><span class="dot"></span>${t("{n} phiên đang mở", { n: liveCount(h.id) })}</span>` : ""}</div>
          <div class="acc-name">${esc(h.name)}</div>
          ${h.note ? `<div class="acc-sub">${esc(h.note)}</div>` : ""}
          <div class="host-sec">${t("Kết nối bằng")}</div>
          <button type="button" class="sel" data-sel="${esc(h.id)}" data-value="${esc(cur.v)}" aria-haspopup="listbox">
            <span class="sel-v">${esc(cur.label)}${cur.sub ? ` <em>${esc(cur.sub)}</em>` : ""}</span>${icon("chevron", "sel-ic")}
          </button>
          ${accs.length ? "" : `<div class="acc-sub">${t("Chưa có tài khoản SSH. Vào Tài khoản → SSH để thêm.")}</div>`}
        </div>
        <div class="acc-actions">
          <button class="btn-w" data-act="connect">${icon("terminal")}<span>${t("Kết nối")}</span></button>
          <button class="btn-g" data-act="files" title="${t("Quản lý file (SFTP)")}">${icon("folder")}</button>
          <button class="btn-g" data-act="hedit" title="${t("Sửa")}">${icon("pencil")}</button>
          <button class="btn-g danger" data-act="hdel" title="${t("Xoá")}">${icon("trash")}</button>
        </div>
      </article>`;
    });
    out.push(`<button type="button" class="add-card" data-act="hadd"><span class="plus">${icon("plus")}</span>${t("Thêm SSH host")}</button>`);
    $("#hostCards").innerHTML = out.join("");
    renderTabs();
  }

  // ───────── quy tắc theo thư mục ─────────
  const ruleDlg = $("#ruleDlg");
  const rule = { folder: "", acc: "" };
  const gitAccs = () => S.profiles.filter((p) => p.kind === "git");
  const homeRel = (p) => (S.home && p.startsWith(S.home) ? "~" + p.slice(S.home.length) : p);
  function renderRules() {
    const box = $("#rulesBox");
    box.hidden = S.page !== "accounts" || S.platform === "npm" || S.platform === "ssh" || S.platform === "k8s" || S.platform === "all";
    if (box.hidden) return;
    const list = S.rules || [];
    $("#ruleList").innerHTML = list.length
      ? list
          .map((r) => {
            const a = S.profiles.find((p) => p.id === r.account_id);
            return `<div class="rule-row"><span class="rule-f">${icon("folder")}<code>${esc(homeRel(r.folder))}</code></span>
              <span class="rule-arrow">→</span>
              <span class="rule-a">${esc(a ? a.name : "?")}${a ? ` <em>${esc(a.user_email)}</em>` : ""}</span>
              <span class="rule-st ${r.ok ? "ok" : "bad"}">${r.ok ? t("Đang có hiệu lực") : t("Chưa ghi vào ~/.gitconfig")}</span>
              <button type="button" class="btn-g danger" data-rule-del="${esc(r.id)}" title="${esc(t("Xoá"))}">${icon("trash")}</button></div>`;
          })
          .join("")
      : `<div class="rule-empty">${t("Chưa có quy tắc nào.")}</div>`;
  }
  function renderRuleAccs() {
    const accs = gitAccs();
    $("#ruleAccs").innerHTML = accs.length
      ? accs
          .map(
            (a) => `<button type="button" class="acc-opt ${rule.acc === a.id ? "on" : ""}" data-acc="${esc(a.id)}">
              <strong>${esc(a.name)}</strong><span>${esc(a.user_email)} · ${esc(a.host)}</span></button>`
          )
          .join("")
      : `<div class="rule-empty">${t("Chưa có tài khoản Git nào. Hãy thêm tài khoản trước.")}</div>`;
  }
  $("#ruleAdd").addEventListener("click", () => {
    rule.folder = "";
    rule.acc = "";
    $("#rulePath").textContent = t("Chưa chọn thư mục");
    $("#ruleErr").hidden = true;
    renderRuleAccs();
    ruleDlg.showModal();
  });
  $("#rulePick").addEventListener("click", async () => {
    const picked = await dialogApi.open({ directory: true, multiple: false, title: t("Chọn thư mục chứa các repo") });
    if (picked) {
      rule.folder = picked;
      $("#rulePath").textContent = homeRel(picked);
    }
  });
  $("#ruleAccs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acc]");
    if (!b) return;
    rule.acc = b.dataset.acc;
    renderRuleAccs();
  });
  $("#ruleCancel").addEventListener("click", () => ruleDlg.close());
  $("#ruleSave").addEventListener("click", async () => {
    const err = $("#ruleErr");
    err.hidden = true;
    if (!rule.folder) return ((err.textContent = t("Hãy chọn thư mục.")), (err.hidden = false));
    if (!rule.acc) return ((err.textContent = t("Hãy chọn tài khoản.")), (err.hidden = false));
    try {
      await invoke("rules_save", { folder: rule.folder, accountId: rule.acc });
      ruleDlg.close();
      toast(t("Đã lưu quy tắc"), "ok");
      await refresh();
    } catch (e) {
      err.textContent = tr(e);
      err.hidden = false;
    }
  });
  $("#ruleList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rule-del]");
    if (!b) return;
    try {
      await invoke("rules_delete", { id: b.dataset.ruleDel });
      toast(t("Đã xoá quy tắc"), "ok");
      await refresh();
    } catch (err) {
      toast(tr(err), "bad");
    }
  });

  // ───────── kho lưu trữ (sao lưu / khôi phục) ─────────
  const cfDlg = $("#cfDlg");
  let cfDone = null;
  const KIND_LABEL = { account: "Tài khoản", host: "SSH host", rule: "Quy tắc thư mục" };
  function askConflicts(list) {
    $("#cfSub").textContent = t("{n} mục trong file trùng mã với dữ liệu hiện có. Bạn muốn xử lý thế nào?", { n: list.length });
    $("#cfList").innerHTML = list
      .map((c) => `<div class="cf-row"><span class="cf-k">${esc(t(KIND_LABEL[c.kind] || c.kind))}</span><span>${esc(c.name)}</span></div>`)
      .join("");
    return new Promise((resolve) => {
      cfDone = resolve;
      cfDlg.showModal();
    });
  }
  const cfClose = (v) => {
    if (cfDone) cfDone(v);
    cfDone = null;
    if (cfDlg.open) cfDlg.close();
  };
  $("#cfOver").addEventListener("click", () => cfClose("over"));
  $("#cfKeep").addEventListener("click", () => cfClose("keep"));
  $("#cfCancel").addEventListener("click", () => cfClose("cancel"));
  cfDlg.addEventListener("cancel", () => cfClose("cancel"));
  const bk = { file: "" };
  const bkMsg = (msg, bad) => {
    const m = $("#bkMsg");
    m.textContent = msg;
    m.className = "bk-msg " + (bad ? "bad" : "ok");
    m.hidden = !msg;
  };
  $("#bkExport").addEventListener("click", async () => {
    const p1 = $("#bk_pass").value, p2 = $("#bk_pass2").value;
    if (p1.length < 8) return bkMsg(t("Mật khẩu cần ít nhất 8 ký tự."), true);
    if (p1 !== p2) return bkMsg(t("Hai lần nhập mật khẩu chưa khớp."), true);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dest = await dialogApi.save({
      defaultPath: `manager-account-${stamp}.macbackup`,
      filters: [{ name: "Manager Account backup", extensions: ["macbackup"] }],
    });
    if (!dest) return;
    try {
      const r = await invoke("backup_export", { passphrase: p1, path: dest });
      $("#bk_pass").value = "";
      $("#bk_pass2").value = "";
      bkMsg(t("Đã sao lưu {a} tài khoản, {h} SSH host, {r} quy tắc vào: {p}", { a: r.profiles, h: r.hosts, r: r.rules, p: dest }));
    } catch (e) {
      bkMsg(tr(e), true);
    }
  });
  $("#rsPick").addEventListener("click", async () => {
    const picked = await dialogApi.open({
      multiple: false,
      directory: false,
      filters: [{ name: "Manager Account backup", extensions: ["macbackup"] }],
    });
    if (!picked) return;
    bk.file = Array.isArray(picked) ? picked[0] : picked;
    $("#rsFile").textContent = bk.file;
  });
  $("#rsGo").addEventListener("click", async () => {
    if (!bk.file) return bkMsg(t("Hãy chọn file sao lưu trước."), true);
    if (!$("#rs_pass").value) return bkMsg(t("Hãy nhập mật khẩu của file."), true);
    $("#rsGo").disabled = true;
    try {
      const pass = $("#rs_pass").value;
      const info = await invoke("backup_inspect", { passphrase: pass, path: bk.file });
      let overwrite = true;
      if (info.conflicts.length) {
        const choice = await askConflicts(info.conflicts);
        if (choice === "cancel") return bkMsg("");
        overwrite = choice === "over";
      }
      const r = await invoke("backup_import", { passphrase: pass, path: bk.file, overwrite });
      $("#rs_pass").value = "";
      bkMsg(
        t("Đã khôi phục {a} tài khoản, {h} SSH host, {r} quy tắc.", { a: r.profiles, h: r.hosts, r: r.rules }) +
          (r.skipped ? " " + t("Bỏ qua {n} quy tắc trùng thư mục (giữ bản đang có).", { n: r.skipped }) : "")
      );
      await refresh();
    } catch (e) {
      bkMsg(tr(e), true);
    } finally {
      $("#rsGo").disabled = false;
    }
  });

  // ───────── trang Hiệu năng ─────────
  const stat = { hist: [], last: null, busy: false };
  const fmtB = (n) => {
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 100 * 1024 * 1024 ? 1 : 0) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  };
  const fmtUp = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
  };
  function renderStats() {
    const x = stat.last;
    if (!x) return;
    const tot = x.app_mem + x.child_mem;
    const cards = [
      [t("RAM tổng của app"), fmtB(tot), t("{p}% RAM máy", { p: ((tot / x.total_mem) * 100).toFixed(1) })],
      [t("RAM tiến trình chính"), fmtB(x.app_mem), "PID " + x.pid],
      [t("RAM tiến trình con"), fmtB(x.child_mem), t("{n} tiến trình (ssh, …)", { n: x.children.length })],
      [t("CPU"), (x.app_cpu + x.child_cpu).toFixed(1) + "%", t("trên tổng {n} nhân", { n: x.cores })],
      [t("Phiên SSH đang mở"), String(x.sessions), ""],
      [t("Đã chạy"), fmtUp(x.uptime), ""],
      [t("Dữ liệu app lưu"), fmtB(x.data_bytes), t("hồ sơ, host (secret nằm trong Keychain)")],
      [t("Hệ thống"), `${x.os} · ${x.arch}`, `v${x.version} · ${fmtB(x.total_mem)} RAM`],
    ];
    $("#statGrid").innerHTML = cards
      .map(([k, v, s]) => `<div class="stat"><div class="stat-k">${esc(k)}</div><div class="stat-v">${esc(v)}</div><div class="stat-s">${esc(s)}</div></div>`)
      .join("");
    $("#statNote").textContent = t("Chưa tính bộ máy webview của hệ điều hành trên macOS, nên con số thực tế có thể cao hơn một chút.");
    const h = stat.hist;
    const lo = Math.min(...h), hi = Math.max(...h);
    const span = Math.max(hi - lo, 4 * 1024 * 1024); // trục dọc tối thiểu 4 MB để đường không bị phẳng
    const pts = h.map((v, i) => `${(i / Math.max(h.length - 1, 1)) * 300},${66 - ((v - lo) / span) * 60}`).join(" ");
    $("#statSpark").innerHTML = `<polyline points="${pts}" fill="none" stroke="#111" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    const kids = $("#statKids");
    kids.hidden = !x.children.length;
    kids.innerHTML = x.children.length
      ? `<h3 class="stat-h">${t("Tiến trình con")}</h3>` +
        x.children.map((c) => `<div class="stat-row"><span>${esc(c.name)} <em>PID ${c.pid}</em></span><span>${fmtB(c.mem)}</span></div>`).join("")
      : "";
  }
  async function pollStats() {
    if (S.page !== "stats" || document.hidden || stat.busy) return;
    stat.busy = true;
    try {
      stat.last = await invoke("get_stats");
      stat.hist.push(stat.last.app_mem + stat.last.child_mem);
      if (stat.hist.length > 60) stat.hist.shift();
      renderStats();
    } catch (e) {
      /* bỏ qua một lần đo lỗi */
    } finally {
      stat.busy = false;
    }
  }
  setInterval(pollStats, 2000);

  // ───────── quản lý file (SFTP qua ssh) ─────────
  const ftp = { hid: "", acc: "", path: "", entries: [], busy: false, hidden: false, q: "" };
  const ftpDlg = $("#ftpDlg");
  const ftpErr = (e) => {
    const x = $("#ftpErr");
    x.textContent = tr(e);
    x.hidden = false;
  };
  const joinP = (d, n) => (d === "/" ? "" : d.replace(/\/+$/, "")) + "/" + n;
  const fmtSize = (n) => {
    if (n < 1024) return n + " B";
    const u = ["KB", "MB", "GB", "TB"];
    let i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n >= 10 ? 0 : 1) + " " + u[i];
  };
  function ftpBusy(on, msg) {
    ftp.busy = on;
    ftpDlg.classList.toggle("busy", on);
    const b = $("#ftpBusy");
    b.hidden = !on;
    if (on) b.querySelector("span").textContent = msg || t("Đang xử lý…");
  }
  async function ftpRun(msg, fn) {
    if (ftp.busy) return;
    $("#ftpErr").hidden = true;
    ftpBusy(true, msg);
    try {
      await fn();
    } catch (e) {
      ftpErr(e);
    } finally {
      ftpBusy(false);
    }
  }
  function ftpRender() {
    const q = ftp.q.trim().toLowerCase();
    const rows = ftp.entries.filter((e) => (ftp.hidden || !e.name.startsWith(".")) && (!q || e.name.toLowerCase().includes(q)));
    $("#ftpList").innerHTML = rows.length
      ? rows
          .map(
            (en) => `<div class="ftp-row" data-dir="${en.dir ? 1 : 0}" data-n="${esc(en.name)}">
              <span class="ftp-n">${icon(en.dir ? "folder" : "file")}<span>${esc(en.name)}</span></span>
              <span class="ftp-m">${en.dir ? "" : fmtSize(en.size)}</span>
              <span class="ftp-m ftp-d">${esc(en.mtime)}</span>
              <span class="ftp-a"><button type="button" class="btn-g" data-f="dl" title="${esc(en.dir ? t("Tải về (nén .tar.gz)") : t("Tải về"))}">${icon("download")}</button>
              <button type="button" class="btn-g" data-f="mv" title="${esc(t("Đổi tên"))}">${icon("pencil")}</button>
              <button type="button" class="btn-g danger" data-f="rm" title="${esc(t("Xoá"))}">${icon("trash")}</button></span></div>`
          )
          .join("")
      : `<div class="ftp-empty">${ftp.entries.length ? t("Không có mục nào khớp") : t("Thư mục trống")}</div>`;
  }
  async function ftpLoad(path) {
    $("#ftpErr").hidden = true;
    ftpBusy(true, t("Đang tải…"));
    try {
      const r = await invoke("sftp_list", { hostId: ftp.hid, accountId: ftp.acc, path });
      ftp.path = r.path;
      ftp.entries = r.entries;
      $("#ftpPath").value = r.path;
      ftpRender();
    } catch (e) {
      ftpErr(e);
    } finally {
      ftpBusy(false);
    }
  }
  function openFtp(hid, acc) {
    const h = S.hosts.find((x) => x.id === hid);
    Object.assign(ftp, { hid, acc: acc || "", entries: [], q: "" });
    $("#ftpQ").value = "";
    $("#ftpHidden").checked = ftp.hidden;
    $("#ftpTitle").textContent = t("Tệp trên {n}", { n: h ? h.name : "" });
    $("#ftpList").innerHTML = "";
    ftpDlg.showModal();
    ftpLoad("");
  }
  async function ftpUploadPaths(paths) {
    await ftpRun(t("Đang tải lên…"), async () => {
      for (const f of paths) await invoke("sftp_upload", { hostId: ftp.hid, accountId: ftp.acc, local: f, remoteDir: ftp.path });
      toast(t("Đã tải lên {n} mục", { n: paths.length }), "ok");
    });
    ftpLoad(ftp.path);
  }
  $("#ftpClose").addEventListener("click", () => ftpDlg.close());
  ftpDlg.addEventListener("cancel", (e) => ftp.busy && e.preventDefault());
  $("#ftpGo").addEventListener("click", () => ftpLoad($("#ftpPath").value.trim()));
  $("#ftpPath").addEventListener("keydown", (e) => e.key === "Enter" && ftpLoad($("#ftpPath").value.trim()));
  $("#ftpUp").addEventListener("click", () => ftpLoad(ftp.path.replace(/\/[^/]*\/?$/, "") || "/"));
  $("#ftpQ").addEventListener("input", (e) => {
    ftp.q = e.target.value;
    ftpRender();
  });
  $("#ftpHidden").addEventListener("change", (e) => {
    ftp.hidden = e.target.checked;
    ftpRender();
  });
  $("#ftpList").addEventListener("click", async (e) => {
    const row = e.target.closest(".ftp-row");
    if (!row || row.classList.contains("ftp-new") || e.target.closest("input")) return;
    const name = row.dataset.n;
    const isDir = row.dataset.dir === "1";
    const full = joinP(ftp.path, name);
    const act = e.target.closest("[data-f]")?.dataset.f;
    if (act === "dl") {
      const dest = await dialogApi.save({ defaultPath: isDir ? name + ".tar.gz" : name });
      if (!dest) return;
      await ftpRun(t("Đang tải về…"), async () => {
        await invoke("sftp_download", { hostId: ftp.hid, accountId: ftp.acc, remote: full, local: dest, dir: isDir });
        toast(t("Đã tải về"), "ok");
      });
    } else if (act === "rm") {
      const yes = await dialogApi.ask(
        isDir ? t("Xoá thư mục “{n}” và toàn bộ nội dung bên trong trên server?", { n: name }) : t("Xoá “{n}” trên server?", { n: name }),
        { title: t("Xác nhận xoá"), kind: "warning" }
      );
      if (!yes) return;
      await ftpRun(t("Đang xoá…"), () => invoke("sftp_remove", { hostId: ftp.hid, accountId: ftp.acc, path: full, dir: isDir, recursive: true }));
      ftpLoad(ftp.path);
    } else if (act === "mv") {
      const span = row.querySelector(".ftp-n span:last-child");
      span.innerHTML = `<input value="${esc(name)}" />`;
      const inp = span.querySelector("input");
      inp.focus();
      inp.select();
      let done = false;
      const finish = async (ok) => {
        if (done) return;
        done = true;
        const nn = inp.value.trim();
        if (!ok || !nn || nn === name || nn.includes("/")) return ftpRender();
        await ftpRun(t("Đang đổi tên…"), () =>
          invoke("sftp_rename", { hostId: ftp.hid, accountId: ftp.acc, from: full, to: joinP(ftp.path, nn) })
        );
        ftpLoad(ftp.path);
      };
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") finish(true);
        else if (ev.key === "Escape") finish(false);
      });
      inp.addEventListener("blur", () => finish(true));
    } else if (isDir) {
      ftpLoad(full);
    }
  });
  const pickUpload = async (directory) => {
    const picked = await dialogApi.open({ multiple: !directory, directory });
    if (picked) ftpUploadPaths(Array.isArray(picked) ? picked : [picked]);
  };
  $("#ftpUpload").addEventListener("click", () => pickUpload(false));
  $("#ftpUploadDir").addEventListener("click", () => pickUpload(true));
  $("#ftpMkdir").addEventListener("click", () => {
    const list = $("#ftpList");
    if (list.querySelector(".ftp-new")) return list.querySelector(".ftp-new input").focus();
    list.insertAdjacentHTML(
      "afterbegin",
      `<div class="ftp-row ftp-new"><span class="ftp-n">${icon("folder")}<input placeholder="${esc(t("Tên thư mục mới, nhấn Enter"))}" /></span></div>`
    );
    const inp = list.querySelector(".ftp-new input");
    inp.focus();
    inp.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") return inp.closest(".ftp-new").remove();
      if (e.key !== "Enter" || !inp.value.trim()) return;
      await ftpRun(t("Đang tạo…"), () =>
        invoke("sftp_mkdir", { hostId: ftp.hid, accountId: ftp.acc, path: joinP(ftp.path, inp.value.trim()) })
      );
      ftpLoad(ftp.path);
    });
  });
  // kéo thả file/thư mục từ máy vào hộp thoại để tải lên
  try {
    const wv = T.webview && T.webview.getCurrentWebview && T.webview.getCurrentWebview();
    if (wv && wv.onDragDropEvent) {
      wv.onDragDropEvent((ev) => {
        const d = ev.payload;
        if (!ftpDlg.open) return;
        if (d.type === "over" || d.type === "enter") ftpDlg.classList.add("drop");
        else if (d.type === "leave") ftpDlg.classList.remove("drop");
        else if (d.type === "drop") {
          ftpDlg.classList.remove("drop");
          if (d.paths && d.paths.length) ftpUploadPaths(d.paths);
        }
      });
    }
  } catch { /* không hỗ trợ kéo thả */ }

  // ───────── terminal SSH ngay trong app (xterm.js + PTY ở phía Rust) ─────────
  S.terms = []; // { id, key, title, term, fit, el, ended }
  S.termActive = null; // key của tab đang xem, null = danh sách host
  const pendingData = {};
  let termSeq = 0;

  function renderTabs() {
    const bar = $("#termTabs");
    bar.hidden = !S.terms.length;
    $("#hostList").hidden = S.termActive !== null;
    $("#termView").hidden = S.termActive === null;
    if (!S.terms.length) return;
    const act = S.terms.find((q) => q.key === S.termActive);
    bar.innerHTML =
      `<button type="button" class="tab ${S.termActive === null ? "on" : ""}" data-tab="">${icon("server")}<span>${t("Danh sách")}</span></button>` +
      S.terms
        .map(
          (x) => `<span class="tab ${S.termActive === x.key ? "on" : ""}" data-tab="${x.key}">
            <span class="tab-t"><i class="st ${x.ended ? "off" : "live"}"></i><span>${esc(x.title)}</span></span>
            <button type="button" class="tab-x" data-close="${x.key}" title="${esc(t("Đóng tab"))}" aria-label="${esc(t("Đóng tab"))}">${icon("x")}</button></span>`
        )
        .join("") +
      `<button type="button" class="tab plus" data-new title="${esc(t("Mở kết nối mới"))}" aria-label="${esc(t("Mở kết nối mới"))}">${icon("plus")}</button>` +
      (act ? `<button type="button" class="tab dup" data-dup="${act.key}" title="${esc(t("Mở thêm một tab cùng host và tài khoản này"))}">${icon("copy")}<span>${t("Nhân đôi")}</span></button>` : "") +
      (act && act.ended ? `<button type="button" class="tab re" data-re="${act.key}">${icon("refresh")}<span>${t("Kết nối lại")}</span></button>` : "");
  }
  function showTab(key) {
    S.termActive = key;
    S.terms.forEach((x) => (x.el.hidden = x.key !== key));
    renderTabs();
    if (key === null) renderHosts(); // cập nhật số phiên đang mở trên thẻ
    const cur = S.terms.find((x) => x.key === key);
    if (cur) requestAnimationFrame(() => { fitTerm(cur); cur.term.focus(); });
  }
  function fitTerm(x) {
    try { x.fit.fit(); } catch { /* chưa hiển thị */ }
  }
  // bắt đầu (hoặc bắt đầu lại) phiên ssh cho một tab
  async function startSession(x) {
    x.ended = false;
    renderTabs();
    x.term.write(`\x1b[90m${t("Đang kết nối…")}\x1b[0m\r\n`);
    try {
      x.id = await invoke("term_open", { hostId: x.hostId, accountId: x.accId || null, cols: x.term.cols, rows: x.term.rows });
    } catch (e) {
      x.term.write(`\r\n\x1b[31m${tr(e)}\x1b[0m\r\n`);
      x.ended = true;
      renderTabs();
      return;
    }
    (pendingData[x.id] || []).forEach((b) => x.term.write(b));
    delete pendingData[x.id];
    x.term.focus();
  }
  async function openTerm(hostId, accId) {
    const h = S.hosts.find((x) => x.id === hostId);
    const acc = S.profiles.find((x) => x.id === accId);
    const key = "t" + ++termSeq;
    const el = document.createElement("div");
    el.className = "term-pane";
    $("#termView").appendChild(el);
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: "#0b0b0f", foreground: "#e5e7eb", cursor: "#ffffff", selectionBackground: "#374151" },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    const x = { id: null, key, hostId, accId, title: acc ? `${h.name} · ${acc.login}` : h.name, term, fit, el, ended: false };
    S.terms.push(x);
    showTab(key); // phải hiển thị trước khi mở/đo kích thước
    term.open(el);
    fitTerm(x);
    term.onData((d) => { if (x.id && !x.ended) invoke("term_write", { id: x.id, data: d }).catch(() => {}); });
    term.onResize(({ cols, rows }) => { if (x.id && !x.ended) invoke("term_resize", { id: x.id, cols, rows }).catch(() => {}); });
    await startSession(x);
  }
  async function reconnectTerm(key) {
    const x = S.terms.find((q) => q.key === key);
    if (!x || !x.ended) return;
    x.term.write("\r\n");
    fitTerm(x);
    await startSession(x);
  }
  async function closeTerm(key) {
    const i = S.terms.findIndex((x) => x.key === key);
    if (i < 0) return;
    const x = S.terms[i];
    if (x.id && !x.ended) await invoke("term_close", { id: x.id }).catch(() => {});
    x.term.dispose();
    x.el.remove();
    S.terms.splice(i, 1);
    if (S.termActive === key) S.termActive = null;
    showTab(S.termActive);
  }
  if (T.event && T.event.listen) {
    T.event.listen("term-data", (ev) => {
      const { id, data } = ev.payload || {};
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const x = S.terms.find((q) => q.id === id);
      if (x) x.term.write(bytes);
      else (pendingData[id] = pendingData[id] || []).push(bytes);
    });
    T.event.listen("term-exit", (ev) => {
      const x = S.terms.find((q) => q.id === (ev.payload || {}).id);
      if (!x) return;
      x.ended = true;
      x.term.write(`\r\n\x1b[90m[${t("Phiên SSH đã kết thúc — bấm Kết nối lại hoặc đóng tab")}]\x1b[0m\r\n`);
      renderTabs();
    });
  }
  new ResizeObserver(() => {
    const cur = S.terms.find((x) => x.key === S.termActive);
    if (cur) fitTerm(cur);
  }).observe($("#termView"));

  const hostDlg = $("#hostDlg");
  function openHostForm(h) {
    S.hostEdit = h ? h.id : null;
    $("#hostDlgTitle").textContent = h ? t("Sửa SSH host") : t("Thêm SSH host");
    $("#h_name").value = h?.name ?? "";
    $("#h_addr").value = h?.address ?? "";
    $("#h_port").value = h?.port ?? 22;
    $("#h_note").value = h?.note ?? "";
    $("#hostErr").hidden = true;
    hostDlg.showModal();
    $("#h_name").focus();
  }
  async function submitHost(ev) {
    ev.preventDefault();
    const btn = $("#hostSave");
    btn.disabled = true;
    $("#hostErr").hidden = true;
    try {
      await invoke("save_host", {
        input: {
          id: S.hostEdit,
          name: $("#h_name").value,
          address: $("#h_addr").value,
          port: parseInt($("#h_port").value, 10) || 22,
          note: $("#h_note").value,
        },
      });
      hostDlg.close();
      toast(t("Đã lưu"), "ok");
      S.hosts = await invoke("list_hosts");
      renderHosts();
    } catch (e) {
      const el = $("#hostErr");
      el.textContent = tr(e);
      el.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }
  async function deleteHost(id) {
    const h = S.hosts.find((x) => x.id === id);
    let yes = false;
    try {
      yes = await dialogApi.ask(t("Xoá SSH host “{n}”?", { n: h.name }), { title: t("Xác nhận xoá"), kind: "warning" });
    } catch {
      yes = window.confirm(t("Xoá SSH host “{n}”?", { n: h.name }));
    }
    if (!yes) return;
    try {
      await invoke("delete_host", { id });
      S.hosts = await invoke("list_hosts");
      renderHosts();
    } catch (e) {
      toast(tr(e), "bad");
    }
  }
  // ───────── hướng dẫn theo từng menu ─────────
  const GUIDES = {
    "git": {
      "title": "Hướng dẫn: tài khoản Git",
      "blocks": [
        {
          "h": "1. Thêm tài khoản",
          "items": [
            "Bấm thẻ <b>Thêm tài khoản</b> ở cuối danh sách.",
            "Nhập tên hiển thị, host (github.com, gitlab.com…), <code>user.name</code> và <code>user.email</code>. Hai giá trị sau cùng sẽ hiện trên các commit của bạn.",
            "Chọn cách đăng nhập: <b>SSH key</b> (chọn file hoặc dán private key) hoặc <b>Personal Access Token</b> (username + token).",
            "Bấm <b>Lưu</b>. Lúc này app chỉ ghi nhớ thông tin, chưa đổi gì trong git. Token được cất trong Keychain của hệ điều hành."
          ]
        },
        {
          "h": "2. Dùng tài khoản",
          "items": [
            "Chọn phạm vi ở góc trên: <b>Toàn máy</b> (ghi vào <code>~/.gitconfig</code>) hoặc <b>Một repo</b> (chỉ repo bạn chọn).",
            "Bấm <b>Dùng tài khoản này</b>. App chạy <code>git config</code> để đặt <code>user.name</code> và <code>user.email</code>. Tài khoản SSH còn đặt <code>core.sshCommand</code> trỏ tới đúng key, tài khoản token thì nạp token vào credential helper.",
            "Từ đó <code>git commit</code>, <code>git push</code>, <code>git pull</code> ở nơi đó dùng đúng tài khoản, không phải đăng nhập lại.",
            "Thẻ có chấm xanh <b>Đang dùng</b> nghĩa là cấu hình git hiện tại đang khớp với tài khoản đó."
          ]
        },
        {
          "h": "3. Mẹo",
          "items": [
            "Bấm biểu tượng nhịp tim để <b>Test kết nối</b>: SSH thử đăng nhập vào host, token gọi API để xem token thuộc tài khoản nào.",
            "Lấy token: GitHub vào Settings → Developer settings → Personal access tokens (cần quyền <code>repo</code>); GitLab vào Preferences → Access tokens; Bitbucket dùng app password.",
            "Xoá tài khoản trong app cũng xoá token hoặc key đã lưu của tài khoản đó."
          ]
        }
      ]
    },
    "npm": {
      "title": "Hướng dẫn: npm registry",
      "blocks": [
        {
          "h": "1. Thêm tài khoản",
          "items": [
            "Bấm thẻ <b>Thêm tài khoản</b>, nhập tên hiển thị, <b>Registry</b> (npmjs, GitHub Packages hoặc registry riêng của công ty) và token.",
            "Chỉ muốn dùng registry này cho một nhóm package thì điền <b>Scope</b> (ví dụ <code>@congty</code>). Để trống thì áp dụng cho mọi package.",
            "Tạo token trên trang của registry: npmjs vào Access Tokens; GitHub Packages dùng Personal access token có quyền <code>read:packages</code>."
          ]
        },
        {
          "h": "2. Dùng tài khoản",
          "items": [
            "Chọn phạm vi: <b>Toàn máy</b> ghi vào <code>~/.npmrc</code>, <b>Một repo</b> ghi vào <code>.npmrc</code> trong repo đó.",
            "Bấm <b>Dùng tài khoản này</b>: app ghi dòng <code>//registry/:_authToken=…</code> và dòng <code>registry=</code> (hoặc <code>@scope:registry=</code>), các dòng khác giữ nguyên.",
            "Sau đó <code>npm install</code> và <code>npm publish</code> dùng đúng tài khoản. Kiểm tra bằng <code>npm whoami</code>."
          ]
        },
        {
          "h": "3. Mẹo",
          "items": [
            "Token nằm dạng chữ thường trong <code>.npmrc</code> (npm yêu cầu như vậy). Đừng commit file này lên git.",
            "Bấm biểu tượng nhịp tim để <b>Test kết nối</b> (gọi <code>/-/whoami</code> của registry)."
          ]
        }
      ]
    },
    "ssh": {
      "title": "Hướng dẫn: tài khoản SSH",
      "blocks": [
        {
          "h": "1. Tài khoản SSH là gì",
          "items": [
            "Là thông tin để đăng nhập vào server: <b>username</b>, cùng <b>mật khẩu</b>, <b>key</b> (RSA, ED25519…) hoặc cả hai.",
            "Tài khoản này không đổi cấu hình git hay npm. Nó được dùng ở menu <b>SSH host</b>."
          ]
        },
        {
          "h": "2. Thêm tài khoản",
          "items": [
            "Bấm thẻ <b>Thêm tài khoản</b>, nhập tên hiển thị và username (ví dụ <code>root</code>, <code>ubuntu</code>).",
            "Nhập mật khẩu, chọn hoặc dán key, hoặc cả hai. Mật khẩu lưu trong Keychain và được tự điền khi kết nối.",
            "Để trống cả hai thì terminal sẽ hỏi mật khẩu khi bạn kết nối."
          ]
        },
        {
          "h": "3. Bước tiếp theo",
          "items": [
            "Sang menu <b>SSH host</b>, thêm máy chủ rồi chọn tài khoản này ở ô <b>Kết nối bằng</b>."
          ]
        }
      ]
    },
    "hosts": {
      "title": "Hướng dẫn: SSH host",
      "blocks": [
        {
          "h": "1. Thêm máy chủ",
          "items": [
            "Bấm thẻ <b>Thêm SSH host</b>, nhập tên hiển thị, địa chỉ (IP hoặc domain) và port (mặc định 22).",
            "Host chỉ lưu địa chỉ. User, mật khẩu và key nằm ở tài khoản SSH (menu <b>Tài khoản → SSH</b>)."
          ]
        },
        {
          "h": "2. Kết nối",
          "items": [
            "Chọn tài khoản ở ô <b>Kết nối bằng</b>, rồi bấm <b>Kết nối</b>. Một tab terminal mở ngay trong app và chạy <code>ssh</code>.",
            "Mở thêm tab bằng nút <b>+</b> (chọn host khác) hoặc <b>Nhân đôi</b> (cùng host). Chuyển tab qua lại không mất phiên.",
            "Phiên kết thúc thì bấm <b>Kết nối lại</b>. Đóng tab hoặc tắt app sẽ đóng phiên ssh."
          ]
        },
        {
          "h": "3. Mẹo",
          "items": [
            "Lần đầu tới một host mới, app tự chấp nhận khoá host của server.",
            "Chạy việc lâu trên server nên dùng <code>tmux</code> hoặc <code>screen</code> để không bị mất khi đóng phiên."
          ]
        }
      ]
    }
  };
  function renderGuide() {
    const g = $("#guide");
    const topic = S.page === "hosts" ? "hosts" : S.page === "accounts" && S.platform !== "all" && S.platform !== "k8s" ? (S.platform === "npm" ? "npm" : S.platform === "ssh" ? "ssh" : "git") : null;
    if (!topic) {
      g.hidden = true;
      return;
    }
    const def = GUIDES[topic];
    g.dataset.topic = topic;
    g.hidden = false;
    g.innerHTML =
      `<summary>${icon("info")}<span class="guide-t">${esc(t(def.title))}</span><span class="guide-h">${esc(t("Ẩn / hiện hướng dẫn"))}</span>${icon("chevron", "guide-ch")}</summary>
       <div class="guide-grid">` +
      def.blocks.map((b) => `<div class="guide-b"><h4>${esc(t(b.h))}</h4><ul>${b.items.map((i) => `<li>${t(i)}</li>`).join("")}</ul></div>`).join("") +
      "</div>";
    g.open = store.get("guide:" + topic, "1") === "1";
  }
  $("#guide").addEventListener("toggle", (e) => {
    const g = e.currentTarget;
    if (g.dataset.topic) store.set("guide:" + g.dataset.topic, g.open ? "1" : "0");
  });

  function renderChrome() {
    renderSub();
    document.querySelectorAll("#scopeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.scope === S.scope));
    const isRepo = S.scope === "repo";
    const noScope = S.platform === "ssh" || S.platform === "k8s" || S.platform === "all"; // SSH server không liên quan repo; "Tất cả" chỉ để xem
    $("#repoBar").hidden = !isRepo || noScope;
    $("#repoPath").textContent = S.repo || t("Chưa chọn thư mục");
    $("#clearRepo").hidden = !S.repo;
    $("#convert").checked = S.convert;
    const npmSel = S.platform === "npm";
    $("#scopeSeg").title = isRepo
      ? t("Chỉ repo này dùng tài khoản đã chọn, các repo khác không bị ảnh hưởng.")
      : npmSel
        ? t("Ghi vào ~/.npmrc: mọi dự án chưa có .npmrc riêng sẽ dùng tài khoản này.")
        : t("Ghi vào ~/.gitconfig: mọi repo chưa có cấu hình riêng sẽ dùng tài khoản này.");

    document.querySelectorAll("#nav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === S.page));
    $("#page-accounts").hidden = S.page !== "accounts";
    $("#page-hosts").hidden = S.page !== "hosts";
    $("#page-backup").hidden = S.page !== "backup";
    $("#page-stats").hidden = S.page !== "stats";
    $("#page-settings").hidden = S.page !== "settings";
    if (S.page === "stats") { renderStats(); pollStats(); }
    $("#page-about").hidden = S.page !== "about";
    const curPlat = platformList().find((p) => p.id === S.platform);
    $("#pageTitle").textContent =
      S.page === "accounts" && curPlat ? `${t(PAGES.accounts.title)} · ${curPlat.name}` : t(PAGES[S.page].title);
    $("#pageSub").textContent = t(PAGES[S.page].sub);
    $("#scopeSeg").hidden = S.page !== "accounts" || noScope;
    $("#refreshBtn").hidden = S.page === "stats";
    renderGuide();

    $("#refreshBtn").querySelector(".ic").classList.toggle("spin", S.busy === "refresh");

    const u = S.update;
    const showUpd = !!(u && u.has_update && store.get("dismiss", "") !== u.latest);
    $("#updateBar").hidden = !showUpd;
    if (showUpd) {
      $("#updTitle").textContent = t("Có bản mới {v}", { v: u.latest });
      if (!installing) $("#updSub").textContent = t("Bạn đang dùng v{v}", { v: String(u.current).replace(/^v/, "") });
    }
    $("#verText").textContent = `Manager Account${S.version ? " v" + String(S.version).replace(/^v/, "") : ""}`;
    $("#autoUpd").checked = S.autoUpd;
    $("#aboutVer").textContent = t("Phiên bản {v}", { v: S.version ? "v" + String(S.version).replace(/^v/, "") : "—" });
  }

  function render() {
    renderChrome();
    renderCards();
    renderRules();
    renderHosts();
  }
  async function refresh() {
    await loadProfiles();
    await loadCurrent();
    render();
  }

  // ───────── hành động ─────────
  async function useProfile(id) {
    const p = S.profiles.find((x) => x.id === id);
    const k8s = p.kind === "k8s";
    if (!k8s && S.scope === "repo" && !S.repo) return toast(t("Hãy chọn thư mục repo trước."), "bad");
    if (k8s && p.env === "prod") {
      let yes = false;
      try {
        yes = await dialogApi.ask(
          t("“{n}” là cluster PRODUCTION. Mọi lệnh kubectl từ giờ sẽ chạy trên cluster này. Tiếp tục?", { n: p.name }),
          { title: t("Xác nhận cluster production"), kind: "warning" }
        );
      } catch {
        yes = window.confirm(t("“{n}” là cluster PRODUCTION. Tiếp tục?", { n: p.name }));
      }
      if (!yes) return;
    }
    S.busy = "use:" + id;
    renderCards();
    try {
      const lines = await invoke("apply_profile", {
        id,
        scope: S.scope,
        repoPath: S.repo || null,
        convertRemote: S.scope === "repo" && S.convert,
      });
      toast(t("Đã chuyển sang “{n}”", { n: p.name }), "ok");
      const bk = (lines || []).find((l) => l.startsWith("Đã sao lưu file cũ"));
      if (bk) setTimeout(() => toast(tr(bk), "ok"), 3300);
    } catch (e) {
      toast(tr(e), "bad");
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
      toast(tr(r.message), r.ok ? "ok" : "bad");
    } catch (e) {
      toast(tr(e), "bad");
    } finally {
      S.busy = null;
      renderCards();
    }
  }

  async function deleteProfile(id) {
    const p = S.profiles.find((x) => x.id === id);
    let yes = false;
    try {
      yes = await dialogApi.ask(t("Xoá tài khoản “{n}”? Token/key đã lưu cho tài khoản này cũng bị xoá.", { n: p.name }), {
        title: t("Xác nhận xoá"),
        kind: "warning",
      });
    } catch {
      yes = window.confirm(t("Xoá tài khoản “{n}”?", { n: p.name }));
    }
    if (!yes) return;
    try {
      await invoke("delete_profile", { id });
      await invoke("rules_sync").catch(() => {});
      toast(t("Đã xoá"), "ok");
    } catch (e) {
      toast(tr(e), "bad");
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
  function setEnv(e) {
    S.env = e || "";
    document.querySelectorAll("#envSeg button").forEach((b) => b.classList.toggle("on", b.dataset.env === S.env));
  }
  document.querySelectorAll("#envSeg button").forEach((b) => b.addEventListener("click", () => setEnv(b.dataset.env)));
  $("#viewKube").addEventListener("click", async () => {
    try {
      $("#f_kube").value = await invoke("reveal_secret", { id: S.editId });
      $("#viewKube").hidden = true;
    } catch (e) {
      toast(tr(e), "bad");
    }
  });
  function setKind(k) {
    S.kind = k;
    const npm = k === "npm";
    const ssh = k === "ssh";
    const git = k === "git";
    const k8s = k === "k8s";
    $("#k8sFields").hidden = !k8s;
    $("#authSet").hidden = k8s;
    $("#hostLabel").hidden = !git;
    $("#registryLabel").hidden = !npm;
    $("#npmFields").hidden = !npm;
    $("#sshFields").hidden = !ssh;
    $("#gitIdent").hidden = !git;
    $("#loginLabel").hidden = !git;
    $("#f_host").required = git;
    $("#f_uname").required = git;
    $("#f_email").required = git;
    $("#authSeg").hidden = !git;
    // tạo/xem public key chỉ dành cho tài khoản Git; tài khoản SSH giữ nguyên như cũ
    $("#genKey").parentElement.hidden = !git;
    if (!git) $("#pubBox").hidden = true;
    $("#gitIdent").hidden = !git;
    $("#authLegend").textContent = npm ? t("Token truy cập (npm access token)") : ssh ? t("Key SSH (tuỳ chọn)") : t("Cách đăng nhập");
    $("#tokenLbl").textContent = npm ? "Token" : "Personal Access Token";
    $("#tokenHint").hidden = npm;
    if (!($("#f_token").placeholder || "").startsWith("Đã") && !($("#f_token").placeholder || "").startsWith("Saved"))
      $("#f_token").placeholder = npm ? "npm_…" : "ghp_… / glpat-…";
    if (npm) setAuth("token");
    if (ssh) setAuth("ssh");
  }
  function openForm(p) {
    S.editId = p ? p.id : null;
    $("#f_registry").value = p?.registry ?? "https://registry.npmjs.org/";
    $("#f_scope").value = p?.scope ?? "";
    $("#dlgTitle").textContent = p ? t("Sửa tài khoản") : t("Thêm tài khoản");
    $("#f_name").value = p?.name ?? "";
    const pl = platformList().find((x) => x.id === S.platform);
    $("#f_host").value = p?.host ?? pl?.host ?? "github.com";
    $("#f_uname").value = p?.user_name ?? "";
    $("#f_email").value = p?.user_email ?? "";
    $("#f_keypath").value = p?.ssh_key_path ?? "";
    $("#f_keytext").value = "";
    $("#f_login").value = p?.login ?? "";
    $("#f_token").value = "";
    $("#f_token").placeholder = p?.has_token ? t("Đã lưu — để trống nếu giữ nguyên") : "ghp_… / glpat-…";
    $("#formErr").hidden = true;
    // xem lại secret đã lưu (chỉ khi đang sửa tài khoản có sẵn)
    $("#f_token").type = "password";
    $("#viewToken").textContent = t("Hiện");
    $("#viewToken").hidden = !(p && p.has_token);
    $("#keyView").value = "";
    $("#pubKey").value = "";
    $("#pubBox").hidden = true;
    $("#keyViewBox").hidden = true;
    $("#copyKey").hidden = true;
    $("#viewKey").textContent = t("Xem key đã lưu");
    $("#viewKey").hidden = !(p && p.auth === "ssh" && p.ssh_key_path);
    setAuth(p?.auth ?? "ssh");
    $("#f_sshuser").value = p?.kind === "ssh" ? p.login : "";
    $("#f_sshpass").value = "";
    $("#f_sshpass").type = "password";
    $("#viewPass").textContent = t("Hiện");
    $("#viewPass").hidden = !(p && p.kind === "ssh" && p.has_token);
    $("#f_sshpass").placeholder = p?.kind === "ssh" && p.has_token ? t("Đã lưu — để trống nếu giữ nguyên") : t("Nhập mật khẩu của user này");
    const hasPP = !!(p && p.kind === "ssh" && p.has_passphrase);
    $("#f_sshpp").value = "";
    $("#f_sshpp").type = "password";
    $("#viewPP").textContent = t("Hiện");
    $("#viewPP").hidden = !hasPP;
    $("#clearPPBox").hidden = !hasPP;
    $("#f_clearpp").checked = false;
    $("#f_sshpp").placeholder = hasPP ? t("Đã lưu — để trống nếu giữ nguyên") : t("Chỉ cần nếu key của bạn có đặt passphrase");
    setEnv(p?.env ?? "");
    $("#f_kube").value = "";
    $("#f_kube").placeholder = p?.kind === "k8s" ? t("Đã lưu (mã hoá) — để trống nếu giữ nguyên") : "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://…";
    $("#viewKube").textContent = t("Xem kubeconfig đã lưu");
    $("#viewKube").hidden = !(p && p.kind === "k8s");
    setKind(p ? p.kind || "git" : S.platform === "npm" ? "npm" : S.platform === "ssh" ? "ssh" : S.platform === "k8s" ? "k8s" : "git");
    dlg.showModal();
    $("#f_name").focus();
  }

  $("#viewToken").addEventListener("click", async () => {
    const f = $("#f_token");
    if (f.type === "text") {
      f.type = "password";
      $("#viewToken").textContent = t("Hiện");
      return;
    }
    try {
      if (!f.value) f.value = await invoke("reveal_secret", { id: S.editId });
      f.type = "text";
      $("#viewToken").textContent = t("Ẩn");
    } catch (e) {
      toast(String(e), "err");
    }
  });
  $("#viewKey").addEventListener("click", async () => {
    const box = $("#keyViewBox");
    if (!box.hidden) {
      box.hidden = true;
      $("#keyView").value = "";
      $("#copyKey").hidden = true;
      $("#viewKey").textContent = t("Xem key đã lưu");
      return;
    }
    try {
      $("#keyView").value = await invoke("reveal_secret", { id: S.editId });
      box.hidden = false;
      $("#copyKey").hidden = false;
      $("#viewKey").textContent = t("Ẩn key");
    } catch (e) {
      toast(String(e), "err");
    }
  });
  $("#viewPass").addEventListener("click", async () => {
    const f = $("#f_sshpass");
    if (f.type === "text") {
      f.type = "password";
      $("#viewPass").textContent = t("Hiện");
      return;
    }
    try {
      if (!f.value) f.value = await invoke("reveal_password", { id: S.editId });
      f.type = "text";
      $("#viewPass").textContent = t("Ẩn");
    } catch (e) {
      toast(tr(e), "bad");
    }
  });
  $("#viewPP").addEventListener("click", async () => {
    const f = $("#f_sshpp");
    if (f.type === "text") {
      f.type = "password";
      $("#viewPP").textContent = t("Hiện");
      return;
    }
    try {
      if (!f.value) f.value = await invoke("reveal_passphrase", { id: S.editId });
      f.type = "text";
      $("#viewPP").textContent = t("Ẩn");
    } catch (e) {
      toast(tr(e), "bad");
    }
  });
  $("#copyKey").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#keyView").value);
      toast(t("Đã sao chép key"), "ok");
    } catch {
      $("#keyView").select();
    }
  });
  // ───────── tạo / xem public key ─────────
  function keyPageUrl() {
    const h = ($("#f_host").value || "github.com").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (h === "github.com") return "https://github.com/settings/ssh/new";
    if (h === "bitbucket.org") return "https://bitbucket.org/account/settings/ssh-keys/";
    if (h.includes("gitlab")) return `https://${h}/-/user_settings/ssh_keys`;
    return `https://${h}`;
  }
  function showPub(pub) {
    $("#pubKey").value = pub;
    $("#pubBox").hidden = false;
    $("#openKeyPage").hidden = S.kind !== "git";
  }
  $("#genKey").addEventListener("click", async () => {
    const err = $("#formErr");
    err.hidden = true;
    if ($("#f_keytext").value.trim() || $("#f_keypath").value.trim()) {
      let yes = false;
      try {
        yes = await dialogApi.ask(t("Form này đã có key. Tạo key mới sẽ thay key đó khi bạn bấm Lưu. Tiếp tục?"), { title: t("Tạo key mới"), kind: "warning" });
      } catch {
        yes = true;
      }
      if (!yes) return;
    }
    $("#genKey").disabled = true;
    try {
      const comment = $("#f_email").value.trim() || $("#f_name").value.trim() || "manager-account";
      const kp = await invoke("ssh_keygen", { comment });
      $("#f_keytext").value = kp.private;
      $("#f_keypath").value = "";
      showPub(kp.public);
      toast(t("Đã tạo key. Hãy thêm public key vào GitHub/GitLab, rồi bấm Lưu."), "ok");
    } catch (e) {
      err.textContent = tr(e);
      err.hidden = false;
    } finally {
      $("#genKey").disabled = false;
    }
  });
  $("#getPub").addEventListener("click", async () => {
    const err = $("#formErr");
    err.hidden = true;
    try {
      const pub = await invoke("ssh_public_key", { path: $("#f_keypath").value, text: $("#f_keytext").value });
      showPub(pub);
    } catch (e) {
      err.textContent = tr(e);
      err.hidden = false;
    }
  });
  $("#copyPub").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#pubKey").value);
      toast(t("Đã sao chép public key"), "ok");
    } catch {
      $("#pubKey").select();
    }
  });
  $("#openKeyPage").addEventListener("click", () => invoke("open_url", { url: keyPageUrl() }).catch((e) => toast(tr(e), "bad")));
  dlg.addEventListener("close", () => {
    $("#pubKey").value = "";
    $("#pubBox").hidden = true;
  });

  dlg.addEventListener("close", () => {
    $("#keyView").value = "";
    $("#f_token").value = "";
    $("#f_token").type = "password";
    $("#f_sshpass").value = "";
    $("#f_sshpass").type = "password";
    $("#f_sshpp").value = "";
    $("#f_sshpp").type = "password";
  });

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
        login: S.kind === "ssh" ? $("#f_sshuser").value : $("#f_login").value,
        ssh_key_path: $("#f_keypath").value,
        ssh_private_key: $("#f_keytext").value,
        token: S.kind === "ssh" ? $("#f_sshpass").value : $("#f_token").value,
        passphrase: S.kind === "ssh" ? $("#f_sshpp").value : "",
        clear_passphrase: S.kind === "ssh" && $("#f_clearpp").checked,
        kind: S.kind,
        registry: $("#f_registry").value,
        scope: $("#f_scope").value,
        kubeconfig: S.kind === "k8s" ? $("#f_kube").value : "",
        env: S.kind === "k8s" ? S.env || "" : "",
      };
      const saved = await invoke("save_profile", { input });
      await invoke("rules_sync").catch(() => {});
      dlg.close();
      toast(t("Đã lưu tài khoản"), "ok");
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
        title: t("Chọn file SSH private key"),
        defaultPath: S.home ? S.home + sep + ".ssh" : undefined,
      });
      if (picked) $("#f_keypath").value = Array.isArray(picked) ? picked[0] : picked;
    } catch (e) {
      toast(tr(e), "bad");
    }
  }

  async function pickRepo() {
    try {
      const picked = await dialogApi.open({ directory: true, multiple: false, title: t("Chọn thư mục repo") });
      if (picked) {
        S.repo = Array.isArray(picked) ? picked[0] : picked;
        store.set("repo", S.repo);
        await loadCurrent();
        render();
      }
    } catch (e) {
      toast(tr(e), "bad");
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
      setStatus(t("Đang kiểm tra…"));
    }
    try {
      const r = await invoke("check_update");
      S.version = r.current;
      S.update = r;
      let msg, kind = "ok";
      if (r.none_published) msg = t("Chưa có bản phát hành nào trên GitHub.");
      else if (r.has_update) msg = t("Có bản mới {l} (bạn đang dùng v{c}).", { l: r.latest, c: r.current });
      else msg = t("Bạn đang dùng bản mới nhất (v{c}).", { c: r.current });
      if (manual) {
        store.set("dismiss", "");
        setStatus(msg, kind);
        toast(msg, "ok");
      }
    } catch (e) {
      if (manual) {
        setStatus(tr(e), "bad");
        toast(tr(e), "bad");
      }
    } finally {
      btn.disabled = false;
      render();
    }
  }

  // Tải + cài bản mới ngay trong app (chữ ký số được kiểm tra trước khi cài, xong tự khởi động lại)
  let installing = false;
  function setUpdBusy(busy, text) {
    installing = busy;
    ["#updNow", "#updOpen", "#updLater"].forEach((id) => ($(id).disabled = busy));
    $("#updNow").textContent = busy ? t("Đang cập nhật…") : t("Cập nhật ngay");
    if (text) $("#updSub").textContent = text;
  }
  async function installUpdate() {
    if (installing) return;
    setUpdBusy(true, t("Đang chuẩn bị tải…"));
    try {
      await invoke("install_update"); // thành công thì app tự khởi động lại
    } catch (e) {
      setUpdBusy(false);
      renderChrome();
      toast(tr(e), "bad");
    }
  }
  if (T.event && T.event.listen) {
    T.event.listen("update-progress", (ev) => {
      const p = ev.payload || {};
      if (p.phase === "downloading") {
        const pct = p.total ? Math.min(100, Math.round((p.downloaded / p.total) * 100)) : null;
        $("#updSub").textContent = pct === null ? t("Đang tải…") : t("Đang tải… {n}%", { n: pct });
      } else if (p.phase === "installing") {
        $("#updSub").textContent = t("Đang cài đặt, app sẽ tự khởi động lại…");
      }
    });
  }

  async function doRefresh() {
    S.busy = "refresh";
    renderChrome();
    try { await refresh(); } catch (e) { S.err = tr(e); }
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
  $("#subNav").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-plat]");
    if (!b) return;
    S.platform = b.dataset.plat;
    S.page = "accounts";
    store.set("platform", S.platform);
    if (S.platform === "all" && S.scope !== "global") {
      // "Tất cả" không có công tắc phạm vi, nên luôn xem theo toàn máy
      S.scope = "global";
      store.set("scope", S.scope);
      await loadCurrent();
    } else if (S.platform === "k8s") {
      await loadCurrent();
    }
    render();
  });
  document.querySelectorAll(".chips button").forEach((b) =>
    b.addEventListener("click", () => {
      const inp = $("#" + b.parentElement.dataset.for);
      inp.value = b.dataset.v;
      inp.focus();
    })
  );
  document.querySelectorAll("#authSeg button").forEach((b) => b.addEventListener("click", () => setAuth(b.dataset.auth)));
  $("#convert").addEventListener("change", (e) => {
    S.convert = e.target.checked;
    store.set("convert", S.convert ? "1" : "0");
  });
  $("#pickRepo").addEventListener("click", pickRepo);
  $("#chkBtn").addEventListener("click", () => checkUpdate(true));
  $("#licenseText").textContent = window.APP_LICENSE || t("(Không đọc được nội dung LICENSE)");
  $("#aboutRepo").addEventListener("click", async () => {
    try { await invoke("open_release_page", { url: "https://github.com/namntdev03/manager-account" }); } catch (e) { toast(tr(e), "bad"); }
  });
  $("#copyLicense").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.APP_LICENSE || "");
      toast(t("Đã sao chép giấy phép"), "ok");
    } catch {
      toast(t("Không sao chép được, hãy bôi đen và copy thủ công."), "bad");
    }
  });
  async function loadSecurity() {
    try {
      const s = await invoke("get_security");
      $("#reqAuth").checked = !!s.require_auth;
    } catch {
      $("#reqAuth").checked = true;
    }
  }
  $("#reqAuth").addEventListener("change", async (e) => {
    const want = e.target.checked;
    try {
      await invoke("set_security", { requireAuth: want });
      toast(want ? t("Đã bật yêu cầu xác thực") : t("Đã tắt yêu cầu xác thực"), "ok");
    } catch (err) {
      e.target.checked = !want;
      toast(tr(err), "bad");
    }
  });
  loadSecurity();
  $("#autoUpd").addEventListener("change", (e) => {
    S.autoUpd = e.target.checked;
    store.set("autoUpd", S.autoUpd ? "1" : "0");
  });
  $("#updOpen").addEventListener("click", async () => {
    try { await invoke("open_release_page", { url: S.update.url }); } catch (e) { toast(tr(e), "bad"); }
  });
  $("#updNow").addEventListener("click", installUpdate);
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
  $("#refreshBtn").addEventListener("click", doRefresh);
  $("#cancel").addEventListener("click", () => dlg.close());
  $("#hostCancel").addEventListener("click", () => hostDlg.close());
  $("#hostForm").addEventListener("submit", submitHost);
  $("#hostCards").addEventListener("click", (e) => {
    const sel = e.target.closest(".sel");
    if (sel) return openSel(sel);
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "hadd") return openHostForm(null);
    const card = btn.closest(".host");
    const hid = card.dataset.hid;
    if (act === "connect") openTerm(hid, card.querySelector(".sel").dataset.value);
    else if (act === "files") openFtp(hid, card.querySelector(".sel").dataset.value);
    else if (act === "hedit") openHostForm(S.hosts.find((x) => x.id === hid));
    else if (act === "hdel") deleteHost(hid);
  });
  $("#termTabs").addEventListener("click", (e) => {
    if (e.target.closest("[data-new]")) return showTab(null);
    const dup = e.target.closest("[data-dup]");
    if (dup) {
      const x = S.terms.find((q) => q.key === dup.dataset.dup);
      return x && openTerm(x.hostId, x.accId);
    }
    const re = e.target.closest("[data-re]");
    if (re) return reconnectTerm(re.dataset.re);
    const c = e.target.closest("[data-close]");
    if (c) return closeTerm(c.dataset.close);
    const tab = e.target.closest("[data-tab]");
    if (tab) showTab(tab.dataset.tab || null);
  });
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

  // ───────── ngôn ngữ ─────────
  function syncLangSeg() {
    document.querySelectorAll("#langSeg button").forEach((b) => b.classList.toggle("on", b.dataset.lang === window.I18N.lang));
  }
  document.querySelectorAll("#langSeg button").forEach((b) =>
    b.addEventListener("click", async () => {
      window.I18N.setLang(b.dataset.lang);
      syncLangSeg();
      setUpdBusy(installing);
      try { await refresh(); } catch { render(); }
    })
  );

  // ───────── khởi động ─────────
  (async () => {
    window.I18N.initLang();
    syncLangSeg();
    if (S.platform === "all") S.scope = "global";
    try { S.home = await invoke("user_home"); } catch { /* bỏ qua */ }
    try { S.version = await T.app.getVersion(); } catch { /* bỏ qua */ }
    render();
    try {
      await refresh();
    } catch (e) {
      S.err = tr(e);
      render();
    }
    if (S.autoUpd) checkUpdate(false);
  })();
})();
