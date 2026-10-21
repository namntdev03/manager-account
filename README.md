# Manager Account

Ứng dụng desktop (Tauri v2) để **đổi nhanh giữa nhiều tài khoản Git** trên macOS, Windows và Linux.
Mỗi tài khoản (profile) do bạn tự nhập một lần: `user.name`, `user.email` và cách đăng nhập
(**SSH key** hoặc **Personal Access Token**). Sau đó chỉ cần bấm **“Dùng tài khoản này”**.

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

## Bảo mật

- Token nằm trong kho bảo mật của hệ điều hành (crate `keyring`), **không** ghi vào `profiles.json`.
- `profiles.json` chỉ chứa thông tin không nhạy cảm (tên, email, đường dẫn key). Nó nằm trong thư mục dữ liệu của app:
  - macOS: `~/Library/Application Support/com.nguyenthanhnam.manageraccount/`
  - Windows: `%APPDATA%\com.nguyenthanhnam.manageraccount\`
  - Linux: `~/.local/share/com.nguyenthanhnam.manageraccount/`
- Private key dán vào app được lưu thành file riêng với quyền `600`.
- Token khi test được đưa cho `curl` qua stdin, không hiện trong danh sách tiến trình.
- Key có passphrase: nạp vào `ssh-agent` trước (`ssh-add <key>`), vì app chạy `ssh` ở chế độ không hỏi (BatchMode).

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
src-tauri/src/lib.rs   backend Rust: lưu profile, git config, keychain, test kết nối
src-tauri/tauri.conf.json
.github/workflows/build.yml
```

## Lưu ý

- Windows/macOS: app gọi `git`, `ssh`, `curl` có sẵn trên máy. Nếu thiếu `git`, app sẽ báo ngay trên giao diện.
- Nếu máy chưa cấu hình `credential.helper`, app tự đặt mặc định: `osxkeychain` (macOS), `manager` (Windows),
  `libsecret` nếu có (Linux), nếu không có thì `store` (lưu file `~/.git-credentials`, không mã hoá).
- Nếu bạn dùng `includeIf` trong `~/.gitconfig`, giá trị trong `includeIf` có thể ghi đè cấu hình toàn máy do app đặt.
