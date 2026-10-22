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
  Darwin)
    for b in /opt/homebrew/bin /usr/local/bin; do
      if [ -x "$b/brew" ]; then PATH="$PATH:$b"; fi
    done
    if command -v brew >/dev/null 2>&1; then PM=brew; else PM=mac; fi ;;
  Linux)
    if command -v apt-get >/dev/null 2>&1; then PM=apt
    elif command -v dnf >/dev/null 2>&1; then PM=dnf
    elif command -v yum >/dev/null 2>&1; then PM=yum
    else echo "Không nhận diện được trình quản lý gói (apt / dnf / yum)."; exit 1; fi ;;
  *) echo "Hệ điều hành này chưa được hỗ trợ."; exit 1 ;;
esac
echo "Trình quản lý gói: $PM"
if [ "$PM" = mac ]; then echo "(macOS không có Homebrew: chỉ làm được những việc không cần Homebrew)"; fi
if [ "$PM" != brew ] && [ "$PM" != mac ] && [ -n "$SUDO" ]; then
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
SUDO_RM="$SUDO"; BP=""; HAS_BREW=0; HAS_PORT=0
if [ "$PM" = brew ]; then SUDO_RM=""; BP="$(brew --prefix)"; HAS_BREW=1; fi
if [ "$PM" = mac ]; then SUDO_RM=""; fi
if command -v port >/dev/null 2>&1; then HAS_PORT=1; fi
brew_has() { if [ "$HAS_BREW" = 1 ] && brew list --formula "$1" >/dev/null 2>&1; then return 0; fi; return 1; }
brew_cask() { if [ "$HAS_BREW" = 1 ] && brew list --cask "$1" >/dev/null 2>&1; then return 0; fi; return 1; }
port_has() { if [ "$HAS_PORT" = 1 ] && [ -n "$(port -q installed "$1" 2>/dev/null)" ]; then return 0; fi; return 1; }
confirm_del() {
  printf "ĐÂY LÀ XOÁ VĨNH VIỄN, không khôi phục được. Gõ XOA để tiếp tục: "
  read -r ans
  [ "$ans" = XOA ] || { echo "Đã huỷ, chưa xoá gì."; exit 1; }
}
show_path() {
  if [ -e "$1" ]; then
    SZ="$($SUDO_RM du -sh "$1" 2>/dev/null | awk '{print $1}')"
    echo "  - $1 ($SZ)"
  fi
  return 0
}
rmp() {
  for p in "$@"; do
    if [ -e "$p" ]; then echo "  xoá $p"; $SUDO_RM rm -rf "$p"; fi
  done
  return 0
}
echo
`;

  const DOCKER = String.raw`DV="@VERSION@"
if [ "$PM" = mac ]; then
  echo "Máy chưa có Homebrew nên chưa cài Docker tự động được."
  echo "Hãy cài Homebrew (https://brew.sh) rồi chạy lại, hoặc dùng bản cài chính thức của ứng dụng."
  exit 1
fi
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
if [ "$PM" = mac ]; then
  echo "Máy chưa có Homebrew nên chưa cài PostgreSQL tự động được."
  echo "Hãy cài Homebrew (https://brew.sh) rồi chạy lại, hoặc dùng bản cài chính thức của ứng dụng."
  exit 1
fi
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
METHOD="@METHOD@"
if [ "$PM" = mac ]; then METHOD=source; fi
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
  brew|mac)
    if [ "$METHOD" = source ]; then
      xcode-select -p >/dev/null 2>&1 || { echo "Cần Xcode Command Line Tools: chạy xcode-select --install rồi thử lại."; exit 1; }
      if [ -z "$RV" ]; then
        RV="$(curl -fsSL https://api.github.com/repos/redis/redis/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')"
        [ -n "$RV" ] || { echo "Không lấy được phiên bản mới nhất từ GitHub."; exit 1; }
      fi
      URL="https://github.com/redis/redis/archive/refs/tags/$RV.tar.gz"
      W="$(mktemp -d)"
      echo "Tải $URL"
      curl -fsSL "$URL" -o "$W/redis.tar.gz" || { echo "Không tải được (phiên bản không tồn tại?)."; rm -rf "$W"; exit 1; }
      tar -xzf "$W/redis.tar.gz" -C "$W"
      cd "$W"/redis-*
      make -j"$(sysctl -n hw.ncpu)"
      DEST="$HOME/.local/redis/$(basename "$PWD" | sed 's/^redis-//')"
      make PREFIX="$DEST" install
      cd /
      rm -rf "$W"
      mkdir -p "$HOME/.local/redis/data"
      echo "Đã cài vào $DEST"
      if lsof -nP -iTCP:6379 -sTCP:LISTEN >/dev/null 2>&1; then
        echo "Cổng 6379 đang được dùng (có thể là Redis của Homebrew) nên chưa khởi động. Dừng nó rồi chạy lệnh bên dưới."
      else
        "$DEST/bin/redis-server" --bind 127.0.0.1 --port 6379 --dir "$HOME/.local/redis/data" --daemonize yes
        echo "Đã khởi động Redis, chỉ lắng nghe 127.0.0.1:6379."
      fi
      echo "Chạy thủ công: $DEST/bin/redis-server --bind 127.0.0.1 --dir $HOME/.local/redis/data"
      "$DEST/bin/redis-server" --version
    else
      brew install redis
      brew services start redis
    fi
    ;;
esac
echo "Hoàn tất cài Redis. Mặc định chỉ lắng nghe localhost:6379."
echo "Không mở cổng 6379 ra internet. Nếu cần truy cập từ xa hãy đặt mật khẩu (requirepass) và dùng firewall."
`;

  const NGINX = String.raw`NV="@VERSION@"
if [ "$PM" = mac ]; then
  echo "Máy chưa có Homebrew nên chưa cài Nginx tự động được."
  echo "Hãy cài Homebrew (https://brew.sh) rồi chạy lại, hoặc dùng bản cài chính thức của ứng dụng."
  exit 1
fi
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
  const DOCKER_UN = String.raw`echo "=== Gỡ Docker và xoá sạch dữ liệu ==="
if command -v docker >/dev/null 2>&1; then
  echo "Hiện có: $(docker ps -aq 2>/dev/null | wc -l | tr -d ' ') container, $(docker images -q 2>/dev/null | sort -u | wc -l | tr -d ' ') image, $(docker volume ls -q 2>/dev/null | wc -l | tr -d ' ') volume (TẤT CẢ sẽ bị xoá)."
else
  echo "Không thấy lệnh docker (đã gỡ hoặc daemon không chạy); vẫn dọn phần còn sót."
fi
echo "Sẽ xoá:"
case "$PM" in
  brew|mac)
    if brew_cask docker; then echo "  - Docker Desktop (Homebrew cask, kèm --zap)"; fi
    if brew_has docker; then echo "  - công cụ dòng lệnh docker (Homebrew)"; fi
    show_path /Applications/Docker.app
    show_path "$HOME/.docker"
    show_path "$HOME/Library/Containers/com.docker.docker"
    show_path "$HOME/Library/Group Containers/group.com.docker"
    show_path "$HOME/Library/Application Support/Docker Desktop"
    ;;
  *)
    echo "  - các gói docker-ce, docker-ce-cli, containerd.io, buildx, compose"
    show_path /var/lib/docker
    show_path /var/lib/containerd
    show_path /etc/docker
    ;;
esac
confirm_del
case "$PM" in
  brew|mac)
    osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
    sleep 3
    if brew_cask docker; then brew uninstall --cask --zap docker || echo "Không gỡ được cask docker bằng brew."; fi
    if brew_has docker; then brew uninstall --force docker || echo "Không gỡ được formula docker bằng brew."; fi
    rmp /Applications/Docker.app
    for l in /usr/local/bin/*; do
      if [ -L "$l" ] && readlink "$l" | grep -q "Docker.app"; then
        echo "  xoá liên kết $l"
        rm -f "$l" 2>/dev/null || $SUDO rm -f "$l"
      fi
    done
    rmp "$HOME/.docker" "$HOME/Library/Containers/com.docker.docker" "$HOME/Library/Group Containers/group.com.docker" "$HOME/Library/Application Support/Docker Desktop"
    ;;
  apt)
    $SUDO systemctl disable --now docker.service docker.socket containerd.service 2>/dev/null || true
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^(docker-ce|docker-ce-cli|containerd.io|docker-buildx-plugin|docker-compose-plugin|docker-ce-rootless-extras|docker-model-plugin)$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    $SUDO apt-get autoremove -y --purge || true
    rmp /var/lib/docker /var/lib/containerd /etc/docker /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc /etc/apt/keyrings/docker.gpg
    ;;
  dnf|yum)
    $SUDO systemctl disable --now docker.service docker.socket containerd.service 2>/dev/null || true
    PK="$(rpm -qa --qf '%{NAME}\n' | grep -E '^(docker-ce|docker-ce-cli|containerd.io|docker-buildx-plugin|docker-compose-plugin|docker-ce-rootless-extras)$' || true)"
    if [ -n "$PK" ]; then $SUDO $PM remove -y $PK; fi
    rmp /var/lib/docker /var/lib/containerd /etc/docker /etc/yum.repos.d/docker-ce.repo
    ;;
esac
echo "Đã gỡ Docker và xoá dữ liệu. Nhóm người dùng 'docker' (nếu có) được giữ lại, không ảnh hưởng."
`;

  const POSTGRES_UN = String.raw`echo "=== Gỡ PostgreSQL và xoá sạch dữ liệu ==="
echo "Sẽ xoá TOÀN BỘ PostgreSQL trên máy này (mọi phiên bản, mọi cách cài) cùng MỌI cơ sở dữ liệu. Hãy chắc chắn đã sao lưu (pg_dump)."
PK=""
PORTPK=""
case "$PM" in
  apt)
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^postgresql' || true)"
    echo "Gói: $PK"
    show_path /var/lib/postgresql
    show_path /etc/postgresql
    show_path /var/log/postgresql
    ;;
  dnf|yum)
    PK="$(rpm -qa --qf '%{NAME}\n' | grep -E '^(postgresql|pgdg-redhat-repo)' || true)"
    echo "Gói: $PK"
    show_path /var/lib/pgsql
    for d in /usr/pgsql-*; do show_path "$d"; done
    ;;
  brew|mac)
    if [ "$HAS_BREW" = 1 ]; then
      PK="$(brew list --formula 2>/dev/null | grep -E '^postgresql(@[0-9]+)?$' || true)"
      if [ -n "$PK" ]; then echo "Formula Homebrew: $PK"; fi
      for f in $PK; do show_path "$BP/var/$f"; done
      show_path "$BP/var/postgres"
    fi
    if [ "$HAS_PORT" = 1 ]; then
      PORTPK="$(port -q installed 2>/dev/null | awk '{print $1}' | grep -E '^postgresql' | sort -u || true)"
      if [ -n "$PORTPK" ]; then echo "Gói MacPorts: $PORTPK"; fi
      for d in /opt/local/var/db/postgresql*; do show_path "$d"; done
    fi
    show_path /Applications/Postgres.app
    show_path "$HOME/Library/Application Support/Postgres"
    ;;
esac
confirm_del
case "$PM" in
  apt)
    $SUDO systemctl stop postgresql 2>/dev/null || true
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    $SUDO apt-get autoremove -y --purge || true
    rmp /var/lib/postgresql /etc/postgresql /etc/postgresql-common /var/log/postgresql /etc/apt/sources.list.d/pgdg.list /etc/apt/sources.list.d/pgdg.sources /usr/share/postgresql-common/pgdg
    $SUDO userdel postgres 2>/dev/null || true
    ;;
  dnf|yum)
    for u in $(systemctl list-unit-files --no-legend 'postgresql*' 2>/dev/null | awk '{print $1}'); do $SUDO systemctl disable --now "$u" 2>/dev/null || true; done
    if [ -n "$PK" ]; then $SUDO $PM remove -y $PK; fi
    rmp /var/lib/pgsql
    for d in /usr/pgsql-*; do rmp "$d"; done
    $SUDO userdel postgres 2>/dev/null || true
    ;;
  brew|mac)
    for f in $PK; do
      brew services stop "$f" || true
      brew uninstall --force "$f" || echo "Không gỡ được $f (có gói khác phụ thuộc?)."
      rmp "$BP/var/$f"
    done
    if [ "$HAS_BREW" = 1 ]; then rmp "$BP/var/postgres"; fi
    if [ -n "$PORTPK" ]; then
      $SUDO port -N uninstall $PORTPK || echo "Không gỡ được một số gói MacPorts."
      for d in /opt/local/var/db/postgresql*; do rmp "$d"; done
    fi
    if [ -d /Applications/Postgres.app ]; then
      osascript -e 'quit app "Postgres"' >/dev/null 2>&1 || true
      sleep 2
      rmp /Applications/Postgres.app "$HOME/Library/Application Support/Postgres"
    fi
    ;;
esac
echo "Đã gỡ PostgreSQL và xoá dữ liệu."
`;

  const REDIS_UN = String.raw`echo "=== Gỡ Redis và xoá sạch dữ liệu ==="
echo "Sẽ xoá:"
case "$PM" in
  apt)
    show_path /var/lib/redis
    show_path /etc/redis
    show_path /var/log/redis
    ;;
  dnf|yum)
    show_path /var/lib/redis
    show_path /etc/redis
    show_path /etc/redis.conf
    show_path /var/log/redis
    ;;
  brew|mac)
    if brew_has redis; then
      echo "  - Redis (Homebrew)"
      show_path "$BP/var/db/redis"
      show_path "$BP/etc/redis.conf"
      show_path "$BP/etc/redis-sentinel.conf"
      show_path "$BP/var/log/redis.log"
    fi
    if port_has redis; then echo "  - Redis (MacPorts)"; show_path /opt/local/var/db/redis; fi
    show_path "$HOME/.local/redis"
    ;;
esac
confirm_del
case "$PM" in
  apt)
    $SUDO systemctl disable --now redis-server redis-sentinel 2>/dev/null || true
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^(redis|redis-server|redis-tools|redis-sentinel)$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    $SUDO apt-get autoremove -y --purge || true
    rmp /var/lib/redis /etc/redis /var/log/redis /etc/apt/sources.list.d/redis.list /usr/share/keyrings/redis-archive-keyring.gpg
    ;;
  dnf|yum)
    $SUDO systemctl disable --now redis redis-sentinel 2>/dev/null || true
    if rpm -q redis >/dev/null 2>&1; then $SUDO $PM remove -y redis; fi
    rmp /var/lib/redis /etc/redis /etc/redis.conf /etc/redis-sentinel.conf /var/log/redis
    ;;
  brew|mac)
    if brew_has redis; then
      brew services stop redis || true
      brew uninstall --force redis || echo "Không gỡ được redis bằng brew."
      rmp "$BP/var/db/redis" "$BP/etc/redis.conf" "$BP/etc/redis-sentinel.conf" "$BP/var/log/redis.log"
    fi
    if port_has redis; then
      $SUDO port -N uninstall redis || echo "Không gỡ được redis bằng MacPorts."
      rmp /opt/local/var/db/redis
    fi
    pkill -f "$HOME/.local/redis" 2>/dev/null || true
    rmp "$HOME/.local/redis"
    ;;
esac
echo "Đã gỡ Redis và xoá dữ liệu."
`;

  const NGINX_UN = String.raw`echo "=== Gỡ Nginx và xoá sạch cấu hình ==="
echo "Thư mục web của bạn (ví dụ /var/www) KHÔNG bị xoá."
echo "Sẽ xoá:"
case "$PM" in
  brew|mac)
    if brew_has nginx; then echo "  - Nginx (Homebrew)"; show_path "$BP/etc/nginx"; show_path "$BP/var/log/nginx"; fi
    if port_has nginx; then echo "  - Nginx (MacPorts)"; show_path /opt/local/etc/nginx; show_path /opt/local/var/log/nginx; fi
    ;;
  *)
    show_path /etc/nginx
    show_path /var/log/nginx
    show_path /var/cache/nginx
    ;;
esac
confirm_del
case "$PM" in
  apt)
    $SUDO systemctl disable --now nginx 2>/dev/null || true
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^nginx(-.*)?$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    $SUDO apt-get autoremove -y --purge || true
    rmp /etc/nginx /var/log/nginx /var/cache/nginx /etc/apt/sources.list.d/nginx.list /etc/apt/preferences.d/99nginx /usr/share/keyrings/nginx-archive-keyring.gpg
    ;;
  dnf|yum)
    $SUDO systemctl disable --now nginx 2>/dev/null || true
    if rpm -q nginx >/dev/null 2>&1; then $SUDO $PM remove -y nginx; fi
    rmp /etc/nginx /var/log/nginx /var/cache/nginx /etc/yum.repos.d/nginx.repo
    ;;
  brew|mac)
    if brew_has nginx; then
      brew services stop nginx || true
      brew uninstall --force nginx || echo "Không gỡ được nginx bằng brew."
      rmp "$BP/etc/nginx" "$BP/var/log/nginx" "$BP/var/run/nginx.pid"
    fi
    if port_has nginx; then
      $SUDO port -N uninstall nginx || echo "Không gỡ được nginx bằng MacPorts."
      rmp /opt/local/etc/nginx /opt/local/var/log/nginx
    fi
    ;;
esac
echo "Đã gỡ Nginx và xoá cấu hình."
`;

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
      script: DOCKER, uninstall: DOCKER_UN,
    },
    {
      id: "postgres", name: "PostgreSQL", logo: "postgres", os: OS,
      desc: "Cơ sở dữ liệu PostgreSQL từ repo chính thức PGDG",
      versions: [{ v: "18", label: "18" }, { v: "17", label: "17" }, { v: "16", label: "16" }, { v: "15", label: "15" }, { v: "14", label: "14" }],
      script: POSTGRES, uninstall: POSTGRES_UN,
    },
    {
      id: "redis", name: "Redis", logo: "redis", os: OS,
      desc: "Redis từ repo chính thức packages.redis.io (dùng cho cache, queue)",
      versions: [{ v: "", label: "Mới nhất" }, { v: "8.0", label: "8.0.x" }, { v: "7.4", label: "7.4.x" }, { v: "7.2", label: "7.2.x" }],
      script: REDIS, uninstall: REDIS_UN,
    },
    {
      id: "nginx", name: "Nginx", logo: "nginx", os: OS,
      desc: "Web server / reverse proxy từ repo nginx.org",
      versions: [{ v: "stable", label: "stable" }, { v: "mainline", label: "mainline" }],
      script: NGINX, uninstall: NGINX_UN,
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
    script(appId, version, method, mode) {
      const a = APPS.find((x) => x.id === appId);
      if (!a) return "";
      if (mode === "uninstall") return PRE + a.uninstall;
      return PRE + a.script.split("@METHOD@").join(method || "").split("@VERSION@").join(version || "");
    },
  };
})();
