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
begin() { TOTAL="$1"; STEP=0; }
step() { STEP=$((STEP+1)); echo "##P $STEP $TOTAL $1"; }
KC=""
kube_pick() {
  command -v kubectl >/dev/null 2>&1 || { echo "Chưa có kubectl trên máy này. Hãy cài Kubernetes (hoặc kubectl) trước."; exit 1; }
  if kubectl --request-timeout=8s get ns >/dev/null 2>&1; then KC="kubectl"
  elif [ -r /etc/kubernetes/admin.conf ]; then KC="kubectl --kubeconfig /etc/kubernetes/admin.conf"
  elif [ -f /etc/kubernetes/admin.conf ] && [ -n "$SUDO" ]; then KC="$SUDO kubectl --kubeconfig /etc/kubernetes/admin.conf"
  else echo "Không kết nối được tới cluster Kubernetes nào (kubectl get ns thất bại)."; exit 1; fi
  echo "Cluster đích: $($KC config current-context 2>/dev/null || echo admin.conf)"
  echo "API server: $($KC config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null)"
}
linux_only() {
  if [ "$PM" = brew ] || [ "$PM" = mac ]; then echo "$1 chỉ cài được trên Linux (máy này là macOS)."; exit 1; fi
}
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
case "$PM" in
  brew|mac)
    begin 4
    step "Dừng Docker Desktop"
    osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
    sleep 3
    step "Gỡ ứng dụng Docker"
    if brew_cask docker; then brew uninstall --cask --zap docker || echo "Không gỡ được cask docker bằng brew."; fi
    if brew_has docker; then brew uninstall --force docker || echo "Không gỡ được formula docker bằng brew."; fi
    rmp /Applications/Docker.app
    step "Dọn liên kết dòng lệnh"
    for l in /usr/local/bin/*; do
      if [ -L "$l" ] && readlink "$l" | grep -q "Docker.app"; then
        echo "  xoá liên kết $l"
        rm -f "$l" 2>/dev/null || $SUDO rm -f "$l"
      fi
    done
    step "Xoá dữ liệu và cấu hình"
    rmp "$HOME/.docker" "$HOME/Library/Containers/com.docker.docker" "$HOME/Library/Group Containers/group.com.docker" "$HOME/Library/Application Support/Docker Desktop"
    ;;
  apt)
    begin 3
    step "Dừng dịch vụ Docker"
    $SUDO systemctl disable --now docker.service docker.socket containerd.service 2>/dev/null || true
    step "Gỡ các gói Docker"
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^(docker-ce|docker-ce-cli|containerd.io|docker-buildx-plugin|docker-compose-plugin|docker-ce-rootless-extras|docker-model-plugin)$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    step "Xoá dữ liệu và repo"
    rmp /var/lib/docker /var/lib/containerd /etc/docker /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc /etc/apt/keyrings/docker.gpg
    ;;
  dnf|yum)
    begin 3
    step "Dừng dịch vụ Docker"
    $SUDO systemctl disable --now docker.service docker.socket containerd.service 2>/dev/null || true
    step "Gỡ các gói Docker"
    PK="$(rpm -qa --qf '%{NAME}\n' | grep -E '^(docker-ce|docker-ce-cli|containerd.io|docker-buildx-plugin|docker-compose-plugin|docker-ce-rootless-extras)$' || true)"
    if [ -n "$PK" ]; then $SUDO $PM remove -y $PK; fi
    step "Xoá dữ liệu và repo"
    rmp /var/lib/docker /var/lib/containerd /etc/docker /etc/yum.repos.d/docker-ce.repo
    ;;
esac
echo "Đã gỡ Docker và xoá dữ liệu. Nhóm người dùng 'docker' (nếu có) được giữ lại, không ảnh hưởng."
echo "##P done"
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
case "$PM" in
  apt)
    begin 3
    step "Dừng PostgreSQL"
    $SUDO systemctl stop postgresql 2>/dev/null || true
    step "Gỡ các gói PostgreSQL"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    step "Xoá dữ liệu và repo"
    rmp /var/lib/postgresql /etc/postgresql /etc/postgresql-common /var/log/postgresql /etc/apt/sources.list.d/pgdg.list /etc/apt/sources.list.d/pgdg.sources /usr/share/postgresql-common/pgdg
    $SUDO userdel postgres 2>/dev/null || true
    ;;
  dnf|yum)
    begin 3
    step "Dừng PostgreSQL"
    for u in $(systemctl list-unit-files --no-legend 'postgresql*' 2>/dev/null | awk '{print $1}'); do $SUDO systemctl disable --now "$u" 2>/dev/null || true; done
    step "Gỡ các gói PostgreSQL"
    if [ -n "$PK" ]; then $SUDO $PM remove -y $PK; fi
    step "Xoá dữ liệu"
    rmp /var/lib/pgsql
    for d in /usr/pgsql-*; do rmp "$d"; done
    $SUDO userdel postgres 2>/dev/null || true
    ;;
  brew|mac)
    begin 3
    step "Gỡ PostgreSQL (Homebrew)"
    for f in $PK; do
      brew services stop "$f" || true
      brew uninstall --force "$f" || echo "Không gỡ được $f (có gói khác phụ thuộc?)."
      rmp "$BP/var/$f"
    done
    if [ "$HAS_BREW" = 1 ]; then rmp "$BP/var/postgres"; fi
    step "Gỡ PostgreSQL (MacPorts)"
    if [ -n "$PORTPK" ]; then
      $SUDO port -N uninstall $PORTPK || echo "Không gỡ được một số gói MacPorts."
      for d in /opt/local/var/db/postgresql*; do rmp "$d"; done
    fi
    step "Gỡ Postgres.app"
    if [ -d /Applications/Postgres.app ]; then
      osascript -e 'quit app "Postgres"' >/dev/null 2>&1 || true
      sleep 2
      rmp /Applications/Postgres.app "$HOME/Library/Application Support/Postgres"
    fi
    ;;
esac
echo "Đã gỡ PostgreSQL và xoá dữ liệu."
echo "##P done"
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
case "$PM" in
  apt)
    begin 3
    step "Dừng Redis"
    $SUDO systemctl disable --now redis-server redis-sentinel 2>/dev/null || true
    step "Gỡ các gói Redis"
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^(redis|redis-server|redis-tools|redis-sentinel)$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    step "Xoá dữ liệu và repo"
    rmp /var/lib/redis /etc/redis /var/log/redis /etc/apt/sources.list.d/redis.list /usr/share/keyrings/redis-archive-keyring.gpg
    ;;
  dnf|yum)
    begin 3
    step "Dừng Redis"
    $SUDO systemctl disable --now redis redis-sentinel 2>/dev/null || true
    step "Gỡ gói Redis"
    if rpm -q redis >/dev/null 2>&1; then $SUDO $PM remove -y redis; fi
    step "Xoá dữ liệu"
    rmp /var/lib/redis /etc/redis /etc/redis.conf /etc/redis-sentinel.conf /var/log/redis
    ;;
  brew|mac)
    begin 3
    step "Gỡ Redis (Homebrew)"
    if brew_has redis; then
      brew services stop redis || true
      brew uninstall --force redis || echo "Không gỡ được redis bằng brew."
      rmp "$BP/var/db/redis" "$BP/etc/redis.conf" "$BP/etc/redis-sentinel.conf" "$BP/var/log/redis.log"
    fi
    step "Gỡ Redis (MacPorts)"
    if port_has redis; then
      $SUDO port -N uninstall redis || echo "Không gỡ được redis bằng MacPorts."
      rmp /opt/local/var/db/redis
    fi
    step "Gỡ Redis cài từ mã nguồn"
    pkill -f "$HOME/.local/redis" 2>/dev/null || true
    rmp "$HOME/.local/redis"
    ;;
esac
echo "Đã gỡ Redis và xoá dữ liệu."
echo "##P done"
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
case "$PM" in
  apt)
    begin 3
    step "Dừng Nginx"
    $SUDO systemctl disable --now nginx 2>/dev/null || true
    step "Gỡ các gói Nginx"
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^nginx(-.*)?$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    step "Xoá cấu hình và repo"
    rmp /etc/nginx /var/log/nginx /var/cache/nginx /etc/apt/sources.list.d/nginx.list /etc/apt/preferences.d/99nginx /usr/share/keyrings/nginx-archive-keyring.gpg
    ;;
  dnf|yum)
    begin 3
    step "Dừng Nginx"
    $SUDO systemctl disable --now nginx 2>/dev/null || true
    step "Gỡ gói Nginx"
    if rpm -q nginx >/dev/null 2>&1; then $SUDO $PM remove -y nginx; fi
    step "Xoá cấu hình và repo"
    rmp /etc/nginx /var/log/nginx /var/cache/nginx /etc/yum.repos.d/nginx.repo
    ;;
  brew|mac)
    begin 2
    step "Gỡ Nginx (Homebrew)"
    if brew_has nginx; then
      brew services stop nginx || true
      brew uninstall --force nginx || echo "Không gỡ được nginx bằng brew."
      rmp "$BP/etc/nginx" "$BP/var/log/nginx" "$BP/var/run/nginx.pid"
    fi
    step "Gỡ Nginx (MacPorts)"
    if port_has nginx; then
      $SUDO port -N uninstall nginx || echo "Không gỡ được nginx bằng MacPorts."
      rmp /opt/local/etc/nginx /opt/local/var/log/nginx
    fi
    ;;
esac
echo "Đã gỡ Nginx và xoá cấu hình."
echo "##P done"
`;

  const K8S = String.raw`KV="@VERSION@"
linux_only "Kubernetes (kubeadm)"
case "$KV" in [0-9]*.[0-9]*) ;; *) echo "Phiên bản không hợp lệ: $KV"; exit 1 ;; esac
port_check 6443
if command -v kubeadm >/dev/null 2>&1; then echo "Đã có kubeadm: $(kubeadm version -o short)"; fi
if [ -f /etc/kubernetes/admin.conf ]; then echo "Máy này đã là node Kubernetes (/etc/kubernetes/admin.conf). Hãy gỡ cluster cũ trước."; exit 1; fi
echo "Sẽ làm: tắt swap, nạp module kernel, cài containerd (nếu chưa có), cài kubelet/kubeadm/kubectl $KV từ pkgs.k8s.io,"
echo "chạy kubeadm init (pod CIDR 192.168.0.0/16, hợp với Calico) và cho phép chạy workload trên node này."
confirm
$SUDO swapoff -a
$SUDO sed -i '/ swap / s/^/#/' /etc/fstab
printf "overlay\nbr_netfilter\n" | $SUDO tee /etc/modules-load.d/k8s.conf >/dev/null
$SUDO modprobe overlay
$SUDO modprobe br_netfilter
printf "net.bridge.bridge-nf-call-iptables=1\nnet.bridge.bridge-nf-call-ip6tables=1\nnet.ipv4.ip_forward=1\n" | $SUDO tee /etc/sysctl.d/99-k8s.conf >/dev/null
$SUDO sysctl --system >/dev/null
case "$PM" in
  apt)
    $SUDO apt-get update
    $SUDO apt-get install -y apt-transport-https ca-certificates curl gpg
    if ! command -v containerd >/dev/null 2>&1; then $SUDO apt-get install -y containerd; fi
    $SUDO mkdir -p /etc/apt/keyrings
    curl -fsSL "https://pkgs.k8s.io/core:/stable:/v$KV/deb/Release.key" | $SUDO gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
    echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v$KV/deb/ /" | $SUDO tee /etc/apt/sources.list.d/kubernetes.list >/dev/null
    $SUDO apt-get update
    $SUDO apt-get install -y kubelet kubeadm kubectl
    $SUDO apt-mark hold kubelet kubeadm kubectl
    ;;
  dnf|yum)
    command -v containerd >/dev/null 2>&1 || { echo "Cần containerd trước (cài Docker bằng menu này sẽ có sẵn containerd)."; exit 1; }
    printf "[kubernetes]\nname=Kubernetes\nbaseurl=https://pkgs.k8s.io/core:/stable:/v%s/rpm/\nenabled=1\ngpgcheck=1\ngpgkey=https://pkgs.k8s.io/core:/stable:/v%s/rpm/repodata/repomd.xml.key\nexclude=kubelet kubeadm kubectl cri-tools kubernetes-cni\n" "$KV" "$KV" | $SUDO tee /etc/yum.repos.d/kubernetes.repo >/dev/null
    $SUDO $PM install -y kubelet kubeadm kubectl --disableexcludes=kubernetes
    ;;
esac
if [ -f /etc/containerd/config.toml ]; then $SUDO cp /etc/containerd/config.toml "/etc/containerd/config.toml.bak-$(date +%s)"; fi
$SUDO mkdir -p /etc/containerd
containerd config default | $SUDO tee /etc/containerd/config.toml >/dev/null
$SUDO sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
$SUDO systemctl enable --now containerd
$SUDO systemctl restart containerd
$SUDO systemctl enable --now kubelet
echo "=== kubeadm init ==="
$SUDO kubeadm init --pod-network-cidr=192.168.0.0/16
mkdir -p "$HOME/.kube"
if [ -e "$HOME/.kube/config" ]; then
  $SUDO cp /etc/kubernetes/admin.conf "$HOME/.kube/config.kubeadm"
  $SUDO chown "$(id -u):$(id -g)" "$HOME/.kube/config.kubeadm"
  echo "Đã có ~/.kube/config nên KHÔNG ghi đè. kubeconfig của cluster mới nằm ở ~/.kube/config.kubeadm"
else
  $SUDO cp /etc/kubernetes/admin.conf "$HOME/.kube/config"
  $SUDO chown "$(id -u):$(id -g)" "$HOME/.kube/config"
fi
$SUDO kubectl --kubeconfig /etc/kubernetes/admin.conf taint nodes --all node-role.kubernetes.io/control-plane- || true
echo "Hoàn tất cài Kubernetes $KV. Node sẽ ở trạng thái NotReady cho tới khi cài CNI (hãy cài Calico)."
echo "Lưu ý bảo mật: giới hạn cổng 6443 (API server) bằng firewall, chỉ cho IP tin cậy truy cập."
`;

  const K8S_UN = String.raw`linux_only "Kubernetes (kubeadm)"
echo "=== Gỡ Kubernetes và xoá sạch cluster ==="
echo "Sẽ xoá toàn bộ cluster trên máy này (workload, etcd, chứng chỉ, cấu hình):"
show_path /etc/kubernetes
show_path /var/lib/kubelet
show_path /var/lib/etcd
show_path /etc/cni/net.d
show_path /opt/cni
begin 3
step "Đặt lại cluster (kubeadm reset)"
if command -v kubeadm >/dev/null 2>&1; then $SUDO kubeadm reset -f || true; fi
step "Gỡ kubelet, kubeadm, kubectl"
case "$PM" in
  apt)
    $SUDO apt-mark unhold kubelet kubeadm kubectl 2>/dev/null || true
    PK="$(dpkg -l | awk '/^ii/ {print $2}' | grep -E '^(kubelet|kubeadm|kubectl|kubernetes-cni|cri-tools)$' || true)"
    if [ -n "$PK" ]; then $SUDO apt-get purge -y $PK; fi
    ;;
  dnf|yum)
    PK="$(rpm -qa --qf '%{NAME}\n' | grep -E '^(kubelet|kubeadm|kubectl|kubernetes-cni|cri-tools)$' || true)"
    if [ -n "$PK" ]; then $SUDO $PM remove -y $PK; fi
    ;;
esac
step "Xoá dữ liệu, cấu hình và repo"
rmp /etc/kubernetes /var/lib/kubelet /var/lib/etcd /etc/cni/net.d /var/lib/cni /opt/cni /etc/sysctl.d/99-k8s.conf /etc/modules-load.d/k8s.conf /etc/apt/sources.list.d/kubernetes.list /etc/apt/keyrings/kubernetes-apt-keyring.gpg /etc/yum.repos.d/kubernetes.repo
echo "Đã gỡ Kubernetes. Giữ lại: ~/.kube (có thể chứa cluster khác), containerd, và các luật iptables còn sót (sẽ mất sau khi khởi động lại máy)."
echo "##P done"
`;

  const CALICO = String.raw`CV="@VERSION@"
case "$CV" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "Phiên bản không hợp lệ: $CV"; exit 1 ;; esac
kube_pick
if $KC -n kube-system get ds calico-node >/dev/null 2>&1; then echo "Cluster này đã có Calico (calico-node)."; fi
URL="https://raw.githubusercontent.com/projectcalico/calico/v$CV/manifests/calico.yaml"
echo "Sẽ chạy: kubectl apply -f $URL"
echo "Calico là plugin mạng (CNI) của cả cluster; hãy chắc chắn cluster đích ở trên là đúng."
confirm
$KC apply -f "$URL"
echo "Chờ calico-node sẵn sàng (tối đa 5 phút)..."
$KC -n kube-system rollout status ds/calico-node --timeout=300s || echo "calico-node chưa sẵn sàng; kiểm tra: kubectl -n kube-system get pods"
$KC get nodes
echo "Hoàn tất cài Calico $CV."
`;

  const CALICO_UN = String.raw`echo "=== Gỡ Calico khỏi cluster ==="
kube_pick
CV="$($KC -n kube-system get ds calico-node -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | sed -n 's/.*:v\([0-9][0-9.]*\)$/\1/p' || true)"
if [ -z "$CV" ]; then echo "Không thấy Calico (calico-node) trong cluster này."; else echo "Calico đang chạy: v$CV"; fi
echo "Pod sẽ MẤT mạng cho tới khi có CNI khác."
show_path /etc/cni/net.d/10-calico.conflist
show_path /var/lib/calico
begin 2
step "Xoá Calico khỏi cluster"
if [ -n "$CV" ]; then $KC delete -f "https://raw.githubusercontent.com/projectcalico/calico/v$CV/manifests/calico.yaml" --ignore-not-found --timeout=180s || true; fi
step "Dọn cấu hình CNI trên máy này"
rmp /etc/cni/net.d/10-calico.conflist /etc/cni/net.d/calico-kubeconfig /var/lib/calico /var/run/calico
echo "Đã gỡ Calico."
echo "##P done"
`;

  const ARGOCD = String.raw`AV="@VERSION@"
case "$AV" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "Phiên bản không hợp lệ: $AV"; exit 1 ;; esac
kube_pick
if $KC -n argocd get deploy argocd-server >/dev/null 2>&1; then echo "Cluster này đã có ArgoCD (namespace argocd)."; fi
URL="https://raw.githubusercontent.com/argoproj/argo-cd/v$AV/manifests/install.yaml"
echo "Sẽ tạo namespace argocd và chạy: kubectl apply -n argocd --server-side -f $URL"
echo "Không mở cổng ra ngoài: giữ ClusterIP, truy cập bằng port-forward hoặc SSH tunnel."
confirm
$KC create namespace argocd --dry-run=client -o yaml | $KC apply -f -
$KC apply -n argocd --server-side --force-conflicts -f "$URL"
echo "Chờ argocd-server sẵn sàng (tối đa 5 phút)..."
$KC -n argocd rollout status deployment/argocd-server --timeout=300s || echo "argocd-server chưa sẵn sàng; kiểm tra: kubectl -n argocd get pods"
echo "Hoàn tất cài ArgoCD $AV."
echo "Truy cập an toàn: kubectl -n argocd port-forward svc/argocd-server 8080:443  rồi mở https://localhost:8080"
echo "Mật khẩu admin ban đầu: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
echo "Sau khi đăng nhập hãy đổi mật khẩu và xoá secret argocd-initial-admin-secret."
`;

  const ARGOCD_UN = String.raw`echo "=== Gỡ ArgoCD khỏi cluster ==="
kube_pick
AV="$($KC -n argocd get deploy argocd-server -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | sed -n 's/.*:v\([0-9][0-9.]*\)$/\1/p' || true)"
if [ -z "$AV" ]; then echo "Không thấy argocd-server trong namespace argocd."; else echo "ArgoCD đang chạy: v$AV"; fi
echo "Các Application: $($KC get applications.argoproj.io -A --no-headers 2>/dev/null | wc -l | tr -d ' ')"
echo "Workload ArgoCD đã triển khai sẽ được GIỮ LẠI (script gỡ finalizer của Application trước khi xoá)."
begin 3
step "Giữ lại workload: gỡ finalizer của Application"
$KC get applications.argoproj.io -A --no-headers -o custom-columns=NS:.metadata.namespace,N:.metadata.name 2>/dev/null | while read -r ns n; do
  if [ -n "$n" ]; then $KC -n "$ns" patch applications.argoproj.io "$n" --type merge -p '{"metadata":{"finalizers":null}}' || true; fi
done
step "Xoá ArgoCD"
if [ -n "$AV" ]; then $KC delete -n argocd -f "https://raw.githubusercontent.com/argoproj/argo-cd/v$AV/manifests/install.yaml" --ignore-not-found --timeout=180s || true; fi
step "Xoá namespace và CRD"
$KC delete crd applications.argoproj.io applicationsets.argoproj.io appprojects.argoproj.io --ignore-not-found --timeout=120s || true
$KC delete namespace argocd --ignore-not-found --timeout=180s || true
echo "Đã gỡ ArgoCD."
echo "##P done"
`;

  const HARBOR = String.raw`HV="@VERSION@"
HH="@HOST@"
HP="@PORT@"
linux_only "Harbor"
case "$HV" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "Phiên bản không hợp lệ: $HV"; exit 1 ;; esac
echo "$HH" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' || { echo "Tên miền/IP không hợp lệ."; exit 1; }
case "$HP" in ""|*[!0-9]*) echo "Cổng không hợp lệ."; exit 1 ;; esac
command -v docker >/dev/null 2>&1 || { echo "Cần cài Docker trước (menu Deployment, ứng dụng Docker)."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Cần Docker Compose plugin (có sẵn khi cài Docker bằng menu này)."; exit 1; }
if [ -e /opt/harbor ]; then echo "Đã có /opt/harbor. Hãy gỡ Harbor cũ trước khi cài lại."; exit 1; fi
port_check "$HP"
echo "Sẽ cài Harbor $HV vào /opt/harbor (bộ cài online từ github.com/goharbor/harbor), hostname $HH, cổng HTTP $HP."
echo "Mặc định chỉ HTTP, không TLS: hãy đặt reverse proxy HTTPS phía trước, và dùng firewall giới hạn cổng $HP."
confirm
W="$(mktemp -d)"
curl -fsSL "https://github.com/goharbor/harbor/releases/download/v$HV/harbor-online-installer-v$HV.tgz" -o "$W/harbor.tgz"
$SUDO mkdir -p /opt
$SUDO tar -xzf "$W/harbor.tgz" -C /opt
rm -rf "$W"
cd /opt/harbor
PW="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
$SUDO cp harbor.yml.tmpl harbor.yml
$SUDO sed -i -e "s/^hostname:.*/hostname: $HH/" -e "s/^  port: 80\$/  port: $HP/" -e "s/^harbor_admin_password:.*/harbor_admin_password: $PW/" harbor.yml
$SUDO sed -i '/^https:/,/^  private_key:/ s/^/# /' harbor.yml
$SUDO chmod 600 harbor.yml
$SUDO ./install.sh
echo "$HV" | $SUDO tee /opt/harbor/.version >/dev/null
echo "Hoàn tất cài Harbor $HV."
echo "Địa chỉ: http://$HH:$HP   Tài khoản: admin   Mật khẩu: $PW"
echo "HÃY LƯU mật khẩu này ngay và đổi sau khi đăng nhập (cũng nằm trong /opt/harbor/harbor.yml, chỉ root đọc được)."
`;

  const HARBOR_UN = String.raw`linux_only "Harbor"
echo "=== Gỡ Harbor và xoá sạch dữ liệu ==="
DK="docker"
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then DK="$SUDO docker"; fi
DV=""
if [ -f /opt/harbor/harbor.yml ]; then DV="$($SUDO awk '/^data_volume:/ {print $2}' /opt/harbor/harbor.yml)"; fi
case "$DV" in /?*) ;; *) DV=/data ;; esac
echo "Sẽ xoá MỌI image/artifact đang lưu trong Harbor:"
show_path /opt/harbor
for d in database registry redis secret job_logs trivy-adapter ca_download cert scandata_exports; do show_path "$DV/$d"; done
begin 3
step "Dừng và xoá container Harbor"
if [ -f /opt/harbor/docker-compose.yml ]; then (cd /opt/harbor && $DK compose down -v) || true; fi
step "Xoá image Harbor"
IMGS=""
if command -v docker >/dev/null 2>&1; then IMGS="$($DK images --format '{{.Repository}}:{{.Tag}}' | grep '^goharbor/' || true)"; fi
if [ -n "$IMGS" ]; then $DK rmi -f $IMGS || true; fi
step "Xoá dữ liệu và thư mục cài"
for d in database registry redis secret job_logs trivy-adapter ca_download cert scandata_exports; do rmp "$DV/$d"; done
rmp /opt/harbor
$SUDO rmdir "$DV" 2>/dev/null || true
echo "Đã gỡ Harbor và xoá dữ liệu."
echo "##P done"
`;


  // ───────── Windows (PowerShell, chạy qua powershell.exe -EncodedCommand) ─────────
  const PRE_WIN = String.raw`$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "=== Kiểm tra trước khi cài ==="
Write-Host ("Máy: " + $env:COMPUTERNAME + " | User: " + $env:USERNAME + " | Hệ điều hành: " + [System.Environment]::OSVersion.VersionString)
$script:STEP = 0
$script:TOTAL = 1
function Begin($n) { $script:TOTAL = $n; $script:STEP = 0 }
function Step($t) { $script:STEP++; Write-Host ("##P " + $script:STEP + " " + $script:TOTAL + " " + $t) }
function Confirm-Go {
  $a = Read-Host "Tiếp tục cài đặt? [y/N]"
  if ($a -ne 'y' -and $a -ne 'Y') { Write-Host "Đã huỷ, chưa thay đổi gì."; exit 1 }
}
function Need-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Cần winget (App Installer của Microsoft): https://aka.ms/getwinget"
    exit 1
  }
}
function Wg {
  & winget @args
  $rc = $LASTEXITCODE
  if ($rc -ne 0 -and $rc -ne -1978335189 -and $rc -ne -1978335135) { Write-Host ("winget báo lỗi, mã " + $rc); exit 1 }
}
function Rmp($p) {
  if (Test-Path $p) {
    Write-Host ("  xoá " + $p)
    try { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop } catch { Write-Host ("  không xoá được " + $p + ": " + $_.Exception.Message) }
  }
}
function Show-Path($p) {
  if (Test-Path $p) {
    $m = Get-ChildItem -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    Write-Host ("  - " + $p + " (" + [math]::Round($m.Sum / 1MB, 1) + " MB)")
  }
}
function Kube-Pick {
  if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Host "Chưa có kubectl trên máy này. Cài bằng: winget install Kubernetes.kubectl"
    exit 1
  }
  kubectl --request-timeout=8s get ns *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host "Không kết nối được tới cluster Kubernetes nào (kubectl get ns thất bại)."; exit 1 }
  Write-Host ("Cluster đích: " + (kubectl config current-context))
  Write-Host ("API server: " + (kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'))
}
Write-Host ""
`;

  const DOCKER_WIN = String.raw`Need-Winget
if (Get-Command docker -ErrorAction SilentlyContinue) { Write-Host ("Docker đã được cài: " + (docker --version)) }
Write-Host "Windows: cài Docker Desktop bằng winget (không chọn được phiên bản). Cần bật WSL2 hoặc Hyper-V."
Confirm-Go
Wg install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements
Write-Host "Hoàn tất cài Docker Desktop. Hãy mở Docker Desktop một lần để khởi động engine; có thể cần khởi động lại máy."
`;

  const DOCKER_WIN_UN = String.raw`Need-Winget
Write-Host "=== Gỡ Docker và xoá sạch dữ liệu ==="
if (Get-Command docker -ErrorAction SilentlyContinue) {
  $c = (docker ps -aq 2>$null | Measure-Object).Count
  $i = (docker images -q 2>$null | Measure-Object).Count
  $v = (docker volume ls -q 2>$null | Measure-Object).Count
  Write-Host ("Hiện có: " + $c + " container, " + $i + " image, " + $v + " volume (TẤT CẢ sẽ bị xoá).")
}
Write-Host "Sẽ xoá:"
Write-Host "  - Docker Desktop (winget Docker.DockerDesktop) và các distro WSL docker-desktop"
Show-Path "$env:USERPROFILE\.docker"
Show-Path "$env:APPDATA\Docker"
Show-Path "$env:APPDATA\Docker Desktop"
Show-Path "$env:LOCALAPPDATA\Docker"
Show-Path "$env:ProgramData\DockerDesktop"
Begin 4
Step "Dừng Docker Desktop"
Get-Process -Name 'Docker Desktop', 'com.docker.backend', 'com.docker.proxy' -ErrorAction SilentlyContinue | Stop-Process -Force
Step "Gỡ ứng dụng Docker"
Wg uninstall --id Docker.DockerDesktop -e --silent
Step "Gỡ distro WSL của Docker"
if (Get-Command wsl -ErrorAction SilentlyContinue) {
  wsl --unregister docker-desktop 2>&1 | Out-Null
  wsl --unregister docker-desktop-data 2>&1 | Out-Null
}
Step "Xoá dữ liệu và cấu hình"
Rmp "$env:USERPROFILE\.docker"
Rmp "$env:APPDATA\Docker"
Rmp "$env:APPDATA\Docker Desktop"
Rmp "$env:LOCALAPPDATA\Docker"
Rmp "$env:ProgramData\DockerDesktop"
Write-Host "Đã gỡ Docker và xoá dữ liệu."
Write-Host "##P done"
`;

  const POSTGRES_WIN = String.raw`$PGV = "@VERSION@"
if ($PGV -notmatch '^[0-9]{2}$') { Write-Host "Phiên bản không hợp lệ: $PGV"; exit 1 }
Need-Winget
if (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue) { Write-Host "CẢNH BÁO: cổng 5432 đang được một tiến trình khác sử dụng." }
Write-Host ("Sẽ cài PostgreSQL " + $PGV + " bằng winget (PostgreSQL.PostgreSQL." + $PGV + "), user postgres, cổng 5432, mật khẩu tự sinh.")
Confirm-Go
$pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
Wg install --id ("PostgreSQL.PostgreSQL." + $PGV) -e --accept-package-agreements --accept-source-agreements --override ("--mode unattended --unattendedmodeui none --superpassword " + $pw)
$conf = "C:\Program Files\PostgreSQL\$PGV\data\postgresql.conf"
if (Test-Path $conf) {
  try {
    (Get-Content $conf) -replace "^\s*#?\s*listen_addresses\s*=.*", "listen_addresses = 'localhost'" | Set-Content $conf
    Restart-Service ("postgresql-x64-" + $PGV)
    Write-Host "Đã đặt listen_addresses = localhost."
  } catch {
    Write-Host "Chưa đặt được listen_addresses = 'localhost' (cần quyền quản trị). Hãy tự kiểm tra postgresql.conf để không mở cổng 5432 ra mạng."
  }
}
Write-Host ("Hoàn tất cài PostgreSQL " + $PGV + ". User: postgres   Mật khẩu: " + $pw)
Write-Host "HÃY LƯU mật khẩu này ngay. Không mở cổng 5432 ra internet nếu không cần."
`;

  const POSTGRES_WIN_UN = String.raw`Need-Winget
Write-Host "=== Gỡ PostgreSQL và xoá sạch dữ liệu ==="
Write-Host "Sẽ xoá TOÀN BỘ PostgreSQL trên máy này (mọi phiên bản) cùng MỌI cơ sở dữ liệu. Hãy chắc chắn đã sao lưu (pg_dump)."
$found = @()
foreach ($m in 13..19) {
  winget list --id ("PostgreSQL.PostgreSQL." + $m) -e --accept-source-agreements *> $null
  if ($LASTEXITCODE -eq 0) { $found += $m }
}
if ($found.Count -eq 0) { Write-Host "Không thấy PostgreSQL nào cài bằng winget." } else { Write-Host ("Phiên bản đang cài: " + ($found -join ", ")) }
foreach ($m in $found) { Show-Path ("C:\Program Files\PostgreSQL\" + $m) }
Begin 3
Step "Dừng dịch vụ PostgreSQL"
foreach ($m in $found) { Stop-Service -Name ("postgresql-x64-" + $m) -Force -ErrorAction SilentlyContinue }
Step "Gỡ PostgreSQL"
foreach ($m in $found) { Wg uninstall --id ("PostgreSQL.PostgreSQL." + $m) -e --silent }
Step "Xoá dữ liệu còn sót"
foreach ($m in $found) { Rmp ("C:\Program Files\PostgreSQL\" + $m) }
Write-Host "Đã gỡ PostgreSQL và xoá dữ liệu."
Write-Host "##P done"
`;

  const NGINX_WIN = String.raw`$NV = "@VERSION@"
if ($NV -ne 'stable' -and $NV -ne 'mainline') { Write-Host "Phiên bản không hợp lệ: $NV"; exit 1 }
if (Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue) { Write-Host "CẢNH BÁO: cổng 80 đang được một tiến trình khác sử dụng." }
$page = (Invoke-WebRequest -UseBasicParsing "https://nginx.org/en/download.html").Content
$vers = [regex]::Matches($page, 'nginx-(\d+\.\d+\.\d+)\.zip') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique | Sort-Object { [version]$_ } -Descending
$ver = $null
foreach ($v in $vers) {
  $minor = [int]($v.Split('.')[1])
  if (($NV -eq 'mainline' -and $minor % 2 -eq 1) -or ($NV -eq 'stable' -and $minor % 2 -eq 0)) { $ver = $v; break }
}
if (-not $ver) { Write-Host "Không đọc được phiên bản nginx từ nginx.org."; exit 1 }
$dir = Join-Path $env:LOCALAPPDATA ("Programs\nginx-" + $ver)
if (Test-Path $dir) { Write-Host ("Đã có " + $dir + ". Hãy gỡ bản cũ trước."); exit 1 }
Write-Host ("Sẽ tải nginx " + $ver + " (" + $NV + ") từ nginx.org vào " + $dir + " và chạy dưới tài khoản của bạn, chỉ nghe 127.0.0.1:80.")
Confirm-Go
$tmp = Join-Path $env:TEMP ("nginx-" + $ver + ".zip")
Invoke-WebRequest -UseBasicParsing ("https://nginx.org/download/nginx-" + $ver + ".zip") -OutFile $tmp
$ex = Join-Path $env:TEMP ("nginx-x-" + $ver)
if (Test-Path $ex) { Remove-Item -Recurse -Force $ex }
Expand-Archive -Path $tmp -DestinationPath $ex
New-Item -ItemType Directory -Force -Path (Split-Path $dir) | Out-Null
Move-Item -Path (Join-Path $ex ("nginx-" + $ver)) -Destination $dir
Remove-Item -Force $tmp
Remove-Item -Recurse -Force $ex
$cf = Join-Path $dir "conf\nginx.conf"
(Get-Content $cf) -replace "listen\s+80;", "listen       127.0.0.1:80;" | Set-Content $cf
Start-Process -FilePath (Join-Path $dir "nginx.exe") -WorkingDirectory $dir -WindowStyle Hidden
Write-Host ("Hoàn tất cài nginx " + $ver + " tại " + $dir)
Write-Host ("Dừng: taskkill /f /im nginx.exe    Chạy lại: " + (Join-Path $dir "nginx.exe"))
`;

  const NGINX_WIN_UN = String.raw`Write-Host "=== Gỡ Nginx và xoá sạch cấu hình ==="
Write-Host "Thư mục web của bạn nằm ngoài thư mục nginx nên KHÔNG bị xoá."
$base = Join-Path $env:LOCALAPPDATA "Programs"
$dirs = @(Get-ChildItem -Path $base -Directory -Filter "nginx-*" -ErrorAction SilentlyContinue)
Write-Host "Sẽ xoá:"
foreach ($d in $dirs) { Show-Path $d.FullName }
Begin 2
Step "Dừng Nginx"
Get-Process -Name nginx -ErrorAction SilentlyContinue | Stop-Process -Force
Step "Xoá thư mục nginx"
foreach ($d in $dirs) { Rmp $d.FullName }
Write-Host "Đã gỡ Nginx và xoá cấu hình."
Write-Host "##P done"
`;

  const CALICO_WIN = String.raw`$CV = "@VERSION@"
if ($CV -notmatch '^\d+\.\d+\.\d+$') { Write-Host "Phiên bản không hợp lệ: $CV"; exit 1 }
Kube-Pick
kubectl -n kube-system get ds calico-node *> $null
if ($LASTEXITCODE -eq 0) { Write-Host "Cluster này đã có Calico (calico-node)." }
$url = "https://raw.githubusercontent.com/projectcalico/calico/v$CV/manifests/calico.yaml"
Write-Host ("Sẽ chạy: kubectl apply -f " + $url)
Write-Host "Calico là plugin mạng (CNI) của cả cluster; hãy chắc chắn cluster đích ở trên là đúng."
Confirm-Go
kubectl apply -f $url
Write-Host "Chờ calico-node sẵn sàng (tối đa 5 phút)..."
kubectl -n kube-system rollout status ds/calico-node --timeout=300s
kubectl get nodes
Write-Host ("Hoàn tất cài Calico " + $CV + ".")
`;

  const CALICO_WIN_UN = String.raw`Write-Host "=== Gỡ Calico khỏi cluster ==="
Kube-Pick
$img = kubectl -n kube-system get ds calico-node -o jsonpath='{.spec.template.spec.containers[0].image}' 2>$null
$CV = ""
if ($img -match ':v([0-9][0-9.]*)$') { $CV = $Matches[1] }
if ($CV -eq "") { Write-Host "Không thấy Calico (calico-node) trong cluster này." } else { Write-Host ("Calico đang chạy: v" + $CV) }
Write-Host "Pod sẽ MẤT mạng cho tới khi có CNI khác."
Begin 1
Step "Xoá Calico khỏi cluster"
if ($CV -ne "") { kubectl delete -f ("https://raw.githubusercontent.com/projectcalico/calico/v" + $CV + "/manifests/calico.yaml") --ignore-not-found --timeout=180s }
Write-Host "Đã gỡ Calico."
Write-Host "##P done"
`;

  const ARGOCD_WIN = String.raw`$AV = "@VERSION@"
if ($AV -notmatch '^\d+\.\d+\.\d+$') { Write-Host "Phiên bản không hợp lệ: $AV"; exit 1 }
Kube-Pick
kubectl -n argocd get deploy argocd-server *> $null
if ($LASTEXITCODE -eq 0) { Write-Host "Cluster này đã có ArgoCD (namespace argocd)." }
$url = "https://raw.githubusercontent.com/argoproj/argo-cd/v$AV/manifests/install.yaml"
Write-Host ("Sẽ tạo namespace argocd và chạy: kubectl apply -n argocd --server-side -f " + $url)
Write-Host "Không mở cổng ra ngoài: giữ ClusterIP, truy cập bằng port-forward."
Confirm-Go
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd --server-side --force-conflicts -f $url
Write-Host "Chờ argocd-server sẵn sàng (tối đa 5 phút)..."
kubectl -n argocd rollout status deployment/argocd-server --timeout=300s
Write-Host ("Hoàn tất cài ArgoCD " + $AV + ".")
Write-Host "Truy cập an toàn: kubectl -n argocd port-forward svc/argocd-server 8080:443  rồi mở https://localhost:8080"
Write-Host "Mật khẩu admin ban đầu (PowerShell): [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}')))"
Write-Host "Sau khi đăng nhập hãy đổi mật khẩu và xoá secret argocd-initial-admin-secret."
`;

  const ARGOCD_WIN_UN = String.raw`Write-Host "=== Gỡ ArgoCD khỏi cluster ==="
Kube-Pick
$img = kubectl -n argocd get deploy argocd-server -o jsonpath='{.spec.template.spec.containers[0].image}' 2>$null
$AV = ""
if ($img -match ':v([0-9][0-9.]*)$') { $AV = $Matches[1] }
if ($AV -eq "") { Write-Host "Không thấy argocd-server trong namespace argocd." } else { Write-Host ("ArgoCD đang chạy: v" + $AV) }
$apps = @(kubectl get applications.argoproj.io -A --no-headers -o custom-columns=NS:.metadata.namespace,N:.metadata.name 2>$null)
Write-Host ("Các Application: " + $apps.Count)
Write-Host "Workload ArgoCD đã triển khai sẽ được GIỮ LẠI (script gỡ finalizer của Application trước khi xoá)."
Begin 3
Step "Giữ lại workload: gỡ finalizer của Application"
$pf = [System.IO.Path]::GetTempFileName()
Set-Content -Path $pf -Value '{"metadata":{"finalizers":null}}' -Encoding ascii
foreach ($l in $apps) {
  $p = ("" + $l).Trim() -split '\s+'
  if ($p.Count -ge 2) { kubectl -n $p[0] patch applications.argoproj.io $p[1] --type merge --patch-file $pf }
}
Remove-Item -Force $pf
Step "Xoá ArgoCD"
if ($AV -ne "") { kubectl delete -n argocd -f ("https://raw.githubusercontent.com/argoproj/argo-cd/v" + $AV + "/manifests/install.yaml") --ignore-not-found --timeout=180s }
Step "Xoá namespace và CRD"
kubectl delete crd applications.argoproj.io applicationsets.argoproj.io appprojects.argoproj.io --ignore-not-found --timeout=120s
kubectl delete namespace argocd --ignore-not-found --timeout=180s
Write-Host "Đã gỡ ArgoCD."
Write-Host "##P done"
`;

  const APPS = [
    {
      id: "docker", color: "#2496ED", sup: "Linux · macOS · Windows", only: "", name: "Docker", logo: "docker", os: OS,
      desc: "Docker Engine + Compose plugin (script chính thức get.docker.com)",
      versions: [
        { v: "", label: "Mới nhất (stable)" },
        { v: "29", label: "29.x" },
        { v: "28", label: "28.x" },
        { v: "27", label: "27.x" },
      ],
      script: DOCKER, uninstall: DOCKER_UN, win: { script: DOCKER_WIN, uninstall: DOCKER_WIN_UN },
    },
    {
      id: "postgres", color: "#4169E1", sup: "Linux · macOS · Windows", only: "", name: "PostgreSQL", logo: "postgres", os: OS,
      desc: "Cơ sở dữ liệu PostgreSQL từ repo chính thức PGDG",
      versions: [{ v: "18", label: "18" }, { v: "17", label: "17" }, { v: "16", label: "16" }, { v: "15", label: "15" }, { v: "14", label: "14" }],
      script: POSTGRES, uninstall: POSTGRES_UN, win: { script: POSTGRES_WIN, uninstall: POSTGRES_WIN_UN },
    },
    {
      id: "redis", color: "#FF4438", sup: "Linux · macOS", only: "", name: "Redis", logo: "redis", os: OS,
      desc: "Redis từ repo chính thức packages.redis.io (dùng cho cache, queue)",
      versions: [{ v: "", label: "Mới nhất" }, { v: "8.0", label: "8.0.x" }, { v: "7.4", label: "7.4.x" }, { v: "7.2", label: "7.2.x" }],
      script: REDIS, uninstall: REDIS_UN,
    },
    {
      id: "nginx", color: "#009639", sup: "Linux · macOS · Windows", only: "", name: "Nginx", logo: "nginx", os: OS,
      desc: "Web server / reverse proxy từ repo nginx.org",
      versions: [{ v: "stable", label: "stable" }, { v: "mainline", label: "mainline" }],
      script: NGINX, uninstall: NGINX_UN, win: { script: NGINX_WIN, uninstall: NGINX_WIN_UN },
    },
    {
      id: "k8s", color: "#326CE5", sup: "Chỉ Linux", only: "linux", name: "Kubernetes", logo: "k8s", os: "Debian/Ubuntu, RHEL/Rocky/Alma (Linux)",
      desc: "Cluster 1 node bằng kubeadm + containerd (repo pkgs.k8s.io)",
      versions: [{ v: "1.37", label: "1.37" }, { v: "1.36", label: "1.36" }, { v: "1.35", label: "1.35" }, { v: "1.34", label: "1.34" }],
      script: K8S, uninstall: K8S_UN,
    },
    {
      id: "calico", img: "assets/calico.png", color: "#F58220", sup: "Mọi OS có kubectl", only: "", name: "Calico", logo: "calico", os: "Cluster Kubernetes",
      desc: "Plugin mạng (CNI) cho cluster, cài bằng manifest chính thức",
      versions: [{ v: "3.33.0", label: "3.33.0" }, { v: "3.32.2", label: "3.32.2" }, { v: "3.31.7", label: "3.31.7" }, { v: "3.30.7", label: "3.30.7" }],
      script: CALICO, uninstall: CALICO_UN, win: { script: CALICO_WIN, uninstall: CALICO_WIN_UN },
    },
    {
      id: "argocd", color: "#EF7B4D", sup: "Mọi OS có kubectl", only: "", name: "ArgoCD", logo: "argocd", os: "Cluster Kubernetes",
      desc: "GitOps cho Kubernetes, giữ ClusterIP (truy cập bằng port-forward)",
      versions: [{ v: "3.5.6", label: "3.5.6" }, { v: "3.4.12", label: "3.4.12" }, { v: "3.3.17", label: "3.3.17" }],
      script: ARGOCD, uninstall: ARGOCD_UN, win: { script: ARGOCD_WIN, uninstall: ARGOCD_WIN_UN },
    },
    {
      id: "harbor", color: "#60B932", sup: "Chỉ Linux", only: "linux", name: "Harbor", logo: "harbor", os: "Linux có Docker",
      desc: "Registry cho image container (docker compose, mật khẩu admin tự sinh)",
      versions: [{ v: "2.15.4", label: "2.15.4" }, { v: "2.14.5", label: "2.14.5" }, { v: "2.13.6", label: "2.13.6" }],
      params: [
        { id: "HOST", label: "Tên miền hoặc IP để truy cập Harbor", ph: "harbor.example.com", re: "^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$" },
        { id: "PORT", label: "Cổng HTTP", ph: "8080", def: "8080", re: "^[0-9]{2,5}$" },
      ],
      script: HARBOR, uninstall: HARBOR_UN,
    },
  ];
  // Hiện không còn ứng dụng "Sắp có"
  const SOON = [];

  window.DEPLOY = {
    APPS,
    SOON,
    script(appId, version, method, mode, params, os) {
      const a = APPS.find((x) => x.id === appId);
      if (!a) return "";
      if (os === "win") {
        if (!a.win) return 'Write-Host "Ứng dụng này chưa hỗ trợ Windows."; exit 1';
        if (mode === "uninstall") return PRE_WIN + a.win.uninstall;
        let w = a.win.script.split("@VERSION@").join(version || "");
        (a.params || []).forEach((q) => { w = w.split("@" + q.id + "@").join((params && params[q.id]) || q.def || ""); });
        return PRE_WIN + w;
      }
      if (mode === "uninstall") return PRE + a.uninstall;
      let body = a.script.split("@METHOD@").join(method || "").split("@VERSION@").join(version || "");
      (a.params || []).forEach((q) => {
        const v = (params && params[q.id]) || q.def || "";
        body = body.split("@" + q.id + "@").join(v);
      });
      return PRE + body;
    },
  };
})();
