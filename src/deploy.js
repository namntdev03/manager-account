// Danh mục cài đặt cho menu Deployment.
// Mỗi ứng dụng là một script shell hiển thị đầy đủ cho người dùng xem trước khi chạy.
// Quy ước: trong script không dùng dấu backtick và không dùng dạng ${...} (vì được viết trong template JS).
(function () {
  const PRE = String.raw`set -eu
export DEBIAN_FRONTEND=noninteractive
echo "=== Kiểm tra trước khi cài ==="
echo "Máy: $(hostname) | User: $(whoami) | Hệ điều hành: $(uname -sr)"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
case "$(uname -s)" in
  Darwin) PM=brew ;;
  Linux)
    if command -v apt-get >/dev/null 2>&1; then PM=apt
    elif command -v dnf >/dev/null 2>&1; then PM=dnf
    elif command -v yum >/dev/null 2>&1; then PM=yum
    else echo "Không nhận diện được trình quản lý gói (apt / dnf / yum)."; exit 1; fi ;;
  *) echo "Hệ điều hành này chưa được hỗ trợ."; exit 1 ;;
esac
echo "Trình quản lý gói: $PM"
if [ "$PM" = brew ]; then
  command -v brew >/dev/null 2>&1 || { echo "Cần cài Homebrew trước: https://brew.sh"; exit 1; }
elif [ -n "$SUDO" ]; then
  command -v sudo >/dev/null 2>&1 || { echo "Cần quyền root hoặc sudo."; exit 1; }
fi
df -h / | tail -1 | awk '{print "Ổ đĩa /: còn " $4 " (" $5 " đã dùng)"}'
port_check() {
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$1$"; then
    echo "CẢNH BÁO: cổng $1 đang được một tiến trình khác sử dụng."
  fi
}
confirm() {
  printf "Tiếp tục cài đặt? [y/N] "
  read -r ans
  case "$ans" in y|Y) ;; *) echo "Đã huỷ, chưa thay đổi gì."; exit 1 ;; esac
}
echo
`;

  const DOCKER = String.raw`DV="@VERSION@"
if command -v docker >/dev/null 2>&1; then echo "Docker đã được cài: $(docker --version)"; fi
confirm
if [ "$PM" = brew ]; then
  echo "macOS: cài Docker Desktop bằng Homebrew (không chọn được phiên bản)."
  brew install --cask docker
else
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  if [ -n "$DV" ]; then
    $SUDO env VERSION="$DV" sh /tmp/get-docker.sh
  else
    $SUDO sh /tmp/get-docker.sh
  fi
  rm -f /tmp/get-docker.sh
  $SUDO systemctl enable --now docker || true
  if [ -n "$SUDO" ]; then
    $SUDO usermod -aG docker "$(id -un)" || true
    echo "Đã thêm $(id -un) vào nhóm docker. Hãy đăng nhập lại để dùng docker không cần sudo."
  fi
fi
docker --version || true
echo "Hoàn tất cài Docker."
`;

  const POSTGRES = String.raw`PGV="@VERSION@"
port_check 5432
if command -v psql >/dev/null 2>&1; then echo "Đã có PostgreSQL: $(psql --version)"; fi
confirm
case "$PM" in
  apt)
    $SUDO apt-get update
    $SUDO apt-get install -y curl ca-certificates postgresql-common
    $SUDO /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
    $SUDO apt-get install -y "postgresql-$PGV"
    ;;
  dnf|yum)
    . /etc/os-release
    EL="$(echo "$VERSION_ID" | cut -d. -f1)"
    $SUDO $PM install -y "https://download.postgresql.org/pub/repos/yum/reporpms/EL-$EL-$(uname -m)/pgdg-redhat-repo-latest.noarch.rpm"
    if [ "$PM" = dnf ]; then $SUDO dnf -qy module disable postgresql || true; fi
    $SUDO $PM install -y "postgresql$PGV-server"
    $SUDO "/usr/pgsql-$PGV/bin/postgresql-$PGV-setup" initdb
    $SUDO systemctl enable --now "postgresql-$PGV"
    ;;
  brew)
    brew install "postgresql@$PGV"
    brew services start "postgresql@$PGV"
    ;;
esac
echo "Hoàn tất cài PostgreSQL $PGV (mặc định chỉ lắng nghe localhost:5432)."
echo "Đặt mật khẩu: sudo -u postgres psql -c \"ALTER USER postgres PASSWORD 'mat-khau-cua-ban';\""
echo "Không mở cổng 5432 ra internet nếu không cần."
`;

  const REDIS = String.raw`RV="@VERSION@"
port_check 6379
if command -v redis-server >/dev/null 2>&1; then echo "Đã có Redis: $(redis-server --version)"; fi
confirm
case "$PM" in
  apt)
    $SUDO apt-get update
    $SUDO apt-get install -y curl gpg lsb-release ca-certificates
    curl -fsSL https://packages.redis.io/gpg | $SUDO gpg --dearmor --yes -o /usr/share/keyrings/redis-archive-keyring.gpg
    $SUDO chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | $SUDO tee /etc/apt/sources.list.d/redis.list >/dev/null
    $SUDO apt-get update
    if [ -n "$RV" ]; then
      PKG="$(apt-cache madison redis-server | awk '{print $3}' | grep "^[0-9]*:$RV" | head -1 || true)"
      [ -n "$PKG" ] || { echo "Không tìm thấy phiên bản $RV trong repo."; exit 1; }
      $SUDO apt-get install -y "redis-server=$PKG" "redis-tools=$PKG"
    else
      $SUDO apt-get install -y redis
    fi
    $SUDO systemctl enable --now redis-server || true
    ;;
  dnf|yum)
    if [ -n "$RV" ]; then echo "Lưu ý: hệ này cài bản Redis của repo, không chọn được $RV."; fi
    $SUDO $PM install -y redis
    $SUDO systemctl enable --now redis
    ;;
  brew)
    if [ -n "$RV" ]; then echo "Lưu ý: Homebrew cài bản mới nhất, không chọn được $RV."; fi
    brew install redis
    brew services start redis
    ;;
esac
echo "Hoàn tất cài Redis. Mặc định chỉ lắng nghe localhost:6379."
echo "Không mở cổng 6379 ra internet. Nếu cần truy cập từ xa hãy đặt mật khẩu (requirepass) và dùng firewall."
`;

  const NGINX = String.raw`NV="@VERSION@"
port_check 80
if command -v nginx >/dev/null 2>&1; then echo "Đã có Nginx: $(nginx -v 2>&1)"; fi
confirm
P=""
if [ "$NV" = mainline ]; then P="mainline/"; fi
case "$PM" in
  apt)
    $SUDO apt-get update
    $SUDO apt-get install -y curl gnupg2 ca-certificates lsb-release
    . /etc/os-release
    curl -fsSL https://nginx.org/keys/nginx_signing.key | $SUDO gpg --dearmor --yes -o /usr/share/keyrings/nginx-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/$P$ID $(lsb_release -cs) nginx" | $SUDO tee /etc/apt/sources.list.d/nginx.list >/dev/null
    printf "Package: *\nPin: origin nginx.org\nPin-Priority: 900\n" | $SUDO tee /etc/apt/preferences.d/99nginx >/dev/null
    $SUDO apt-get update
    $SUDO apt-get install -y nginx
    $SUDO systemctl enable --now nginx || true
    ;;
  dnf|yum)
    printf "[nginx]\nname=nginx repo\nbaseurl=https://nginx.org/packages/%scentos/\$releasever/\$basearch/\ngpgcheck=1\nenabled=1\ngpgkey=https://nginx.org/keys/nginx_signing.key\nmodule_hotfixes=true\n" "$P" | $SUDO tee /etc/yum.repos.d/nginx.repo >/dev/null
    $SUDO $PM install -y nginx
    $SUDO systemctl enable --now nginx
    ;;
  brew)
    brew install nginx
    brew services start nginx
    ;;
esac
nginx -v || true
echo "Hoàn tất cài Nginx."
`;

  const OS = "Debian/Ubuntu, RHEL/Rocky/Alma, macOS";
  const APPS = [
    {
      id: "docker", name: "Docker", logo: "docker", os: OS,
      desc: "Docker Engine + Compose plugin (script chính thức get.docker.com)",
      versions: [
        { v: "", label: "Mới nhất (stable)" },
        { v: "29", label: "29.x" },
        { v: "28", label: "28.x" },
        { v: "27", label: "27.x" },
      ],
      script: DOCKER,
    },
    {
      id: "postgres", name: "PostgreSQL", logo: "postgres", os: OS,
      desc: "Cơ sở dữ liệu PostgreSQL từ repo chính thức PGDG",
      versions: [{ v: "17", label: "17" }, { v: "16", label: "16" }, { v: "15", label: "15" }, { v: "14", label: "14" }],
      script: POSTGRES,
    },
    {
      id: "redis", name: "Redis", logo: "redis", os: OS,
      desc: "Redis từ repo chính thức packages.redis.io (dùng cho cache, queue)",
      versions: [{ v: "", label: "Mới nhất" }, { v: "8.0", label: "8.0.x" }, { v: "7.4", label: "7.4.x" }, { v: "7.2", label: "7.2.x" }],
      script: REDIS,
    },
    {
      id: "nginx", name: "Nginx", logo: "nginx", os: OS,
      desc: "Web server / reverse proxy từ repo nginx.org",
      versions: [{ v: "stable", label: "stable" }, { v: "mainline", label: "mainline" }],
      script: NGINX,
    },
  ];
  // Sắp có: cần thiết kế riêng vì nhiều bước và rủi ro cao hơn
  const SOON = [
    { id: "k8s", name: "Kubernetes", logo: "k8s" },
    { id: "calico", name: "Calico", logo: "" },
    { id: "argocd", name: "ArgoCD", logo: "argocd" },
    { id: "harbor", name: "Harbor", logo: "harbor" },
  ];

  window.DEPLOY = {
    APPS,
    SOON,
    script(appId, version) {
      const a = APPS.find((x) => x.id === appId);
      if (!a) return "";
      return PRE + a.script.split("@VERSION@").join(version || "");
    },
  };
})();
