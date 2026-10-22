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
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
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
    deploy: { title: "Deployment", sub: "Cài đặt ứng dụng lên máy này hoặc một server" },
    backup: { title: "Kho lưu trữ", sub: "Sao lưu và khôi phục toàn bộ tài khoản khi đổi máy" },
    stats: { title: "Hiệu năng", sub: "RAM, CPU và tài nguyên mà app đang dùng" },
    settings: { title: "Cài đặt", sub: "Phiên bản, cập nhật và quyền riêng tư" },
    about: { title: "Giới thiệu", sub: "App này làm gì, chính sách dữ liệu và giấy phép" },
  }; // khoá tiếng Việt, dịch qua t() khi hiển thị

  // Nền tảng: thêm nền tảng mới chỉ cần thêm 1 dòng vào đây
  LOGOS.argocd = "M12.581 0c.436.037.871.1 1.299.186 1.679.383 3.121 1.213 4.382 2.365 1.161 1.06 1.917 2.372 2.335 3.881.089.321.216.56.586.624.205.035.238.245.239.43.003.646.002 1.294.002 1.94l-.002 1.21c-.001.356-.116.479-.466.474-.211-.003-.293.119-.344.291-.146.489-.33.966-.552 1.426-.818 1.682-2.084 2.938-3.688 3.87-.077.045-.155.088-.233.131-.252.137-.258.146-.155.415.114.299.358.529.664.625.269.096.553.134.827.21a.672.672 0 0 1 .236.094c-.066.082-.156.067-.231.082-.36.073-.713.184-1.086.17a1.275 1.275 0 0 1-.438-.064c-.114-.045-.152-.006-.176.109a5.354 5.354 0 0 0-.084.92c-.015.617-.071 1.23-.112 1.844-.042.598-.018.651.558.842.281.094.563.187.842.286.069.024.15.038.192.117-.04.057-.098.035-.146.035-.493.003-.985.005-1.478.001-.524-.005-.806-.282-.845-.803-.055-.762-.12-1.524-.182-2.286a.947.947 0 0 0-.026-.12c-.079.455-.065.879-.084 1.298-.023.528-.008 1.057-.007 1.584 0 .27.086.388.335.483.359.135.711.295 1.114.262.141-.012.276.062.402.129.032.017.073.033.069.073-.004.043-.049.047-.084.045-.657-.019-1.317.065-1.972-.028-.323-.046-.533-.236-.631-.552-.094-.303-.114-.617-.137-.93-.046-.626-.078-1.253-.116-1.88a.222.222 0 0 0-.061-.171.282.282 0 0 0-.031.193c-.002.956-.002 1.911-.001 2.866 0 .388.123.575.494.708.481.172.976.298 1.47.423.11.028.225.047.242.192h-1.852c-.051-.01-.103-.022-.155-.03-.701-.1-1.001-.372-1.143-1.042l-.067-.331-.226-1.103c-.069.12-.118.25-.144.386-.083.399-.151.802-.243 1.2-.113.493-.444.763-.932.857l-.33.063H8.558c.057-.171.216-.185.355-.221.476-.127.96-.223 1.417-.409a.603.603 0 0 0 .397-.521c.058-.435.002-.865-.013-1.296a1.528 1.528 0 0 0-.078-.315.405.405 0 0 0-.071.207c-.026.296-.049.591-.075.886-.038.432-.273.716-.679.81a1.702 1.702 0 0 1-.37.045c-.557.003-1.115-.001-1.673-.005-.048 0-.109.019-.148-.065.178-.103.377-.168.582-.187a5.67 5.67 0 0 0 .939-.193c.42-.114.522-.249.512-.687-.023-.931-.091-1.86-.069-2.791.004-.184.001-.368.001-.551a2.387 2.387 0 0 0-.05.385 40.299 40.299 0 0 1-.186 2.623c-.052.513-.296.748-.804.805-.446.051-.889.002-1.332-.02-.108-.006-.234.012-.339-.064.043-.066.106-.07.16-.087.362-.115.725-.224 1.086-.344.246-.081.35-.235.355-.492a2.241 2.241 0 0 0-.003-.232 45.315 45.315 0 0 1-.105-2.149 5.487 5.487 0 0 0-.035-.478c-.024-.188-.131-.287-.295-.258-.505.092-.99-.006-1.473-.139-.059-.016-.134-.007-.178-.088a.986.986 0 0 1 .285-.09c.255-.052.507-.121.753-.208.312-.112.564-.347.695-.651.089-.203.056-.317-.112-.398-1.418-.683-2.512-1.73-3.391-3.017a8.152 8.152 0 0 1-1.123-2.447c-.067-.246-.156-.3-.383-.26-.306.053-.401.006-.535-.273v-3.49c.144-.303.205-.341.534-.329.235.01.247-.004.309-.242.396-1.508 1.082-2.861 2.171-3.988C6.9 1.42 8.523.631 10.34.203c.456-.108.922-.15 1.387-.203h.854Zm7.974 8.948a7.34 7.34 0 0 0-.048-.938 8.353 8.353 0 0 0-.099-.65c-.598-2.964-2.344-5.02-5.051-6.268-1.553-.715-3.21-.835-4.878-.511-3.248.633-5.396 2.583-6.539 5.652-.436 1.173-.495 2.406-.37 3.65.087.935.339 1.846.745 2.694.585 1.213 1.444 2.207 2.477 3.058.343.286.719.528 1.121.719.235.111.247.105.245-.146.006-.16.003-.32-.009-.48-.125-1.02-.142-2.045-.169-3.069a.392.392 0 0 0-.184-.353c-.385-.268-.713-.592-.921-1.019-.474-.97-.372-2.361.813-3.215.136-.097.217-.19.198-.373a1.724 1.724 0 0 1 .031-.442c.177-1.187.748-2.138 1.722-2.84.68-.492 1.442-.772 2.286-.782.483-.007.953.11 1.414.244 1.609.467 2.846 2.07 2.845 3.697a.64.64 0 0 0 .268.565c.463.371.821.83.943 1.426.22 1.077-.083 1.982-.979 2.634-.266.194-.347.406-.333.698.002.047 0 .095-.002.142l-.062 1.439c-.025.586-.138 1.165-.117 1.754.008.223.006.226.201.128a7.46 7.46 0 0 0 2.393-1.903c1.32-1.577 2.074-3.372 2.059-5.511ZM9.117 12.102c1.489.021 2.443-1.578 1.716-2.879a1.937 1.937 0 0 0-1.699-.991c-1.094-.004-1.954.822-1.958 1.881-.005 1.148.813 1.985 1.941 1.989Zm5.794 0c1.101.002 1.935-.823 1.935-1.917 0-1.091-.846-1.949-1.92-1.947-1.064.003-1.94.866-1.943 1.915-.003 1.105.831 1.948 1.928 1.949Zm-1.472 1.937c-.208.128-.407.277-.63.384-.536.257-1.063.257-1.579-.048-.158-.094-.308-.201-.464-.298-.047-.028-.092-.103-.15-.062-.044.03-.01.1-.001.151.037.179.064.362.082.544.027.565.293.992.742 1.31a.984.984 0 0 0 .791.186c.565-.119 1.025-.614 1.124-1.218.043-.266.005-.544.109-.803a.133.133 0 0 0-.024-.146Zm-8.78-4.92c-.012-1.102.143-2.055.54-2.961.633-1.443 1.642-2.553 2.98-3.374a.378.378 0 0 1 .459.067c.06.06.036.118.01.178a1.09 1.09 0 0 1-.48.51c-1.079.639-1.829 1.571-2.357 2.688a6.325 6.325 0 0 0-.618 2.986c.055 1.309.439 2.516 1.213 3.588.088.104.148.23.173.365.01.08.059.168-.031.228a.312.312 0 0 1-.288.041.502.502 0 0 1-.234-.185c-.72-.979-1.193-2.056-1.331-3.273-.036-.326-.004-.653-.036-.858ZM8.94 2.34a.373.373 0 0 1 .378-.382c.211.001.409.226.416.473.004.138-.309.39-.476.386-.189-.005-.318-.2-.318-.477Zm-.465 7.48a.609.609 0 0 1 .586-.631c.38-.003.671.271.675.633.004.356-.27.622-.639.621-.38-.002-.621-.241-.622-.623Zm6.496.623c-.381-.002-.625-.255-.621-.646a.635.635 0 0 1 .596-.613.656.656 0 0 1 .669.643c.001.354-.275.618-.644.616Z";
  LOGOS.harbor = "m7.006 15.751 4.256 1.876.066.805-4.388-1.934.066-.747zm.304-3.435h-.605V11.21h.381V8.95h-.381v-.649l2.118-2.073v-.146c0-.11.09-.2.2-.2.11 0 .2.09.2.2v.146l2.12 2.073v.65h-.382v2.259h.381v1.106h-.514l.27 3.313L7.17 13.9l.14-1.583zm.39-1.106h.628v-.965c0-.383.313-.696.695-.696s.696.313.696.696v.965h.628V8.95H7.7v2.26zM6.89 17.05l-.066.747 4.618 2.035-.066-.805-4.486-1.977zm.23-2.6-.066.747 4.158 1.832-.065-.805-4.026-1.774zM24 12c0 6.617-5.383 12-12 12S0 18.617 0 12 5.383 0 12 0s12 5.383 12 12zm-2.43-.715a9.682 9.682 0 0 0-.223-1.523l-9.751.332 8.801-2.828-.019-.037A9.802 9.802 0 0 0 19.23 5.59l-7.786 4.03 5.712-5.941a9.675 9.675 0 0 0-5.14-1.474c-5.371 0-9.74 4.369-9.74 9.74 0 3.38 1.73 6.362 4.35 8.11l.151-1.704 4.715 2.078.102 1.246c.14.006.28.01.422.01 4.646 0 8.54-3.27 9.507-7.63l-10.08-3.497 10.128.727";
  LOGOS.postgres = "M23.5594 14.7228a.5269.5269 0 0 0-.0563-.1191c-.139-.2632-.4768-.3418-1.0074-.2321-1.6533.3411-2.2935.1312-2.5256-.0191 1.342-2.0482 2.445-4.522 3.0411-6.8297.2714-1.0507.7982-3.5237.1222-4.7316a1.5641 1.5641 0 0 0-.1509-.235C21.6931.9086 19.8007.0248 17.5099.0005c-1.4947-.0158-2.7705.3461-3.1161.4794a9.449 9.449 0 0 0-.5159-.0816 8.044 8.044 0 0 0-1.3114-.1278c-1.1822-.0184-2.2038.2642-3.0498.8406-.8573-.3211-4.7888-1.645-7.2219.0788C.9359 2.1526.3086 3.8733.4302 6.3043c.0409.818.5069 3.334 1.2423 5.7436.4598 1.5065.9387 2.7019 1.4334 3.582.553.9942 1.1259 1.5933 1.7143 1.7895.4474.1491 1.1327.1441 1.8581-.7279.8012-.9635 1.5903-1.8258 1.9446-2.2069.4351.2355.9064.3625 1.39.3772a.0569.0569 0 0 0 .0004.0041 11.0312 11.0312 0 0 0-.2472.3054c-.3389.4302-.4094.5197-1.5002.7443-.3102.064-1.1344.2339-1.1464.8115-.0025.1224.0329.2309.0919.3268.2269.4231.9216.6097 1.015.6331 1.3345.3335 2.5044.092 3.3714-.6787-.017 2.231.0775 4.4174.3454 5.0874.2212.5529.7618 1.9045 2.4692 1.9043.2505 0 .5263-.0291.8296-.0941 1.7819-.3821 2.5557-1.1696 2.855-2.9059.1503-.8707.4016-2.8753.5388-4.1012.0169-.0703.0357-.1207.057-.1362.0007-.0005.0697-.0471.4272.0307a.3673.3673 0 0 0 .0443.0068l.2539.0223.0149.001c.8468.0384 1.9114-.1426 2.5312-.4308.6438-.2988 1.8057-1.0323 1.5951-1.6698zM2.371 11.8765c-.7435-2.4358-1.1779-4.8851-1.2123-5.5719-.1086-2.1714.4171-3.6829 1.5623-4.4927 1.8367-1.2986 4.8398-.5408 6.108-.13-.0032.0032-.0066.0061-.0098.0094-2.0238 2.044-1.9758 5.536-1.9708 5.7495-.0002.0823.0066.1989.0162.3593.0348.5873.0996 1.6804-.0735 2.9184-.1609 1.1504.1937 2.2764.9728 3.0892.0806.0841.1648.1631.2518.2374-.3468.3714-1.1004 1.1926-1.9025 2.1576-.5677.6825-.9597.5517-1.0886.5087-.3919-.1307-.813-.5871-1.2381-1.3223-.4796-.839-.9635-2.0317-1.4155-3.5126zm6.0072 5.0871c-.1711-.0428-.3271-.1132-.4322-.1772.0889-.0394.2374-.0902.4833-.1409 1.2833-.2641 1.4815-.4506 1.9143-1.0002.0992-.126.2116-.2687.3673-.4426a.3549.3549 0 0 0 .0737-.1298c.1708-.1513.2724-.1099.4369-.0417.156.0646.3078.26.3695.4752.0291.1016.0619.2945-.0452.4444-.9043 1.2658-2.2216 1.2494-3.1676 1.0128zm2.094-3.988-.0525.141c-.133.3566-.2567.6881-.3334 1.003-.6674-.0021-1.3168-.2872-1.8105-.8024-.6279-.6551-.9131-1.5664-.7825-2.5004.1828-1.3079.1153-2.4468.079-3.0586-.005-.0857-.0095-.1607-.0122-.2199.2957-.2621 1.6659-.9962 2.6429-.7724.4459.1022.7176.4057.8305.928.5846 2.7038.0774 3.8307-.3302 4.7363-.084.1866-.1633.3629-.2311.5454zm7.3637 4.5725c-.0169.1768-.0358.376-.0618.5959l-.146.4383a.3547.3547 0 0 0-.0182.1077c-.0059.4747-.054.6489-.115.8693-.0634.2292-.1353.4891-.1794 1.0575-.11 1.4143-.8782 2.2267-2.4172 2.5565-1.5155.3251-1.7843-.4968-2.0212-1.2217a6.5824 6.5824 0 0 0-.0769-.2266c-.2154-.5858-.1911-1.4119-.1574-2.5551.0165-.5612-.0249-1.9013-.3302-2.6462.0044-.2932.0106-.5909.019-.8918a.3529.3529 0 0 0-.0153-.1126 1.4927 1.4927 0 0 0-.0439-.208c-.1226-.4283-.4213-.7866-.7797-.9351-.1424-.059-.4038-.1672-.7178-.0869.067-.276.1831-.5875.309-.9249l.0529-.142c.0595-.16.134-.3257.213-.5012.4265-.9476 1.0106-2.2453.3766-5.1772-.2374-1.0981-1.0304-1.6343-2.2324-1.5098-.7207.0746-1.3799.3654-1.7088.5321a5.6716 5.6716 0 0 0-.1958.1041c.0918-1.1064.4386-3.1741 1.7357-4.4823a4.0306 4.0306 0 0 1 .3033-.276.3532.3532 0 0 0 .1447-.0644c.7524-.5706 1.6945-.8506 2.802-.8325.4091.0067.8017.0339 1.1742.081 1.939.3544 3.2439 1.4468 4.0359 2.3827.8143.9623 1.2552 1.9315 1.4312 2.4543-1.3232-.1346-2.2234.1268-2.6797.779-.9926 1.4189.543 4.1729 1.2811 5.4964.1353.2426.2522.4522.2889.5413.2403.5825.5515.9713.7787 1.2552.0696.087.1372.1714.1885.245-.4008.1155-1.1208.3825-1.0552 1.717-.0123.1563-.0423.4469-.0834.8148-.0461.2077-.0702.4603-.0994.7662zm.8905-1.6211c-.0405-.8316.2691-.9185.5967-1.0105a2.8566 2.8566 0 0 0 .135-.0406 1.202 1.202 0 0 0 .1342.103c.5703.3765 1.5823.4213 3.0068.1344-.2016.1769-.5189.3994-.9533.6011-.4098.1903-1.0957.333-1.7473.3636-.7197.0336-1.0859-.0807-1.1721-.151zm.5695-9.2712c-.0059.3508-.0542.6692-.1054 1.0017-.055.3576-.112.7274-.1264 1.1762-.0142.4368.0404.8909.0932 1.3301.1066.887.216 1.8003-.2075 2.7014a3.5272 3.5272 0 0 1-.1876-.3856c-.0527-.1276-.1669-.3326-.3251-.6162-.6156-1.1041-2.0574-3.6896-1.3193-4.7446.3795-.5427 1.3408-.5661 2.1781-.463zm.2284 7.0137a12.3762 12.3762 0 0 0-.0853-.1074l-.0355-.0444c.7262-1.1995.5842-2.3862.4578-3.4385-.0519-.4318-.1009-.8396-.0885-1.2226.0129-.4061.0666-.7543.1185-1.0911.0639-.415.1288-.8443.1109-1.3505.0134-.0531.0188-.1158.0118-.1902-.0457-.4855-.5999-1.938-1.7294-3.253-.6076-.7073-1.4896-1.4972-2.6889-2.0395.5251-.1066 1.2328-.2035 2.0244-.1859 2.0515.0456 3.6746.8135 4.8242 2.2824a.908.908 0 0 1 .0667.1002c.7231 1.3556-.2762 6.2751-2.9867 10.5405zm-8.8166-6.1162c-.025.1794-.3089.4225-.6211.4225a.5821.5821 0 0 1-.0809-.0056c-.1873-.026-.3765-.144-.5059-.3156-.0458-.0605-.1203-.178-.1055-.2844.0055-.0401.0261-.0985.0925-.1488.1182-.0894.3518-.1226.6096-.0867.3163.0441.6426.1938.6113.4186zm7.9305-.4114c.0111.0792-.049.201-.1531.3102-.0683.0717-.212.1961-.4079.2232a.5456.5456 0 0 1-.075.0052c-.2935 0-.5414-.2344-.5607-.3717-.024-.1765.2641-.3106.5611-.352.297-.0414.6111.0088.6356.1851z";
  LOGOS.redis = "M22.71 13.145c-1.66 2.092-3.452 4.483-7.038 4.483-3.203 0-4.397-2.825-4.48-5.12.701 1.484 2.073 2.685 4.214 2.63 4.117-.133 6.94-3.852 6.94-7.239 0-4.05-3.022-6.972-8.268-6.972-3.752 0-8.4 1.428-11.455 3.685C2.59 6.937 3.885 9.958 4.35 9.626c2.648-1.904 4.748-3.13 6.784-3.744C8.12 9.244.886 17.05 0 18.425c.1 1.261 1.66 4.648 2.424 4.648.232 0 .431-.133.664-.365a100.49 100.49 0 0 0 5.54-6.765c.222 3.104 1.748 6.898 6.014 6.898 3.819 0 7.604-2.756 9.33-8.965.2-.764-.73-1.361-1.261-.73zm-4.349-5.013c0 1.959-1.926 2.922-3.685 2.922-.941 0-1.664-.247-2.235-.568 1.051-1.592 2.092-3.225 3.21-4.973 1.972.334 2.71 1.43 2.71 2.619z";
  LOGOS.nginx = "M12 0L1.605 6v12L12 24l10.395-6V6L12 0zm6 16.59c0 .705-.646 1.29-1.529 1.29-.631 0-1.351-.255-1.801-.81l-6-7.141v6.66c0 .721-.57 1.29-1.274 1.29H7.32c-.721 0-1.29-.6-1.29-1.29V7.41c0-.705.63-1.29 1.5-1.29.646 0 1.38.255 1.83.81l5.97 7.141V7.41c0-.721.6-1.29 1.29-1.29h.075c.72 0 1.29.6 1.29 1.29v9.18H18z";
  LOGOS.docker = "M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z";
  LOGOS.k8s = "M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 0 1-2.075-2.597l2.578-.437.004.005a.44.44 0 0 1 .484.606zm-.833-2.129a.44.44 0 0 0 .173-.756l.002-.011L7.585 9.7a5.143 5.143 0 0 0-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 0 0 .699-.337l.01-.005.15-2.62a5.144 5.144 0 0 0-3.01 1.442l2.147 1.523.004-.002zm.76 2.75l.723.349.722-.347.18-.78-.5-.623h-.804l-.5.623.179.779zm1.5-3.095a.44.44 0 0 0 .7.336l.008.003 2.134-1.513a5.188 5.188 0 0 0-2.992-1.442l.148 2.615.002.001zm10.876 5.97l-5.773 7.181a1.6 1.6 0 0 1-1.248.594l-9.261.003a1.6 1.6 0 0 1-1.247-.596l-5.776-7.18a1.583 1.583 0 0 1-.307-1.34L2.1 5.573c.108-.47.425-.864.863-1.073L11.305.513a1.606 1.606 0 0 1 1.385 0l8.345 3.985c.438.209.755.604.863 1.073l2.062 8.955c.108.47-.005.963-.308 1.34zm-3.289-2.057c-.042-.01-.103-.026-.145-.034-.174-.033-.315-.025-.479-.038-.35-.037-.638-.067-.895-.148-.105-.04-.18-.165-.216-.216l-.201-.059a6.45 6.45 0 0 0-.105-2.332 6.465 6.465 0 0 0-.936-2.163c.052-.047.15-.133.177-.159.008-.09.001-.183.094-.282.197-.185.444-.338.743-.522.142-.084.273-.137.415-.242.032-.024.076-.062.11-.089.24-.191.295-.52.123-.736-.172-.216-.506-.236-.745-.045-.034.027-.08.062-.111.088-.134.116-.217.23-.33.35-.246.25-.45.458-.673.609-.097.056-.239.037-.303.033l-.19.135a6.545 6.545 0 0 0-4.146-2.003l-.012-.223c-.065-.062-.143-.115-.163-.25-.022-.268.015-.557.057-.905.023-.163.061-.298.068-.475.001-.04-.001-.099-.001-.142 0-.306-.224-.555-.5-.555-.275 0-.499.249-.499.555l.001.014c0 .041-.002.092 0 .128.006.177.044.312.067.475.042.348.078.637.056.906a.545.545 0 0 1-.162.258l-.012.211a6.424 6.424 0 0 0-4.166 2.003 8.373 8.373 0 0 1-.18-.128c-.09.012-.18.04-.297-.029-.223-.15-.427-.358-.673-.608-.113-.12-.195-.234-.329-.349-.03-.026-.077-.062-.111-.088a.594.594 0 0 0-.348-.132.481.481 0 0 0-.398.176c-.172.216-.117.546.123.737l.007.005.104.083c.142.105.272.159.414.242.299.185.546.338.743.522.076.082.09.226.1.288l.16.143a6.462 6.462 0 0 0-1.02 4.506l-.208.06c-.055.072-.133.184-.215.217-.257.081-.546.11-.895.147-.164.014-.305.006-.48.039-.037.007-.09.02-.133.03l-.004.002-.007.002c-.295.071-.484.342-.423.608.061.267.349.429.645.365l.007-.001.01-.003.129-.029c.17-.046.294-.113.448-.172.33-.118.604-.217.87-.256.112-.009.23.069.288.101l.217-.037a6.5 6.5 0 0 0 2.88 3.596l-.09.218c.033.084.069.199.044.282-.097.252-.263.517-.452.813-.091.136-.185.242-.268.399-.02.037-.045.095-.064.134-.128.275-.034.591.213.71.248.12.556-.007.69-.282v-.002c.02-.039.046-.09.062-.127.07-.162.094-.301.144-.458.132-.332.205-.68.387-.897.05-.06.13-.082.215-.105l.113-.205a6.453 6.453 0 0 0 4.609.012l.106.192c.086.028.18.042.256.155.136.232.229.507.342.84.05.156.074.295.145.457.016.037.043.09.062.129.133.276.442.402.69.282.247-.118.341-.435.213-.71-.02-.039-.045-.096-.065-.134-.083-.156-.177-.261-.268-.398-.19-.296-.346-.541-.443-.793-.04-.13.007-.21.038-.294-.018-.022-.059-.144-.083-.202a6.499 6.499 0 0 0 2.88-3.622c.064.01.176.03.213.038.075-.05.144-.114.28-.104.266.039.54.138.87.256.154.06.277.128.448.173.036.01.088.019.13.028l.009.003.007.001c.297.064.584-.098.645-.365.06-.266-.128-.537-.423-.608zM16.4 9.701l-1.95 1.746v.005a.44.44 0 0 0 .173.757l.003.01 2.526.728a5.199 5.199 0 0 0-.108-1.674A5.208 5.208 0 0 0 16.4 9.7zm-4.013 5.325a.437.437 0 0 0-.404-.232.44.44 0 0 0-.372.233h-.002l-1.268 2.292a5.164 5.164 0 0 0 3.326.003l-1.27-2.296h-.01zm1.888-1.293a.44.44 0 0 0-.27.036.44.44 0 0 0-.214.572l-.003.004 1.01 2.438a5.15 5.15 0 0 0 2.081-2.615l-2.6-.44-.004.005z";
  LOGOS.npm = "M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z";
  const NPM_PLAT = { id: "npm", name: "npm", host: "registry.npmjs.org" };
  const SSH_PLAT = { id: "ssh", name: "SSH", host: "ssh" };
  const K8S_PLAT = { id: "k8s", name: "Kubernetes", host: "kubernetes" };
  const ARGOCD_PLAT = { id: "argocd", name: "ArgoCD", host: "argocd" };
  const HARBOR_PLAT = { id: "harbor", name: "Harbor", host: "harbor" };
  const DOCKER_PLAT = { id: "docker", name: "Docker", host: "docker" };
  const SVC_KINDS = ["k8s", "argocd", "harbor", "docker"];
  const LOGIN_KINDS = ["harbor", "docker"]; // đăng nhập bằng username + mật khẩu/token
  const URL_KINDS = ["argocd", "harbor", "docker"]; // loại tài khoản không liên quan repo, có nhãn môi trường
  const ENV_LABEL = { prod: "PRODUCTION", staging: "STAGING", dev: "DEV" };
  const PLATFORMS = [
    { id: "github", name: "GitHub", host: "github.com", test: (h) => h.includes("github") },
    { id: "gitlab", name: "GitLab", host: "gitlab.com", test: (h) => h.includes("gitlab") },
    { id: "bitbucket", name: "Bitbucket", host: "bitbucket.org", test: (h) => h.includes("bitbucket") },
  ];
  const platOf = (host) =>
    PLATFORMS.find((p) => p.test(host)) || { id: "host:" + host, name: host, host };
  // nền tảng của một tài khoản (npm nhóm riêng, không theo host)
  const platOfP = (pr) => (pr.kind === "npm" ? NPM_PLAT : pr.kind === "ssh" ? SSH_PLAT : pr.kind === "k8s" ? K8S_PLAT : pr.kind === "argocd" ? ARGOCD_PLAT : pr.kind === "harbor" ? HARBOR_PLAT : pr.kind === "docker" ? DOCKER_PLAT : platOf(pr.host));

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
    const sc = SVC_KINDS.includes(S.platform) ? "global" : S.scope; // Kubernetes / ArgoCD / Harbor không theo repo
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
    list.push({ ...NPM_PLAT }, { ...K8S_PLAT }, { ...ARGOCD_PLAT }, { ...HARBOR_PLAT }, { ...DOCKER_PLAT }, { ...SSH_PLAT });
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
    const isSvc = URL_KINDS.includes(p.kind);
    const isSsh = p.auth === "ssh";
    const sshDetail = [p.ssh_key_path, p.has_token ? t("mật khẩu đã lưu") : ""].filter(Boolean).join(" · ") || t("Không có key / mật khẩu (nhập khi kết nối)");
    const detail = isK8s ? p.host : isSvc ? p.registry : isNpm ? p.registry : isSshAcc ? sshDetail : isSsh ? p.ssh_key_path : "user: " + p.login;
    const subLine = isSvc
      ? esc(LOGIN_KINDS.includes(p.kind) ? p.login : t("Token riêng của app"))
      : isK8s
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
            : `<span class="badge soft">${isK8s ? "kubeconfig" : isSvc ? (p.kind === "argocd" ? "Token" : p.kind === "harbor" ? t("Mật khẩu / robot") : "Docker") : isNpm ? "npm" : isSshAcc ? (p.ssh_key_path && p.has_token ? t("Key + mật khẩu") : p.has_token ? t("Mật khẩu") : "SSH key") : isSsh ? "SSH key" : "Token"}</span>`}
        </div>
        <div class="acc-name">${esc(p.name)}${(isK8s || isSvc) && p.env ? ` <span class="env env-${esc(p.env)}">${ENV_LABEL[p.env] || ""}</span>` : ""}</div>
        <div class="acc-sub">${subLine}</div>
        <div class="acc-detail" title="${esc(detail)}">${isK8s || isSvc ? platIcon(platOfP(p)) : icon(isSsh || isSshAcc ? "key" : "globe")}<span>${esc(detail)}</span></div>
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
      if (hid.startsWith("dep_")) renderDeploy();
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
    box.hidden = S.page !== "accounts" || S.platform === "npm" || S.platform === "ssh" || SVC_KINDS.includes(S.platform) || S.platform === "all";
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
      else if (dep.id === id && dep.term) dep.term.write(bytes);
      else (pendingData[id] = pendingData[id] || []).push(bytes);
    });
    T.event.listen("term-exit", (ev) => {
      const x = S.terms.find((q) => q.id === (ev.payload || {}).id);
      if (!x && dep.id && dep.id === (ev.payload || {}).id) {
        dep.ended = true;
        dep.term.write(`\r\n\x1b[90m[${t("Đã kết thúc. Bạn có thể đóng cửa sổ này.")}]\x1b[0m\r\n`);
        depDetect(true);
        return;
      }
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
  // ───────── Deployment: cài ứng dụng lên máy này hoặc một SSH host ─────────
  const dep = { app: null, ver: "", term: null, fit: null, id: null, ended: false };
  const depTarget = () => $('[data-sel="dep_target"]').dataset.value || "";
  const depAcc = () => $('[data-sel="dep_acc"]').dataset.value || "";
  const depHost = () => S.hosts.find((h) => h.id === depTarget());
  // trạng thái cài đặt trên máy đích: { key, loading, err, ver: { docker: "29.7.2" | null, ... } }
  const depSt = { key: null, loading: false, err: "", ver: {} };
  const depVerOf = (line) => {
    const m = /(\d+\.\d+(?:\.\d+)?)/.exec(line || "");
    return m ? m[1] : "";
  };
  async function depDetect(force) {
    const key = depTarget() + "|" + (depTarget() ? depAcc() : "");
    if (!force && depSt.key === key) return;
    depSt.key = key;
    depSt.loading = true;
    depSt.err = "";
    depSt.ver = {};
    renderDepGrid();
    try {
      const out = await invoke("deploy_detect", { hostId: depTarget() || null, accountId: depTarget() ? depAcc() || null : null });
      if (depSt.key !== key) return; // người dùng đã đổi máy đích
      out.split("\n").forEach((l) => {
        const i = l.indexOf("=");
        if (i > 0) depSt.ver[l.slice(0, i).trim()] = depVerOf(l.slice(i + 1));
      });
    } catch (e) {
      if (depSt.key === key) depSt.err = tr(e);
    }
    if (depSt.key === key) {
      depSt.loading = false;
      renderDepGrid();
    }
  }
  function depBadge(id) {
    if (depSt.loading) return `<span class="dep-st">${t("Đang kiểm tra…")}</span>`;
    if (depSt.err) return `<span class="dep-st">${t("Chưa kiểm tra được")}</span>`;
    const v = depSt.ver[id];
    return v
      ? `<span class="dep-st ok"><i class="st live"></i>${t("Đã cài")} · ${esc(v)}</span>`
      : `<span class="dep-st">${t("Chưa cài")}</span>`;
  }
  function renderDepGrid() {
    const apps = DEPLOY.APPS.map(
      (a) => `<button type="button" class="dep-app" data-app="${esc(a.id)}">
        <span class="dep-ic">${platIcon({ id: a.logo })}</span><b>${esc(a.name)}</b>${depBadge(a.id)}<span class="d">${esc(t(a.desc))}</span></button>`
    );
    const soon = DEPLOY.SOON.map(
      (a) => `<div class="dep-app soon"><span class="dep-ic">${a.logo ? platIcon({ id: a.logo }) : icon("server")}</span><b>${esc(a.name)}</b><span class="tag-soon">${t("Sắp có")}</span></div>`
    );
    $("#depGrid").innerHTML = apps.concat(soon).join("");
    $("#depErrNote").hidden = !depSt.err;
    $("#depErrNote").textContent = depSt.err;
  }
  function renderDeploy() {
    closeSel();
    const accs = S.profiles.filter((p) => p.kind === "ssh");
    const tOpts = [{ v: "", label: t("Máy này (local)"), sub: "" }, ...S.hosts.map((h) => ({ v: h.id, label: h.name, sub: h.address }))];
    const aOpts = [{ v: "", label: t("Không dùng tài khoản"), sub: "" }, ...accs.map((a) => ({ v: a.id, label: a.name, sub: a.login }))];
    selOpts.dep_target = tOpts;
    selOpts.dep_acc = aOpts;
    const fill = (name, opts) => {
      const b = $(`[data-sel="${name}"]`);
      const cur = opts.find((o) => o.v === (b.dataset.value || store.get("hostAcc:" + name, ""))) || opts[0];
      b.dataset.value = cur.v;
      b.querySelector(".sel-v").innerHTML = `${esc(cur.label)}${cur.sub ? ` <em>${esc(cur.sub)}</em>` : ""}`;
    };
    fill("dep_target", tOpts);
    fill("dep_acc", aOpts);
    const remote = !!depTarget();
    $("#depAccBox").hidden = !remote;
    $("#depNote").textContent = remote
      ? t("Cài trên server qua SSH. Script chạy trong một terminal ngay trong app, bạn thấy từng dòng và có thể gõ mật khẩu sudo.")
      : /Win/i.test(navigator.platform)
        ? t("Windows chưa hỗ trợ cài trực tiếp trên máy này. Hãy chọn một SSH host (Linux).")
        : t("Cài trực tiếp lên máy đang dùng app (macOS dùng Homebrew, Linux dùng apt/dnf).");
    renderDepGrid();
    depDetect(false);
  }
  $("#page-deploy").addEventListener("click", (e) => {
    const sel = e.target.closest(".sel");
    if (sel) return openSel(sel);
    if (e.target.closest("#depRecheck")) return depDetect(true);
    const b = e.target.closest("[data-app]");
    if (b) openDepDlg(b.dataset.app);
  });
  function depRefreshScript() {
    $("#depScript").value = DEPLOY.script(dep.app.id, dep.ver);
    document.querySelectorAll("#depVer button").forEach((b) => b.classList.toggle("on", b.dataset.v === dep.ver));
  }
  function depCheckConfirm() {
    const h = depHost();
    $("#depGo").disabled = !!h && $("#depConfirm").value.trim() !== h.name;
  }
  function openDepDlg(appId) {
    dep.app = DEPLOY.APPS.find((x) => x.id === appId);
    dep.ver = dep.app.versions[0].v;
    const h = depHost();
    $("#depTitle").textContent = t("Cài {n}", { n: dep.app.name });
    $("#depSub").textContent = h ? t("Lên server {h}", { h: `${h.name} (${h.address})` }) : t("Lên máy này (local)");
    $("#depVer").innerHTML = dep.app.versions.map((v) => `<button type="button" data-v="${esc(v.v)}">${esc(t(v.label))}</button>`).join("");
    $("#depConfirm").value = "";
    $("#depConfirmLbl").hidden = !h;
    if (h) $("#depConfirmTxt").textContent = t("Gõ tên server “{h}” để xác nhận", { h: h.name });
    $("#depErr").hidden = true;
    const cur = depSt.ver[dep.app.id];
    $("#depInstalled").hidden = !cur;
    if (cur) $("#depInstalled").textContent = t("Máy này đã cài {n} phiên bản {v}. Cài tiếp có thể nâng cấp hoặc ghi đè cấu hình repo.", { n: dep.app.name, v: cur });
    depRefreshScript();
    depCheckConfirm();
    $("#depDlg").showModal();
  }
  $("#depVer").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    dep.ver = b.dataset.v;
    depRefreshScript();
  });
  $("#depConfirm").addEventListener("input", depCheckConfirm);
  $("#depCancel").addEventListener("click", () => $("#depDlg").close());
  $("#depGo").addEventListener("click", async () => {
    const h = depHost();
    const name = dep.app.name;
    $("#depDlg").close();
    $("#depRunTitle").textContent = t("Đang cài {n}", { n: name });
    $("#depRunSub").textContent = h ? t("Trên server {h}", { h: `${h.name} (${h.address})` }) : t("Trên máy này (local)");
    $("#depRun").showModal();
    if (dep.term) { dep.term.dispose(); dep.term = null; }
    $("#depTerm").innerHTML = "";
    dep.term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: "#0b0b0f", foreground: "#e5e7eb", cursor: "#ffffff", selectionBackground: "#374151" },
    });
    dep.fit = new FitAddon.FitAddon();
    dep.term.loadAddon(dep.fit);
    dep.term.open($("#depTerm"));
    try { dep.fit.fit(); } catch { /* chưa hiển thị */ }
    dep.term.onData((d) => { if (dep.id && !dep.ended) invoke("term_write", { id: dep.id, data: d }).catch(() => {}); });
    dep.term.onResize(({ cols, rows }) => { if (dep.id && !dep.ended) invoke("term_resize", { id: dep.id, cols, rows }).catch(() => {}); });
    dep.ended = false;
    dep.id = null;
    try {
      dep.id = await invoke("deploy_run", {
        hostId: h ? h.id : null,
        accountId: h ? depAcc() || null : null,
        script: DEPLOY.script(dep.app.id, dep.ver),
        cols: dep.term.cols,
        rows: dep.term.rows,
      });
      (pendingData[dep.id] || []).forEach((b) => dep.term.write(b));
      delete pendingData[dep.id];
      dep.term.focus();
    } catch (e) {
      dep.term.write(`\r\n\x1b[31m${tr(e)}\x1b[0m\r\n`);
      dep.ended = true;
    }
  });
  $("#depRunClose").addEventListener("click", async () => {
    if (dep.id && !dep.ended) {
      let yes = false;
      try {
        yes = await dialogApi.ask(t("Việc cài đặt vẫn đang chạy. Đóng cửa sổ sẽ dừng nó giữa chừng. Tiếp tục đóng?"), { title: t("Xác nhận"), kind: "warning" });
      } catch {
        yes = window.confirm(t("Việc cài đặt vẫn đang chạy. Đóng cửa sổ sẽ dừng nó giữa chừng. Tiếp tục đóng?"));
      }
      if (!yes) return;
      await invoke("term_close", { id: dep.id }).catch(() => {});
    }
    $("#depRun").close();
  });
  $("#depRun").addEventListener("cancel", (e) => { e.preventDefault(); $("#depRunClose").click(); });

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
    const topic = S.page === "hosts" ? "hosts" : S.page === "accounts" && S.platform !== "all" && !SVC_KINDS.includes(S.platform) ? (S.platform === "npm" ? "npm" : S.platform === "ssh" ? "ssh" : "git") : null;
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
    const noScope = S.platform === "ssh" || SVC_KINDS.includes(S.platform) || S.platform === "all"; // SSH server không liên quan repo; "Tất cả" chỉ để xem
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
    $("#page-deploy").hidden = S.page !== "deploy";
    if (S.page === "deploy") renderDeploy();
    $("#page-stats").hidden = S.page !== "stats";
    $("#page-settings").hidden = S.page !== "settings";
    if (S.page === "stats") { renderStats(); pollStats(); }
    $("#page-about").hidden = S.page !== "about";
    const curPlat = platformList().find((p) => p.id === S.platform);
    $("#pageTitle").textContent =
      S.page === "accounts" && curPlat ? `${t(PAGES.accounts.title)} · ${curPlat.name}` : t(PAGES[S.page].title);
    $("#pageSub").textContent = t(PAGES[S.page].sub);
    $("#scopeSeg").hidden = S.page !== "accounts" || noScope;
    $("#refreshBtn").hidden = S.page === "stats" || S.page === "deploy";
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
    const k8s = SVC_KINDS.includes(p.kind);
    if (!k8s && S.scope === "repo" && !S.repo) return toast(t("Hãy chọn thư mục repo trước."), "bad");
    if (k8s && p.env === "prod") {
      let yes = false;
      try {
        yes = await dialogApi.ask(
          t(p.kind === "k8s" ? "“{n}” là cluster PRODUCTION. Mọi lệnh kubectl từ giờ sẽ chạy trên cluster này. Tiếp tục?" : "“{n}” được đánh dấu PRODUCTION. Tiếp tục?", { n: p.name }),
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
    const svc = URL_KINDS.includes(k);
    $("#k8sFields").hidden = !k8s;
    $("#authSet").hidden = k8s;
    $("#envLabel").hidden = !(k8s || svc);
    $("#svcUrlLabel").hidden = !svc;
    $("#svcFields").hidden = !svc;
    $("#hintArgo").hidden = k !== "argocd";
    $("#hintHarbor").hidden = k !== "harbor";
    $("#hintDocker").hidden = k !== "docker";
    $("#f_svcurl").placeholder = k === "harbor" ? "https://harbor.example.com" : k === "docker" ? "https://docker.io" : "https://argocd.example.com";
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
    $("#loginLabel").hidden = !(git || LOGIN_KINDS.includes(k));
    // tạo/xem public key chỉ dành cho tài khoản Git; tài khoản SSH giữ nguyên như cũ
    $("#genKey").parentElement.hidden = !git;
    if (!git) $("#pubBox").hidden = true;
    $("#gitIdent").hidden = !git;
    $("#authLegend").textContent =
      k === "harbor" ? t("Đăng nhập Harbor") : k === "docker" ? t("Đăng nhập registry") : k === "argocd" ? t("Đăng nhập ArgoCD") : npm ? t("Token truy cập (npm access token)") : ssh ? t("Key SSH (tuỳ chọn)") : t("Cách đăng nhập");
    $("#tokenLbl").textContent = k === "docker" ? t("Mật khẩu / access token") : k === "harbor" ? t("Mật khẩu / robot secret") : k === "argocd" ? t("Auth token của ArgoCD") : npm ? "Token" : "Personal Access Token";
    $("#tokenHint").hidden = npm || svc;
    if (!($("#f_token").placeholder || "").startsWith("Đã") && !($("#f_token").placeholder || "").startsWith("Saved"))
      $("#f_token").placeholder = npm ? "npm_…" : svc ? "" : "ghp_… / glpat-…";
    if (npm || svc) setAuth("token");
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
    $("#f_svcurl").value = p && URL_KINDS.includes(p.kind) ? p.registry : "";
    $("#f_insecure").checked = !!p?.insecure;
    $("#f_kube").value = "";
    $("#f_kube").placeholder = p?.kind === "k8s" ? t("Đã lưu (mã hoá) — để trống nếu giữ nguyên") : "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://…";
    $("#viewKube").textContent = t("Xem kubeconfig đã lưu");
    $("#viewKube").hidden = !(p && p.kind === "k8s");
    setKind(p ? p.kind || "git" : S.platform === "npm" ? "npm" : S.platform === "ssh" ? "ssh" : S.platform === "k8s" ? "k8s" : URL_KINDS.includes(S.platform) ? S.platform : "git");
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
        registry: URL_KINDS.includes(S.kind) ? $("#f_svcurl").value : $("#f_registry").value,
        insecure: $("#f_insecure").checked,
        scope: $("#f_scope").value,
        kubeconfig: S.kind === "k8s" ? $("#f_kube").value : "",
        env: SVC_KINDS.includes(S.kind) ? S.env || "" : "",
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
    } else if (SVC_KINDS.includes(S.platform)) {
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
