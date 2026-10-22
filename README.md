# Manager Account

Ứng dụng desktop (Tauri v2) để **quản lý tài khoản Git, npm và SSH**, kết nối server và sao lưu mọi thứ ngay trên máy bạn, chạy trên macOS, Windows và Linux.

- **Tài khoản Git** (GitHub/GitLab/Bitbucket, SSH key hoặc token): đổi bằng một cú bấm, toàn máy hoặc một repo; **quy tắc theo thư mục** tự dùng đúng tài khoản; tạo SSH key ed25519 trong app.
- **Tài khoản npm**: token cho npmjs, GitHub Packages hoặc registry riêng.
- **SSH host**: terminal nhiều tab trong app, tự điền mật khẩu/passphrase, **quản lý file** trên server qua SSH.
- **Kubernetes, ArgoCD, Harbor**: lưu kubeconfig (mã hoá), token ArgoCD và tài khoản Harbor, đổi bằng một cú bấm, có nhãn môi trường (dev/staging/production).
- **Kho lưu trữ**: sao lưu mọi thứ vào một file mã hoá bằng mật khẩu, khôi phục trên máy khác.
- **Hiệu năng**, **xác thực** (Touch ID / Windows Hello / mật khẩu) trước khi xem bí mật, Tiếng Việt và English.

## App làm gì khi bấm “Dùng tài khoản này”

| Chế độ | Việc app thực hiện (qua lệnh `git config`) |
|---|---|
| Chung | `user.name`, `user.email` |
| SSH key | `core.sshCommand = ssh -i '<key>' -o IdentitiesOnly=yes`, xoá `credential.https://<host>.username` |
| Token | xoá `core.sshCommand`, nạp token vào `git credential` (Keychain / Credential Manager / libsecret), đặt `credential.https://<host>.username` để git chọn đúng token |

- **Toàn máy**: ghi vào `~/.gitconfig` (`--global`).
- **Một repo**: ghi vào `.git/config` của repo bạn chọn (`--local`), repo khác không bị ảnh hưởng.
  Có thêm tuỳ chọn tự đổi remote SSH ⇄ HTTPS cho khớp kiểu đăng nhập.
- **Test kết nối**: SSH chạy `ssh -T git@<host>`; token gọi API `/user` của GitHub/GitLab để xem token thuộc tài khoản nào.
- **npm registry**: lưu nhiều tài khoản npm (npmjs, GitHub Packages, registry riêng, có thể theo scope). Bấm dùng sẽ ghi token vào `~/.npmrc` (toàn máy) hoặc `.npmrc` của repo; token gốc vẫn nằm trong Keychain.
- **SSH host**: lưu danh sách máy chủ (địa chỉ, port, ghi chú) và các **tài khoản SSH** (username + key, key tuỳ chọn) ở mục Tài khoản → SSH. Trong menu SSH host, chọn tài khoản ở ô **Kết nối bằng** rồi bấm **Kết nối**: một terminal mở ngay trong app (tab) và chạy `ssh`, có thể mở nhiều tab cùng lúc. Danh sách host lưu ở `hosts.json` trong thư mục dữ liệu của app, không gửi đi đâu.
- **Quy tắc theo thư mục**: gắn một thư mục với một tài khoản Git; app thêm `includeIf "gitdir:<thư mục>/"` vào `~/.gitconfig` trỏ tới một file cấu hình nhỏ trong thư mục dữ liệu (`rules/`). Mọi repo trong thư mục đó tự dùng đúng tài khoản. Xoá quy tắc thì các dòng này được gỡ.
- **Quản lý file trên SSH host**: duyệt, tải lên/xuống, tạo thư mục, đổi tên, xoá. Chạy qua `ssh` với các lệnh `ls`, `cat`, `tar`, `mkdir`, `mv`, `rm` (không dùng giao thức SFTP thật, nên không có phần trăm tiến độ).
- **Tạo SSH key**: nút tạo key ed25519 (`ssh-keygen`) trong form tài khoản Git, có sao chép public key và mở trang thêm key của GitHub/GitLab. Key chỉ nằm trong form cho tới khi bạn bấm Lưu.
- **Kho lưu trữ**: xuất tài khoản, bí mật, nội dung key, passphrase, SSH host và quy tắc ra file `.macbackup` mã hoá (Argon2id + ChaCha20-Poly1305). Khi khôi phục, dữ liệu được gộp vào dữ liệu hiện có; trùng mã thì hỏi bạn ghi đè hay giữ cả hai.
- **Kubernetes**: dán kubeconfig đã nhúng sẵn chứng chỉ (`kubectl config view --flatten --minify --raw`). App mã hoá thành file riêng (khoá trong kho bảo mật), bấm dùng sẽ ghi `~/.kube/config` và sao lưu file cũ thành `config.backup-<thời gian>`. Cluster đánh dấu production hỏi xác nhận trước khi đổi. Test dùng `kubectl get --raw /version`.
- **ArgoCD**: lưu địa chỉ và account token (nên tạo token riêng, quyền tối thiểu). Bấm dùng ghi `~/.config/argocd/config`, mỗi tài khoản là một context. Test gọi `/api/v1/session/userinfo`. Nếu ArgoCD không mở ra ngoài, dùng `https://localhost:8080` sau `kubectl port-forward` và bật tuỳ chọn chứng chỉ tự ký.
- **Harbor**: lưu địa chỉ, username (nên dùng robot account) và mật khẩu/secret. Bấm dùng chạy `docker login`. Test gọi `/api/v2.0/projects`.
- **Hiệu năng**: RAM, CPU và số phiên SSH mà chính app đang dùng.
- **Ngôn ngữ**: Tiếng Việt và English (Cài đặt → Ngôn ngữ; mặc định theo ngôn ngữ hệ thống). Thêm ngôn ngữ mới: thêm một bảng trong `src/i18n.js`.

## Quyền riêng tư: dữ liệu chỉ nằm trên máy bạn

- Không có server của app, không tài khoản, không thống kê, không quảng cáo, không chia sẻ dữ liệu cho bên thứ ba.
- Thông tin tài khoản, SSH host và quy tắc nằm trong thư mục dữ liệu của app; **token, mật khẩu SSH và passphrase nằm trong kho bảo mật của hệ điều hành** (Keychain / Credential Manager / Secret Service).
- Giao diện, font và icon đều đóng gói sẵn trong app; cửa sổ app bị khoá bằng CSP, không tải gì từ internet.
- App chỉ kết nối mạng khi:
  1. **Kiểm tra bản cập nhật** (khi mở app, tắt được ở *Cài đặt*): một yêu cầu `GET` tới
     `api.github.com/repos/namntdev03/manager-account/releases/latest`, không gửi dữ liệu nào của bạn.
  2. **Bạn bấm “Cập nhật ngay”**: tải file từ GitHub Releases của dự án, kiểm tra chữ ký số (minisign) trước khi cài.
  3. **Bạn bấm “Test kết nối”**: SSH tới `git@<host>`, gọi API của GitHub/GitLab, npm registry, ArgoCD, Harbor hoặc `kubectl get --raw /version` tới cluster, chỉ tới đúng nền tảng hoặc máy chủ của tài khoản đó.
  4. **Bạn mở terminal hoặc quản lý file của một SSH host**: kết nối SSH tới chính máy chủ đó.
  5. **Bạn bấm “Mở trang thêm key”**: app mở trình duyệt tới trang SSH key của GitHub/GitLab, không gửi gì kèm theo.
- App không bao giờ gửi tên, email, token, mật khẩu, key, danh sách tài khoản/host hay đường dẫn repo tới bất kỳ đâu.
- `git push/pull` do chính git thực hiện, không đi qua app.
- **Kho lưu trữ**: file sao lưu chứa mọi bí mật và được mã hoá bằng mật khẩu bạn đặt. App không giữ mật khẩu đó và không tự tải file đi đâu; mất mật khẩu thì không mở lại được file.
- **Xác thực**: xem token/mật khẩu/key/passphrase hoặc tạo file sao lưu sẽ hỏi Touch ID / mật khẩu máy (macOS), Windows Hello/PIN (Windows), pkexec (Linux). Bật mặc định, tắt ở *Cài đặt*, nhớ 120 giây. Tính năng này chặn người khác dùng ké khi app đang mở, nhưng không ngăn phần mềm khác chạy dưới tài khoản của bạn đọc trực tiếp kho bảo mật của hệ điều hành.

## Cài trên macOS (bản tải từ Releases)

Bản phát hành được **ký ad-hoc** (miễn phí, chưa công chứng Apple). Lần đầu mở, macOS có thể chặn:
bấm chuột phải vào app → **Mở** → **Mở**. Nếu báo “đã bị hỏng”, chạy:

```bash
xattr -cr "/Applications/Manager Account.app"
```

Muốn mở thẳng không cảnh báo cần ký bằng tài khoản Apple Developer và công chứng (notarize).

## Thiết lập cập nhật tự động (làm một lần)

App tự tải và cài bản mới bằng plugin updater của Tauri. Cần một cặp khoá ký:

```bash
# 1. Tạo cặp khoá (đặt mật khẩu hoặc để trống). TUYỆT ĐỐI giữ kín và sao lưu file .key
pnpm tauri signer generate -w ~/.tauri/manager-account.key

# 2. Ghi public key (file .key.pub) vào src-tauri/tauri.conf.json
pnpm set:pubkey
```

3. Vào GitHub repo → **Settings → Secrets and variables → Actions** → thêm 2 secret:
   - `TAURI_SIGNING_PRIVATE_KEY`: toàn bộ nội dung file `~/.tauri/manager-account.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: mật khẩu đã đặt (để trống nếu không đặt)
4. Commit và phát hành bản mới (xem bên dưới). Bản đầu tiên có updater phải được cài thủ công;
   từ bản sau trở đi người dùng cập nhật ngay trong app.

> Mất private key thì các bản đã cài không thể nhận cập nhật nữa. Không bao giờ commit file `.key` lên git.

## Phát hành bản mới

1. Tăng `version` trong `src-tauri/tauri.conf.json` (và `Cargo.toml`, `package.json` cho khớp), ví dụ `0.2.0`.
2. Commit, rồi tạo tag và push: `git tag v0.2.0 && git push origin v0.2.0`.
3. GitHub Actions build cả 3 hệ điều hành và đăng lên **Releases**; app của người dùng sẽ báo có bản mới.

## Bảo mật

- Token, mật khẩu SSH và passphrase nằm trong kho bảo mật của hệ điều hành (crate `keyring`, service `manager-account`), **không** ghi vào `profiles.json`.
- `profiles.json`, `hosts.json`, `rules.json` chỉ chứa thông tin không nhạy cảm (tên, email, host, đường dẫn key). Chúng nằm trong thư mục dữ liệu của app, cùng `security.json` (cài đặt xác thực) và `rules/`:
  - macOS: `~/Library/Application Support/com.nguyenthanhnam.manageraccount/`
  - Windows: `%APPDATA%\com.nguyenthanhnam.manageraccount\`
  - Linux: `~/.local/share/com.nguyenthanhnam.manageraccount/`
- Private key dán vào app được lưu thành file riêng với quyền `600`. Kubeconfig được mã hoá (ChaCha20-Poly1305) thành `kube/<id>.enc`, khoá 32 byte nằm trong kho bảo mật (Credential Manager giới hạn độ dài nên không chứa trực tiếp được kubeconfig).
- Token ArgoCD ghi vào `~/.config/argocd/config` ở dạng chữ thường (CLI `argocd` yêu cầu vậy), file có quyền `600`.
- Token khi test được đưa cho `curl` qua stdin, không hiện trong danh sách tiến trình.
- Mật khẩu SSH và passphrase của key được lưu trong kho bảo mật và điền tự động qua `SSH_ASKPASS` (chính file chạy của app đóng vai trò askpass, đọc kho bảo mật rồi trả lời cho `ssh`, không ghi ra file). Nếu chưa lưu thì `ssh` chạy ở chế độ không hỏi (BatchMode) cho phần quản lý file; lúc đó có thể nạp key vào `ssh-agent` (`ssh-add <key>`).
- SSH dùng `StrictHostKeyChecking=accept-new`: lần đầu tự tin máy chủ mới, sau đó báo lỗi nếu khoá máy chủ đổi.
- **Gỡ sạch dữ liệu**: xoá thư mục dữ liệu ở trên, mục `manager-account` trong Keychain / Credential Manager, và các dòng `includeIf` do app thêm trong `~/.gitconfig`.

## Yêu cầu để chạy / build

Cần cài: **Node.js 18+**, **pnpm** (`npm i -g pnpm` hoặc `brew install pnpm`), **Rust (rustup)**, **git**.

- **macOS**: `xcode-select --install`
- **Windows**: Microsoft C++ Build Tools + WebView2 (Windows 10/11 thường có sẵn)
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev pkg-config
  ```
  Để lưu token cần một Secret Service đang chạy (GNOME Keyring / KWallet).

## Chạy thử

```bash
pnpm install
pnpm dev
```

## Build file cài đặt

```bash
pnpm build
```

Kết quả nằm ở `src-tauri/target/release/bundle/`:
`.dmg`/`.app` (macOS), `.msi`/`.exe` (Windows), `.deb`/`.rpm`/`.AppImage` (Linux).
Mỗi hệ điều hành phải build trên chính hệ điều hành đó.

### Build cả 3 hệ điều hành bằng GitHub Actions

Đẩy project lên GitHub rồi vào **Actions → “Build (macOS, Windows, Linux)” → Run workflow**
(hoặc push tag dạng `v0.1.0`). File cài đặt nằm ở mục Artifacts của lần chạy.

## Cấu trúc

```
src/               giao diện (HTML/CSS/JS thuần, không cần bundler)
src-tauri/src/lib.rs   backend Rust: profile, git config, keychain, SSH/terminal, quản lý file, quy tắc, sao lưu, xác thực
src-tauri/tauri.conf.json
.github/workflows/build.yml
```

## Lưu ý

- Windows/macOS: app gọi `git`, `ssh`, `curl` có sẵn trên máy. Nếu thiếu `git`, app sẽ báo ngay trên giao diện.
- Nếu máy chưa cấu hình `credential.helper`, app tự đặt mặc định: `osxkeychain` (macOS), `manager` (Windows),
  `libsecret` nếu có (Linux), nếu không có thì `store` (lưu file `~/.git-credentials`, không mã hoá).
- Nếu bạn dùng `includeIf` trong `~/.gitconfig` (kể cả các dòng do *Quy tắc theo thư mục* thêm), giá trị trong `includeIf` sẽ ghi đè cấu hình toàn máy do app đặt, đúng với mục đích của quy tắc.

## Giấy phép

Mã nguồn được công khai để xem và tham khảo, **không phải phần mềm mã nguồn mở**.
Bạn được dùng app cho mục đích cá nhân/nội bộ; **không được** sao chép, sửa, phát hành lại, bán hoặc nhận là sản phẩm của mình.
Chi tiết trong file [LICENSE](LICENSE). Copyright © 2026 Nguyen Thanh Nam.

App hiển thị giấy phép trong menu **Giới thiệu** từ file `src/license.js`, được sinh tự động từ `LICENSE`
(`pnpm dev` / `pnpm build` tự chạy `scripts/sync-license.mjs`). Sửa `LICENSE` xong thì chạy lại một trong hai lệnh đó rồi commit cả `src/license.js`.


## Thành phần bên thứ ba

- [xterm.js](https://github.com/xtermjs/xterm.js) (MIT) cho terminal trong app, đóng gói sẵn trong `src/vendor/xterm`, kèm giấy phép `LICENSE-xterm.txt`.
- Font Plus Jakarta Sans (OFL), logo nền tảng từ Simple Icons (CC0).
