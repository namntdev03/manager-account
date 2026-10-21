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
- **npm registry**: lưu nhiều tài khoản npm (npmjs, GitHub Packages, registry riêng, có thể theo scope). Bấm dùng sẽ ghi token vào `~/.npmrc` (toàn máy) hoặc `.npmrc` của repo; token gốc vẫn nằm trong Keychain.
- **SSH host**: lưu danh sách máy chủ (địa chỉ, port, ghi chú) và các **tài khoản SSH** (username + key, key tuỳ chọn) ở mục Tài khoản → SSH. Trong menu SSH host, chọn tài khoản ở ô **Kết nối bằng** rồi bấm **Kết nối**: một terminal mở ngay trong app (tab) và chạy `ssh`, có thể mở nhiều tab cùng lúc. Danh sách host lưu ở `hosts.json` trong thư mục dữ liệu của app, không gửi đi đâu.
- **Ngôn ngữ**: Tiếng Việt và English (Cài đặt → Ngôn ngữ; mặc định theo ngôn ngữ hệ thống). Thêm ngôn ngữ mới: thêm một bảng trong `src/i18n.js`.

## Quyền riêng tư: dữ liệu chỉ nằm trên máy bạn

- Không có server của app, không tài khoản, không thống kê. Tài khoản, token và cấu hình chỉ nằm trên máy.
- Giao diện, font và icon đều đóng gói sẵn trong app; cửa sổ app bị khoá bằng CSP, không tải gì từ internet.
- App chỉ kết nối mạng trong **hai trường hợp**:
  1. **Kiểm tra bản cập nhật** (khi mở app, tắt được ở *Cài đặt*): một yêu cầu `GET` tới
     `api.github.com/repos/namntdev03/manager-account/releases/latest`. **Không gửi** bất kỳ dữ liệu nào của bạn
     (tên, email, token, key, danh sách tài khoản, đường dẫn repo). GitHub chỉ thấy IP như mọi lượt truy cập web.
  2. **Khi bạn bấm “Test kết nối”** trên một tài khoản: SSH tới `git@<host>`, hoặc gọi API `/user` của GitHub/GitLab
     để xác minh token. Chỉ tới đúng nền tảng của tài khoản đó.
- Việc `git push/pull` do chính git thực hiện, không đi qua app.
- App chỉ tải bản mới khi bạn bấm **Cập nhật ngay**: file lấy từ GitHub Releases của dự án và được kiểm tra chữ ký số (minisign) trước khi cài.

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

## Giấy phép

Mã nguồn được công khai để xem và tham khảo, **không phải phần mềm mã nguồn mở**.
Bạn được dùng app cho mục đích cá nhân/nội bộ; **không được** sao chép, sửa, phát hành lại, bán hoặc nhận là sản phẩm của mình.
Chi tiết trong file [LICENSE](LICENSE). Copyright © 2026 Nguyen Thanh Nam.

App hiển thị giấy phép trong menu **Giới thiệu** từ file `src/license.js`, được sinh tự động từ `LICENSE`
(`pnpm dev` / `pnpm build` tự chạy `scripts/sync-license.mjs`). Sửa `LICENSE` xong thì chạy lại một trong hai lệnh đó rồi commit cả `src/license.js`.


## Thành phần bên thứ ba

- [xterm.js](https://github.com/xtermjs/xterm.js) (MIT) cho terminal trong app, đóng gói sẵn trong `src/vendor/xterm`, kèm giấy phép `LICENSE-xterm.txt`.
- Font Plus Jakarta Sans (OFL), logo nền tảng từ Simple Icons (CC0).
