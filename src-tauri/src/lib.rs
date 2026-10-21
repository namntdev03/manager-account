use serde::{Deserialize, Serialize};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const KEYRING_SERVICE: &str = "manager-account";
/// Repo GitHub chứa các bản phát hành (Releases) của app
const UPDATE_REPO: &str = "namntdev03/manager-account";

// ───────────────────────── Kiểu dữ liệu ─────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Profile {
    id: String,
    name: String,
    host: String,
    user_name: String,
    user_email: String,
    /// "ssh" hoặc "token"
    auth: String,
    /// username đăng nhập (chế độ token)
    #[serde(default)]
    login: String,
    #[serde(default)]
    ssh_key_path: String,
    /// token đã được lưu trong keychain của hệ điều hành
    #[serde(default)]
    has_token: bool,
    /// "git" (mặc định) hoặc "npm"
    #[serde(default = "default_kind")]
    kind: String,
    /// npm: URL registry, ví dụ https://registry.npmjs.org/
    #[serde(default)]
    registry: String,
    /// npm: scope tuỳ chọn, ví dụ @congty (trống = registry mặc định)
    #[serde(default)]
    scope: String,
}

fn default_kind() -> String {
    "git".to_string()
}

#[derive(Deserialize)]
struct ProfileInput {
    id: Option<String>,
    name: String,
    host: String,
    user_name: String,
    user_email: String,
    auth: String,
    login: Option<String>,
    ssh_key_path: Option<String>,
    ssh_private_key: Option<String>,
    token: Option<String>,
    kind: Option<String>,
    registry: Option<String>,
    scope: Option<String>,
}

#[derive(Serialize)]
struct Current {
    git_version: String,
    name: String,
    email: String,
    ssh_command: String,
    credential_users: Vec<String>,
    remotes: Vec<String>,
    /// các tài khoản đang hoạt động (mỗi nền tảng có thể có một)
    active_ids: Vec<String>,
}

#[derive(Serialize)]
struct TestResult {
    ok: bool,
    message: String,
}

#[derive(Serialize)]
struct UpdateInfo {
    current: String,
    latest: String,
    has_update: bool,
    none_published: bool,
    url: String,
    notes: String,
}

struct Out {
    ok: bool,
    stdout: String,
    stderr: String,
}

// ───────────────────────── Chạy lệnh ─────────────────────────

fn new_cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(unix)]
    {
        // App mở từ Finder/menu thường có PATH rất ngắn
        let p = std::env::var("PATH").unwrap_or_default();
        c.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{p}"));
    }
    c.env("GIT_TERMINAL_PROMPT", "0");
    c
}

fn run_cmd(mut c: Command, stdin: Option<&str>) -> Result<Out, String> {
    let prog = c.get_program().to_string_lossy().to_string();
    c.stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = c.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("Không tìm thấy lệnh `{prog}`. Hãy cài đặt rồi thử lại.")
        } else {
            format!("Không chạy được `{prog}`: {e}")
        }
    })?;
    if let Some(s) = stdin {
        if let Some(mut si) = child.stdin.take() {
            let _ = si.write_all(s.as_bytes());
        }
    }
    let o = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(Out {
        ok: o.status.success(),
        stdout: String::from_utf8_lossy(&o.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&o.stderr).trim().to_string(),
    })
}

fn git(repo: Option<&str>, args: &[&str], stdin: Option<&str>) -> Result<Out, String> {
    let mut c = new_cmd("git");
    if let Some(r) = repo {
        c.arg("-C").arg(r);
    }
    c.args(args);
    run_cmd(c, stdin)
}

fn git_ok(repo: Option<&str>, args: &[&str], stdin: Option<&str>) -> Result<Out, String> {
    let o = git(repo, args, stdin)?;
    if o.ok {
        Ok(o)
    } else if o.stderr.is_empty() {
        Err(o.stdout)
    } else {
        Err(o.stderr)
    }
}

// ───────────────────────── Tiện ích ─────────────────────────

fn home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default()
}

fn expand(p: &str) -> String {
    let p = p.trim();
    if p == "~" {
        home()
    } else if let Some(r) = p.strip_prefix("~/") {
        format!("{}/{}", home(), r)
    } else {
        p.to_string()
    }
}

fn new_id() -> String {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("p{:x}", n)
}

fn norm_host(h: &str) -> String {
    let mut s = h.trim().to_lowercase();
    for p in ["https://", "http://", "ssh://", "git@"] {
        let t = s.strip_prefix(p).map(|r| r.to_string());
        if let Some(t) = t {
            s = t;
        }
    }
    s.trim_end_matches('/').to_string()
}

/// Ẩn mật khẩu/token nếu nằm trong URL (https://user:token@host/...)
fn mask(s: &str) -> String {
    if let Some(i) = s.find("://") {
        let rest = &s[i + 3..];
        if let Some(at) = rest.find('@') {
            let slash = rest.find('/').unwrap_or(rest.len());
            if at < slash {
                return format!("{}://***@{}", &s[..i], &rest[at + 1..]);
            }
        }
    }
    s.to_string()
}

fn ssh_command(key_path: &str) -> String {
    let p = expand(key_path).replace('\\', "/");
    format!("ssh -i '{}' -o IdentitiesOnly=yes", p.replace('\'', "'\\''"))
}

fn entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, id).map_err(|e| format!("Lỗi keychain: {e}"))
}

// ───────────────────────── npm registry (.npmrc) ─────────────────────────

/// "registry.company.com/npm" -> "https://registry.company.com/npm/"
fn norm_registry(r: &str) -> String {
    let mut s = r.trim().to_string();
    if !s.contains("://") {
        s = format!("https://{s}");
    }
    format!("{}/", s.trim_end_matches('/'))
}

/// "https://npm.pkg.github.com/" -> "npm.pkg.github.com"
fn registry_host(reg: &str) -> String {
    let s = reg.split("://").nth(1).unwrap_or(reg);
    s.split('/').next().unwrap_or("").to_lowercase()
}

/// khoá xác thực trong .npmrc: //npm.pkg.github.com/:_authToken
fn npm_auth_key(reg: &str) -> String {
    let s = reg.split("://").nth(1).unwrap_or(reg);
    format!("//{}:_authToken", s.trim_end_matches('/').to_string() + "/")
}

fn npmrc_path(repo: Option<&str>) -> PathBuf {
    match repo {
        Some(r) => PathBuf::from(r).join(".npmrc"),
        None => PathBuf::from(expand("~/.npmrc")),
    }
}

fn npmrc_get(path: &PathBuf, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    for line in text.lines() {
        if let Some((k, v)) = line.split_once('=') {
            if k.trim() == key {
                return Some(v.trim().trim_matches('"').to_string());
            }
        }
    }
    None
}

/// Đặt một khoá trong .npmrc, giữ nguyên các dòng khác. Quyền 600 trên macOS/Linux.
fn npmrc_set(path: &PathBuf, key: &str, val: &str) -> Result<(), String> {
    let text = fs::read_to_string(path).unwrap_or_default();
    let mut out: Vec<String> = vec![];
    let mut done = false;
    for line in text.lines() {
        let is_key = line.split_once('=').map(|(k, _)| k.trim() == key).unwrap_or(false);
        if is_key {
            if !done {
                out.push(format!("{key}={val}"));
                done = true;
            }
        } else {
            out.push(line.to_string());
        }
    }
    if !done {
        out.push(format!("{key}={val}"));
    }
    let mut body = out.join("\n");
    body.push('\n');
    fs::write(path, body).map_err(|e| format!("Không ghi được {}: {e}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ───────────────────────── Tài khoản SSH & SSH host ─────────────────────────

/// Chỉ cho phép ký tự an toàn (chữ, số, . _ - :) và không bắt đầu bằng '-', để không bị
/// hiểu nhầm thành tuỳ chọn của ssh hay chèn lệnh vào shell.
fn valid_ident(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('-')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || "._-:".contains(c))
}

fn save_ssh_profile(app: &tauri::AppHandle, input: ProfileInput) -> Result<Profile, String> {
    let mut list = load_profiles(app)?;
    let name = input.name.trim().to_string();
    let user = input.login.as_deref().map(str::trim).unwrap_or("").to_string();
    if name.is_empty() {
        return Err("Cần nhập tên hiển thị".into());
    }
    if !valid_ident(&user) {
        return Err("Username SSH không hợp lệ (chỉ gồm chữ, số, . _ -)".into());
    }
    let id = input.id.clone().filter(|s| !s.is_empty()).unwrap_or_else(new_id);
    let existing = list.iter().find(|p| p.id == id).cloned();

    let mut key_path = String::new();
    let pasted = input.ssh_private_key.as_deref().map(str::trim).unwrap_or("");
    if !pasted.is_empty() {
        key_path = write_key(app, &id, pasted)?;
    } else {
        let given = input.ssh_key_path.as_deref().map(str::trim).unwrap_or("");
        if !given.is_empty() {
            key_path = given.to_string();
        } else if let Some(e) = &existing {
            key_path = e.ssh_key_path.clone();
        }
    }
    if !key_path.is_empty() && !PathBuf::from(expand(&key_path)).exists() {
        return Err(format!("Không thấy file key: {}", expand(&key_path)));
    }

    // mật khẩu (tuỳ chọn): lưu trong keychain, để trống = giữ nguyên
    let pw = input.token.as_deref().map(str::trim).unwrap_or("");
    let mut has_pw = existing.as_ref().map(|e| e.has_token).unwrap_or(false);
    if !pw.is_empty() {
        entry(&id)?
            .set_password(pw)
            .map_err(|e| format!("Không lưu được mật khẩu vào keychain: {e}"))?;
        has_pw = true;
    }

    let p = Profile {
        id: id.clone(),
        name,
        host: "ssh".to_string(),
        user_name: String::new(),
        user_email: String::new(),
        auth: "ssh".to_string(),
        login: user,
        ssh_key_path: key_path,
        has_token: has_pw,
        kind: "ssh".to_string(),
        registry: String::new(),
        scope: String::new(),
    };
    if let Some(i) = list.iter().position(|x| x.id == id) {
        list[i] = p.clone();
    } else {
        list.push(p.clone());
    }
    save_profiles(app, &list)?;
    Ok(p)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Host {
    id: String,
    name: String,
    address: String,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default)]
    note: String,
}

fn default_port() -> u16 {
    22
}

#[derive(Deserialize)]
struct HostInput {
    id: Option<String>,
    name: String,
    address: String,
    port: Option<u16>,
    note: Option<String>,
}

fn load_hosts(app: &tauri::AppHandle) -> Result<Vec<Host>, String> {
    let f = data_dir(app)?.join("hosts.json");
    if !f.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(&f).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| format!("File hosts.json bị lỗi: {e}"))
}

fn save_hosts(app: &tauri::AppHandle, list: &[Host]) -> Result<(), String> {
    let f = data_dir(app)?.join("hosts.json");
    let s = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(f, s).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_hosts(app: tauri::AppHandle) -> Result<Vec<Host>, String> {
    load_hosts(&app)
}

#[tauri::command]
async fn save_host(app: tauri::AppHandle, input: HostInput) -> Result<Host, String> {
    let mut list = load_hosts(&app)?;
    let name = input.name.trim().to_string();
    let address = input.address.trim().to_string();
    if name.is_empty() || address.is_empty() {
        return Err("Cần nhập đủ: tên hiển thị và địa chỉ (IP hoặc domain)".into());
    }
    if !valid_ident(&address) {
        return Err("Địa chỉ không hợp lệ (chỉ gồm chữ, số, . - : _)".into());
    }
    let port = input.port.unwrap_or(22);
    if port == 0 {
        return Err("Port không hợp lệ".into());
    }
    let id = input.id.clone().filter(|s| !s.is_empty()).unwrap_or_else(new_id);
    let h = Host {
        id: id.clone(),
        name,
        address,
        port,
        note: input.note.as_deref().map(str::trim).unwrap_or("").to_string(),
    };
    if let Some(i) = list.iter().position(|x| x.id == id) {
        list[i] = h.clone();
    } else {
        list.push(h.clone());
    }
    save_hosts(&app, &list)?;
    Ok(h)
}

#[tauri::command]
async fn delete_host(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut list = load_hosts(&app)?;
    list.retain(|x| x.id != id);
    save_hosts(&app, &list)
}

/// Biến môi trường để ssh tự điền mật khẩu: chính app này đóng vai trò SSH_ASKPASS
/// (xem `askpass_mode`), mật khẩu đọc từ keychain lúc cần, không ghi ra file.
type SshEnv = Vec<(String, String)>;

fn ssh_args(h: &Host, acct: Option<&Profile>) -> Result<(Vec<String>, SshEnv), String> {
    let mut a: Vec<String> = vec![];
    let mut envs: SshEnv = vec![];
    let mut has_key = false;
    if let Some(p) = acct {
        if !p.ssh_key_path.trim().is_empty() {
            let k = expand(&p.ssh_key_path);
            if !PathBuf::from(&k).exists() {
                return Err(format!("Không thấy file key: {k}"));
            }
            a.extend(["-i".to_string(), k, "-o".to_string(), "IdentitiesOnly=yes".to_string()]);
            has_key = true;
        }
        if p.has_token {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            envs.push(("SSH_ASKPASS".to_string(), exe.to_string_lossy().to_string()));
            envs.push(("SSH_ASKPASS_REQUIRE".to_string(), "force".to_string()));
            envs.push(("MA_ASKPASS_ID".to_string(), p.id.clone()));
            if !has_key {
                // chỉ dùng mật khẩu: bỏ qua các key trong ssh-agent để khỏi bị server từ chối vì thử quá nhiều key
                a.extend([
                    "-o".to_string(),
                    "PubkeyAuthentication=no".to_string(),
                    "-o".to_string(),
                    "PreferredAuthentications=password,keyboard-interactive".to_string(),
                ]);
            }
        }
    }
    a.extend(["-o".to_string(), "StrictHostKeyChecking=accept-new".to_string()]);
    if h.port != 22 {
        a.extend(["-p".to_string(), h.port.to_string()]);
    }
    let target = match acct {
        Some(p) if !p.login.is_empty() => format!("{}@{}", p.login, h.address),
        _ => h.address.clone(),
    };
    a.push(target);
    Ok((a, envs))
}

/// Khi ssh gọi lại app này như chương trình SSH_ASKPASS (có biến MA_ASKPASS_ID),
/// in mật khẩu lấy từ keychain ra stdout rồi thoát, không mở giao diện.
fn askpass_mode(id: &str) {
    let prompt = std::env::args().nth(1).unwrap_or_default().to_lowercase();
    if prompt.contains("password") {
        if let Ok(pw) = entry(id).and_then(|e| e.get_password().map_err(|e| e.to_string())) {
            println!("{pw}");
            return;
        }
    }
    std::process::exit(1);
}

// ───────────────────────── SFTP / quản lý file qua ssh ─────────────────────────

fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Chạy một lệnh trên server qua `ssh` (dùng lại tài khoản/askpass như terminal).
/// stdin/stdout có thể nối thẳng với file cục bộ để upload/download.
fn remote_run(
    app: &tauri::AppHandle,
    host_id: &str,
    account_id: &str,
    cmd: &str,
    stdin: Option<std::process::Stdio>,
    stdout_path: Option<&str>,
) -> Result<Vec<u8>, String> {
    let hosts = load_hosts(app)?;
    let h = hosts
        .iter()
        .find(|x| x.id == host_id)
        .ok_or("Không tìm thấy SSH host này")?;
    let acct = if account_id.is_empty() { None } else { Some(find_profile(app, account_id)?) };
    let (mut args, envs) = ssh_args(h, acct.as_ref())?;
    if !acct.as_ref().map(|p| p.has_token).unwrap_or(false) {
        // không có mật khẩu lưu: không có terminal để hỏi, nên không chờ nhập
        args.splice(0..0, ["-o".to_string(), "BatchMode=yes".to_string()]);
    }
    args.push(cmd.to_string());
    let mut c = std::process::Command::new("ssh");
    c.args(&args);
    #[cfg(unix)]
    {
        let p = std::env::var("PATH").unwrap_or_default();
        c.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{p}"));
    }
    for (k, v) in &envs {
        c.env(k, v);
    }
    c.stdin(stdin.unwrap_or_else(std::process::Stdio::null));
    c.stdout(match stdout_path {
        Some(f) => std::process::Stdio::from(
            std::fs::File::create(f).map_err(|e| format!("Không tạo được file {f}: {e}"))?,
        ),
        None => std::process::Stdio::piped(),
    });
    c.stderr(std::process::Stdio::piped());
    let out = c
        .output()
        .map_err(|e| format!("Không chạy được `ssh`: {e}. Hãy cài OpenSSH rồi thử lại."))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() { "Lệnh trên server thất bại".to_string() } else { err });
    }
    Ok(out.stdout)
}

#[derive(Serialize)]
struct FtpEntry {
    name: String,
    dir: bool,
    size: u64,
    mtime: String,
}

#[derive(Serialize)]
struct FtpListing {
    path: String,
    entries: Vec<FtpEntry>,
}

fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-'
}

/// Tách một dòng `ls -l` (GNU long-iso hoặc BSD) thành (tên, kích thước, thời gian).
fn parse_ls(line: &str) -> Option<(String, u64, String)> {
    let mut idx = 0usize;
    let mut parts: Vec<&str> = vec![];
    let bytes = line.as_bytes();
    let mut need = 8usize;
    while idx < line.len() {
        while idx < line.len() && bytes[idx] == b' ' {
            idx += 1;
        }
        if idx >= line.len() {
            break;
        }
        if parts.len() >= need {
            parts.push(&line[idx..]);
            break;
        }
        let st = idx;
        while idx < line.len() && bytes[idx] != b' ' {
            idx += 1;
        }
        parts.push(&line[st..idx]);
        if parts.len() == 6 {
            need = if is_iso_date(parts[5]) { 7 } else { 8 };
        }
    }
    if parts.len() <= need {
        return None;
    }
    let size = parts[4].parse::<u64>().unwrap_or(0);
    let mtime = if need == 7 { format!("{} {}", parts[5], parts[6]) } else { format!("{} {} {}", parts[5], parts[6], parts[7]) };
    let name = parts[need].to_string();
    let name = name.split(" -> ").next().unwrap_or(&name).to_string();
    Some((name, size, mtime))
}

fn split_remote(path: &str) -> (String, String) {
    let t = path.trim_end_matches('/');
    match t.rsplit_once('/') {
        Some(("", n)) => ("/".to_string(), n.to_string()),
        Some((d, n)) => (d.to_string(), n.to_string()),
        None => (".".to_string(), t.to_string()),
    }
}

#[tauri::command]
async fn sftp_list(
    app: tauri::AppHandle,
    host_id: String,
    account_id: String,
    path: String,
) -> Result<FtpListing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cd = if path.trim().is_empty() { "cd".to_string() } else { format!("cd -- {}", sh_quote(&path)) };
        let cmd = format!(
            "{cd} && pwd && {{ LC_ALL=C ls -lAp --time-style=long-iso 2>/dev/null || LC_ALL=C ls -lAp; }}"
        );
        let out = remote_run(&app, &host_id, &account_id, &cmd, None, None)?;
        let text = String::from_utf8_lossy(&out).to_string();
        let mut lines = text.lines();
        let cwd = lines.next().unwrap_or("/").to_string();
        let mut entries: Vec<FtpEntry> = vec![];
        for l in lines {
            if l.is_empty() || l.starts_with("total ") {
                continue;
            }
            if let Some((name, size, mtime)) = parse_ls(l) {
                let (name, dir) = match name.strip_suffix('/') {
                    Some(n) => (n.to_string(), true),
                    None => (name, false),
                };
                if name.is_empty() {
                    continue;
                }
                entries.push(FtpEntry { name, dir, size, mtime });
            }
        }
        entries.sort_by(|a, b| b.dir.cmp(&a.dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(FtpListing { path: cwd, entries })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sftp_download(
    app: tauri::AppHandle,
    host_id: String,
    account_id: String,
    remote: String,
    local: String,
    dir: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cmd = if dir {
            // thư mục: nén tar.gz ngay trên server rồi lưu thành một file
            let (parent, name) = split_remote(&remote);
            format!("tar -czf - -C {} -- {}", sh_quote(&parent), sh_quote(&name))
        } else {
            format!("cat -- {}", sh_quote(&remote))
        };
        let r = remote_run(&app, &host_id, &account_id, &cmd, None, Some(&local));
        if r.is_err() {
            let _ = std::fs::remove_file(&local);
        }
        r.map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sftp_upload(
    app: tauri::AppHandle,
    host_id: String,
    account_id: String,
    local: String,
    remote_dir: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let lp = PathBuf::from(&local);
        let name = lp
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .ok_or("Đường dẫn file không hợp lệ")?;
        if lp.is_dir() {
            // thư mục: tar cục bộ, giải nén trên server
            let parent = lp.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
            let mut tar = std::process::Command::new("tar")
                .arg("-czf")
                .arg("-")
                .arg("-C")
                .arg(&parent)
                .arg(&name)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| format!("Không chạy được `tar`: {e}"))?;
            let pipe = tar.stdout.take().ok_or("Không đọc được dữ liệu từ tar")?;
            let cmd = format!("tar -xzf - -C {}", sh_quote(&remote_dir));
            let r = remote_run(&app, &host_id, &account_id, &cmd, Some(std::process::Stdio::from(pipe)), None);
            let _ = tar.wait();
            r.map(|_| ())
        } else {
            let f = std::fs::File::open(&lp).map_err(|e| format!("Không mở được file {local}: {e}"))?;
            let dest = format!("{}/{}", remote_dir.trim_end_matches('/'), name);
            remote_run(&app, &host_id, &account_id, &format!("cat > {}", sh_quote(&dest)), Some(std::process::Stdio::from(f)), None)
                .map(|_| ())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sftp_mkdir(app: tauri::AppHandle, host_id: String, account_id: String, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        remote_run(&app, &host_id, &account_id, &format!("mkdir -- {}", sh_quote(&path)), None, None).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sftp_rename(
    app: tauri::AppHandle,
    host_id: String,
    account_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let c = format!("mv -n -- {} {}", sh_quote(&from), sh_quote(&to));
        remote_run(&app, &host_id, &account_id, &c, None, None).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sftp_remove(
    app: tauri::AppHandle,
    host_id: String,
    account_id: String,
    path: String,
    dir: bool,
    recursive: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let c = if dir && recursive {
            format!("rm -rf -- {}", sh_quote(&path))
        } else if dir {
            format!("rmdir -- {}", sh_quote(&path))
        } else {
            format!("rm -f -- {}", sh_quote(&path))
        };
        remote_run(&app, &host_id, &account_id, &c, None, None).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ───────────────────────── Tạo / đọc SSH key ─────────────────────────

#[derive(Serialize)]
struct KeyPair {
    private: String,
    public: String,
}

fn tmp_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = data_dir(app)?.join(format!("tmp-{}", new_id()));
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&d, fs::Permissions::from_mode(0o700));
    }
    Ok(d)
}

/// Tạo cặp key ed25519 không passphrase trong thư mục tạm, đọc nội dung rồi xoá ngay.
#[tauri::command]
async fn ssh_keygen(app: tauri::AppHandle, comment: String) -> Result<KeyPair, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = tmp_dir(&app)?;
        let file = dir.join("key");
        let comment: String = comment.chars().filter(|c| !c.is_control()).collect();
        let mut c = new_cmd("ssh-keygen");
        c.args(["-q", "-t", "ed25519", "-N", "", "-C", comment.as_str(), "-f"]).arg(&file);
        let r = run_cmd(c, None);
        let res = match r {
            Ok(o) if o.ok => {
                let private = fs::read_to_string(&file).map_err(|e| e.to_string());
                let public = fs::read_to_string(dir.join("key.pub")).map_err(|e| e.to_string());
                match (private, public) {
                    (Ok(a), Ok(b)) => Ok(KeyPair { private: a, public: b.trim().to_string() }),
                    (Err(e), _) | (_, Err(e)) => Err(e),
                }
            }
            Ok(o) => Err(if o.stderr.is_empty() { "ssh-keygen thất bại".to_string() } else { o.stderr }),
            Err(e) => Err(e),
        };
        let _ = fs::remove_dir_all(&dir);
        res
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Lấy public key từ private key (file đã chọn hoặc nội dung đang dán). Key có passphrase thì báo lỗi.
#[tauri::command]
async fn ssh_public_key(app: tauri::AppHandle, path: String, text: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (file, tmp) = if !text.trim().is_empty() {
            let dir = tmp_dir(&app)?;
            let f = dir.join("key");
            let mut k = text.replace("\r\n", "\n").trim().to_string();
            k.push('\n');
            fs::write(&f, k).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&f, fs::Permissions::from_mode(0o600));
            }
            (f, Some(dir))
        } else if !path.trim().is_empty() {
            (PathBuf::from(expand(&path)), None)
        } else {
            return Err("Chưa có key nào để lấy public key".into());
        };
        let mut c = new_cmd("ssh-keygen");
        c.args(["-y", "-P", "", "-f"]).arg(&file);
        let r = run_cmd(c, None);
        if let Some(d) = tmp {
            let _ = fs::remove_dir_all(d);
        }
        let o = r?;
        if o.ok {
            Ok(o.stdout)
        } else {
            Err(format!(
                "Không đọc được public key (key có passphrase hoặc sai định dạng): {}",
                o.stderr
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Mở một địa chỉ https bằng trình duyệt mặc định (dùng cho trang thêm SSH key).
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Địa chỉ không hợp lệ.".into());
    }
    let c = if cfg!(target_os = "macos") {
        let mut c = new_cmd("open");
        c.arg(&url);
        c
    } else if cfg!(target_os = "windows") {
        let mut c = new_cmd("rundll32");
        c.arg("url.dll,FileProtocolHandler").arg(&url);
        c
    } else {
        let mut c = new_cmd("xdg-open");
        c.arg(&url);
        c
    };
    run_cmd(c, None).map(|_| ())
}

// ───────────────────────── Quy tắc theo thư mục (git includeIf) ─────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct Rule {
    id: String,
    folder: String,
    account_id: String,
}

#[derive(Serialize)]
struct RuleView {
    id: String,
    folder: String,
    account_id: String,
    /// đã có dòng includeIf tương ứng trong ~/.gitconfig
    ok: bool,
}

fn load_rules(app: &tauri::AppHandle) -> Result<Vec<Rule>, String> {
    let f = data_dir(app)?.join("rules.json");
    if !f.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(&f).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| format!("File rules.json bị lỗi: {e}"))
}

fn save_rules(app: &tauri::AppHandle, list: &[Rule]) -> Result<(), String> {
    let f = data_dir(app)?.join("rules.json");
    let s = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(f, s).map_err(|e| e.to_string())
}

/// Thư mục dạng `/a/b/` (dấu / cuối bắt buộc để git khớp mọi repo bên trong).
fn rule_dir(folder: &str) -> String {
    let mut p = expand(folder).replace('\\', "/");
    while p.len() > 1 && p.ends_with('/') {
        p.pop();
    }
    p.push('/');
    p
}

/// (tên section, khoá đầy đủ) của dòng includeIf cho thư mục này.
fn rule_section(folder: &str) -> (String, String) {
    // macOS/Windows không phân biệt hoa thường -> gitdir/i
    let kind = if cfg!(any(target_os = "macos", target_os = "windows")) { "gitdir/i" } else { "gitdir" };
    let sec = format!("includeIf.{kind}:{}", rule_dir(folder));
    let key = format!("{sec}.path");
    (sec, key)
}

fn rule_file(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let d = data_dir(app)?.join("rules");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join(format!("{id}.gitconfig")))
}

fn gq(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Ghi file cấu hình nhỏ của quy tắc (user, cách đăng nhập) và trả về đường dẫn.
fn write_rule_file(app: &tauri::AppHandle, rule: &Rule, p: &Profile) -> Result<PathBuf, String> {
    if p.kind != "git" {
        return Err("Quy tắc theo thư mục chỉ dùng cho tài khoản Git (GitHub, GitLab, Bitbucket…)".into());
    }
    let mut out = String::from("# Do Manager Account tạo, sẽ bị ghi đè. Sửa trong app.\n");
    out.push_str(&format!("[user]\n\tname = {}\n\temail = {}\n", gq(&p.user_name), gq(&p.user_email)));
    if p.auth == "ssh" {
        if p.ssh_key_path.trim().is_empty() {
            return Err("Tài khoản này chưa có SSH key".into());
        }
        out.push_str(&format!("[core]\n\tsshCommand = {}\n", gq(&ssh_command(&p.ssh_key_path))));
    } else {
        let token = entry(&p.id)?
            .get_password()
            .map_err(|e| format!("Không đọc được token từ keychain: {e}"))?;
        let mut sink: Vec<String> = vec![];
        ensure_credential_helper(&mut sink)?;
        store_credential(&p.host, &p.login, &token)?;
        out.push_str(&format!("[credential \"https://{}\"]\n\tusername = {}\n", p.host, gq(&p.login)));
    }
    let f = rule_file(app, &rule.id)?;
    fs::write(&f, out).map_err(|e| e.to_string())?;
    Ok(f)
}

fn link_rule(folder: &str, file: &std::path::Path) -> Result<(), String> {
    let (sec, key) = rule_section(folder);
    let _ = git(None, &["config", "--global", "--remove-section", sec.as_str()], None);
    let path = file.to_string_lossy().replace('\\', "/");
    git_ok(None, &["config", "--global", key.as_str(), path.as_str()], None).map(|_| ())
}

fn unlink_rule(folder: &str) {
    let (sec, _) = rule_section(folder);
    let _ = git(None, &["config", "--global", "--remove-section", sec.as_str()], None);
}

#[tauri::command]
async fn rules_list(app: tauri::AppHandle) -> Result<Vec<RuleView>, String> {
    let rules = load_rules(&app)?;
    Ok(rules
        .into_iter()
        .map(|r| {
            let (_, key) = rule_section(&r.folder);
            let ok = git(None, &["config", "--global", "--get", key.as_str()], None)
                .map(|o| o.ok && !o.stdout.is_empty())
                .unwrap_or(false);
            RuleView { id: r.id, folder: r.folder, account_id: r.account_id, ok }
        })
        .collect())
}

#[tauri::command]
async fn rules_save(app: tauri::AppHandle, folder: String, account_id: String) -> Result<(), String> {
    let folder = folder.trim().to_string();
    if folder.is_empty() {
        return Err("Chưa chọn thư mục".into());
    }
    if !PathBuf::from(expand(&folder)).is_dir() {
        return Err(format!("Không thấy thư mục: {folder}"));
    }
    let p = find_profile(&app, &account_id)?;
    let mut rules = load_rules(&app)?;
    let key = rule_dir(&folder);
    // một thư mục chỉ có một quy tắc: ghi đè nếu đã có
    let rule = match rules.iter().position(|r| rule_dir(&r.folder) == key) {
        Some(i) => {
            rules[i].account_id = account_id.clone();
            rules[i].folder = folder.clone();
            rules[i].clone()
        }
        None => {
            let r = Rule { id: new_id(), folder: folder.clone(), account_id: account_id.clone() };
            rules.push(r.clone());
            r
        }
    };
    let f = write_rule_file(&app, &rule, &p)?;
    link_rule(&folder, &f)?;
    save_rules(&app, &rules)
}

#[tauri::command]
async fn rules_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut rules = load_rules(&app)?;
    if let Some(r) = rules.iter().find(|r| r.id == id).cloned() {
        unlink_rule(&r.folder);
        if let Ok(f) = rule_file(&app, &r.id) {
            let _ = fs::remove_file(f);
        }
    }
    rules.retain(|r| r.id != id);
    save_rules(&app, &rules)
}

/// Gọi sau khi sửa/xoá tài khoản: ghi lại file của từng quy tắc, bỏ quy tắc có tài khoản đã bị xoá.
#[tauri::command]
async fn rules_sync(app: tauri::AppHandle) -> Result<(), String> {
    let rules = load_rules(&app)?;
    let profiles = load_profiles(&app)?;
    let mut keep: Vec<Rule> = vec![];
    for r in rules {
        match profiles.iter().find(|p| p.id == r.account_id) {
            Some(p) => {
                if let Ok(f) = write_rule_file(&app, &r, p) {
                    let _ = link_rule(&r.folder, &f);
                }
                keep.push(r);
            }
            None => {
                unlink_rule(&r.folder);
                if let Ok(f) = rule_file(&app, &r.id) {
                    let _ = fs::remove_file(f);
                }
            }
        }
    }
    save_rules(&app, &keep)
}

// ───────────────────────── Đo thông số của chính app ─────────────────────────

struct StatsState {
    sys: Mutex<sysinfo::System>,
    started: std::time::Instant,
}

#[derive(Serialize)]
struct ChildStat {
    pid: u32,
    name: String,
    mem: u64,
}

#[derive(Serialize)]
struct Stats {
    pid: u32,
    version: String,
    os: String,
    arch: String,
    cores: usize,
    total_mem: u64,
    app_mem: u64,
    app_cpu: f32,
    child_mem: u64,
    child_cpu: f32,
    children: Vec<ChildStat>,
    sessions: usize,
    uptime: u64,
    data_bytes: u64,
}

fn dir_size(p: &std::path::Path) -> u64 {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            match e.metadata() {
                Ok(m) if m.is_dir() => n += dir_size(&e.path()),
                Ok(m) => n += m.len(),
                _ => {}
            }
        }
    }
    n
}

#[tauri::command]
async fn get_stats(
    app: tauri::AppHandle,
    st: tauri::State<'_, StatsState>,
    ses: tauri::State<'_, Sessions>,
) -> Result<Stats, String> {
    let me = sysinfo::Pid::from_u32(std::process::id());
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let (total_mem, app_mem, app_cpu, children) = {
        let mut sys = st.sys.lock().map_err(|e| e.to_string())?;
        sys.refresh_processes();
        sys.refresh_memory();
        // gom app + mọi tiến trình con (ssh, webview helper trên Windows/Linux…)
        let mut ids = vec![me];
        loop {
            let mut grew = false;
            for (pid, p) in sys.processes() {
                if let Some(par) = p.parent() {
                    if ids.contains(&par) && !ids.contains(pid) {
                        ids.push(*pid);
                        grew = true;
                    }
                }
            }
            if !grew {
                break;
            }
        }
        let (mut am, mut ac) = (0u64, 0f32);
        let mut kids: Vec<(ChildStat, f32)> = vec![];
        for id in &ids {
            if let Some(p) = sys.process(*id) {
                if *id == me {
                    am = p.memory();
                    ac = p.cpu_usage();
                } else {
                    kids.push((
                        ChildStat { pid: id.as_u32(), name: p.name().to_string(), mem: p.memory() },
                        p.cpu_usage(),
                    ));
                }
            }
        }
        let cc: f32 = kids.iter().map(|k| k.1).sum();
        let list: Vec<ChildStat> = kids.into_iter().map(|k| k.0).collect();
        (sys.total_memory(), am, ac, (list, cc))
    };
    let child_mem = children.0.iter().map(|c| c.mem).sum();
    let data_bytes = app.path().app_data_dir().map(|d| dir_size(&d)).unwrap_or(0);
    let sessions = ses.0.lock().map(|m| m.len()).unwrap_or(0);
    Ok(Stats {
        pid: me.as_u32(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cores,
        total_mem,
        app_mem,
        app_cpu: app_cpu / cores as f32,
        child_mem,
        child_cpu: children.1 / cores as f32,
        children: children.0,
        sessions,
        uptime: st.started.elapsed().as_secs(),
        data_bytes,
    })
}

// ───────────────────────── Terminal SSH ngay trong app (PTY) ─────────────────────────

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
struct Sessions(Mutex<HashMap<String, Session>>);

#[derive(Serialize, Clone)]
struct TermData {
    id: String,
    /// dữ liệu thô từ ssh, mã hoá base64 để không bị cắt giữa ký tự UTF-8
    data: String,
}

#[derive(Serialize, Clone)]
struct TermExit {
    id: String,
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 }
}

/// Mở một phiên `ssh` trong PTY và đẩy dữ liệu về giao diện qua sự kiện `term-data`.
#[tauri::command]
async fn term_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, Sessions>,
    host_id: String,
    account_id: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let hosts = load_hosts(&app)?;
    let h = hosts
        .iter()
        .find(|x| x.id == host_id)
        .ok_or("Không tìm thấy SSH host này")?;
    let acct = match account_id.filter(|s| !s.is_empty()) {
        Some(id) => Some(find_profile(&app, &id)?),
        None => None,
    };
    let (args, envs) = ssh_args(h, acct.as_ref())?;

    let pair = native_pty_system()
        .openpty(pty_size(cols, rows))
        .map_err(|e| format!("Không tạo được terminal: {e}"))?;
    let mut cmd = CommandBuilder::new("ssh");
    cmd.args(&args);
    cmd.env("TERM", "xterm-256color");
    #[cfg(unix)]
    {
        let p = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{p}"));
    }
    for (k, v) in &envs {
        cmd.env(k, v);
    }
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Không chạy được `ssh`: {e}. Hãy cài OpenSSH rồi thử lại."))?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Không đọc được terminal: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Không ghi được vào terminal: {e}"))?;

    let id = new_id();
    state
        .0
        .lock()
        .map_err(|_| "Lỗi nội bộ (khoá phiên)".to_string())?
        .insert(id.clone(), Session { master: pair.master, writer, child });

    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = app2.emit(
                        "term-data",
                        TermData { id: id2.clone(), data: B64.encode(&buf[..n]) },
                    );
                }
            }
        }
        if let Ok(mut m) = app2.state::<Sessions>().0.lock() {
            m.remove(&id2);
        }
        let _ = app2.emit("term-exit", TermExit { id: id2 });
    });
    Ok(id)
}

#[tauri::command]
async fn term_write(state: tauri::State<'_, Sessions>, id: String, data: String) -> Result<(), String> {
    let mut m = state.0.lock().map_err(|_| "Lỗi nội bộ (khoá phiên)".to_string())?;
    if let Some(s) = m.get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        let _ = s.writer.flush();
    }
    Ok(())
}

#[tauri::command]
async fn term_resize(state: tauri::State<'_, Sessions>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let m = state.0.lock().map_err(|_| "Lỗi nội bộ (khoá phiên)".to_string())?;
    if let Some(s) = m.get(&id) {
        s.master.resize(pty_size(cols, rows)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn term_close(state: tauri::State<'_, Sessions>, id: String) -> Result<(), String> {
    let mut m = state.0.lock().map_err(|_| "Lỗi nội bộ (khoá phiên)".to_string())?;
    if let Some(mut s) = m.remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}

// ───────────────────────── Lưu trữ profile ─────────────────────────

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn load_profiles(app: &tauri::AppHandle) -> Result<Vec<Profile>, String> {
    let f = data_dir(app)?.join("profiles.json");
    if !f.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(&f).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| format!("File profiles.json bị lỗi: {e}"))
}

fn save_profiles(app: &tauri::AppHandle, list: &[Profile]) -> Result<(), String> {
    let f = data_dir(app)?.join("profiles.json");
    let s = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(f, s).map_err(|e| e.to_string())
}

fn find_profile(app: &tauri::AppHandle, id: &str) -> Result<Profile, String> {
    load_profiles(app)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Không tìm thấy tài khoản này".to_string())
}

/// Lưu private key do user dán vào, quyền 600 (chỉ chủ sở hữu đọc được)
fn write_key(app: &tauri::AppHandle, id: &str, key: &str) -> Result<String, String> {
    let dir = data_dir(app)?.join("keys");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{id}.key"));
    let mut k = key.replace("\r\n", "\n").trim().to_string();
    k.push('\n');
    fs::write(&path, k).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().to_string())
}

// ───────────────────────── Phạm vi cấu hình git ─────────────────────────

struct Target {
    repo: Option<String>,
    flag: &'static str,
}

fn target(scope: &str, repo_path: Option<String>) -> Result<Target, String> {
    match scope {
        "global" => Ok(Target { repo: None, flag: "--global" }),
        "repo" => {
            let p = repo_path
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or("Chưa chọn thư mục repo")?;
            let o = git(Some(p.as_str()), &["rev-parse", "--is-inside-work-tree"], None)?;
            if !o.ok || o.stdout != "true" {
                return Err(format!("Thư mục này không phải git repo: {p}"));
            }
            Ok(Target { repo: Some(p), flag: "--local" })
        }
        _ => Err("Phạm vi không hợp lệ".into()),
    }
}

impl Target {
    fn set(&self, key: &str, val: &str) -> Result<(), String> {
        git_ok(self.repo.as_deref(), &["config", self.flag, key, val], None).map(|_| ())
    }
    fn unset(&self, key: &str) {
        // exit code 5 khi chưa có key -> bỏ qua
        let _ = git(self.repo.as_deref(), &["config", self.flag, "--unset-all", key], None);
    }
}

fn cfg_get(repo: Option<&str>, global: bool, args: &[&str]) -> String {
    let mut a: Vec<&str> = vec!["config"];
    if global {
        a.push("--global");
    }
    a.extend_from_slice(args);
    match git(repo, &a, None) {
        Ok(o) if o.ok => o.stdout,
        _ => String::new(),
    }
}

// ───────────────────────── Credential (chế độ token) ─────────────────────────

fn default_helper() -> String {
    if cfg!(target_os = "macos") {
        "osxkeychain".into()
    } else if cfg!(target_os = "windows") {
        "manager".into()
    } else {
        for p in [
            "/usr/lib/git-core/git-credential-libsecret",
            "/usr/libexec/git-core/git-credential-libsecret",
            "/usr/share/doc/git/contrib/credential/libsecret/git-credential-libsecret",
        ] {
            if PathBuf::from(p).exists() {
                return p.to_string();
            }
        }
        "store".into()
    }
}

fn ensure_credential_helper(log: &mut Vec<String>) -> Result<(), String> {
    let o = git(None, &["config", "--get-all", "credential.helper"], None)?;
    if o.stdout.trim().is_empty() {
        let h = default_helper();
        git_ok(None, &["config", "--global", "credential.helper", h.as_str()], None)?;
        log.push(format!("Máy chưa có credential.helper -> đặt global = {h}"));
    }
    Ok(())
}

fn store_credential(host: &str, login: &str, token: &str) -> Result<(), String> {
    let input = format!("protocol=https\nhost={host}\nusername={login}\npassword={token}\n\n");
    git_ok(None, &["credential", "approve"], Some(input.as_str())).map(|_| ())
}

// ───────────────────────── Đổi remote SSH <-> HTTPS ─────────────────────────

fn convert_url(url: &str, host: &str, to_ssh: bool) -> Option<String> {
    let u = url.trim();
    let path: String = if let Some(r) = u.strip_prefix("https://").or_else(|| u.strip_prefix("http://")) {
        let r = match r.split_once('@') {
            Some((ui, rest)) if !ui.contains('/') => rest,
            _ => r,
        };
        r.strip_prefix(&format!("{host}/"))?.to_string()
    } else if let Some(r) = u.strip_prefix(&format!("git@{host}:")) {
        r.to_string()
    } else if let Some(r) = u.strip_prefix(&format!("ssh://git@{host}/")) {
        r.to_string()
    } else {
        return None;
    };
    let new = if to_ssh {
        format!("git@{host}:{path}")
    } else {
        format!("https://{host}/{path}")
    };
    if new == u {
        None
    } else {
        Some(new)
    }
}

// ───────────────────────── Commands ─────────────────────────

#[tauri::command]
async fn user_home() -> String {
    home()
}

#[tauri::command]
async fn list_profiles(app: tauri::AppHandle) -> Result<Vec<Profile>, String> {
    load_profiles(&app)
}

fn save_npm_profile(app: &tauri::AppHandle, input: ProfileInput) -> Result<Profile, String> {
    let mut list = load_profiles(app)?;
    let name = input.name.trim().to_string();
    let registry_in = input.registry.as_deref().map(str::trim).unwrap_or("");
    if name.is_empty() || registry_in.is_empty() {
        return Err("Cần nhập đủ: tên hiển thị và registry".into());
    }
    let registry = norm_registry(registry_in);
    let mut scope = input.scope.as_deref().map(str::trim).unwrap_or("").to_string();
    scope = scope.trim_end_matches(':').to_string();
    if !scope.is_empty() && !scope.starts_with('@') {
        scope = format!("@{scope}");
    }
    let id = input.id.clone().filter(|s| !s.is_empty()).unwrap_or_else(new_id);
    let existing = list.iter().find(|p| p.id == id).cloned();

    let mut p = Profile {
        id: id.clone(),
        name,
        host: registry_host(&registry),
        user_name: String::new(),
        user_email: String::new(),
        auth: "token".to_string(),
        login: String::new(),
        ssh_key_path: String::new(),
        has_token: false,
        kind: "npm".to_string(),
        registry,
        scope,
    };
    let tok = input.token.as_deref().map(str::trim).unwrap_or("");
    if !tok.is_empty() {
        entry(&id)?
            .set_password(tok)
            .map_err(|e| format!("Không lưu được token vào keychain: {e}"))?;
        p.has_token = true;
    } else if let Some(e) = &existing {
        p.has_token = e.has_token;
    }
    if !p.has_token {
        return Err("Cần nhập token (npm access token)".into());
    }
    if let Some(i) = list.iter().position(|x| x.id == id) {
        list[i] = p.clone();
    } else {
        list.push(p.clone());
    }
    save_profiles(app, &list)?;
    Ok(p)
}

#[tauri::command]
async fn save_profile(app: tauri::AppHandle, input: ProfileInput) -> Result<Profile, String> {
    if input.kind.as_deref() == Some("npm") {
        return save_npm_profile(&app, input);
    }
    if input.kind.as_deref() == Some("ssh") {
        return save_ssh_profile(&app, input);
    }
    let mut list = load_profiles(&app)?;
    let name = input.name.trim().to_string();
    let host = norm_host(&input.host);
    let user_name = input.user_name.trim().to_string();
    let user_email = input.user_email.trim().to_string();
    if name.is_empty() || host.is_empty() || user_name.is_empty() || user_email.is_empty() {
        return Err("Cần nhập đủ: tên hiển thị, host, user.name, user.email".into());
    }
    let id = input
        .id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(new_id);
    let existing = list.iter().find(|p| p.id == id).cloned();

    let mut p = Profile {
        id: id.clone(),
        name,
        host,
        user_name,
        user_email,
        auth: input.auth.clone(),
        login: String::new(),
        ssh_key_path: String::new(),
        has_token: false,
        kind: "git".to_string(),
        registry: String::new(),
        scope: String::new(),
    };

    match input.auth.as_str() {
        "ssh" => {
            let pasted = input.ssh_private_key.as_deref().map(str::trim).unwrap_or("");
            if !pasted.is_empty() {
                p.ssh_key_path = write_key(&app, &id, pasted)?;
            } else {
                let given = input.ssh_key_path.as_deref().map(str::trim).unwrap_or("");
                if !given.is_empty() {
                    p.ssh_key_path = given.to_string();
                } else if let Some(e) = &existing {
                    p.ssh_key_path = e.ssh_key_path.clone();
                }
            }
            if p.ssh_key_path.is_empty() {
                return Err("Hãy chọn file SSH key hoặc dán private key".into());
            }
            let full = expand(&p.ssh_key_path);
            if !PathBuf::from(&full).exists() {
                return Err(format!("Không thấy file key: {full}"));
            }
        }
        "token" => {
            let login = input.login.as_deref().map(str::trim).unwrap_or("");
            if login.is_empty() {
                return Err("Cần nhập username đăng nhập (chế độ token)".into());
            }
            p.login = login.to_string();
            let tok = input.token.as_deref().map(str::trim).unwrap_or("");
            if !tok.is_empty() {
                entry(&id)?
                    .set_password(tok)
                    .map_err(|e| format!("Không lưu được token vào keychain: {e}"))?;
                p.has_token = true;
            } else if let Some(e) = &existing {
                p.has_token = e.has_token;
            }
            if !p.has_token {
                return Err("Cần nhập Personal Access Token".into());
            }
        }
        _ => return Err("Kiểu đăng nhập không hợp lệ".into()),
    }

    if let Some(i) = list.iter().position(|x| x.id == id) {
        list[i] = p.clone();
    } else {
        list.push(p.clone());
    }
    save_profiles(&app, &list)?;
    Ok(p)
}

/// Trả về token (trong keychain) hoặc nội dung private key của một tài khoản,
/// để người dùng xem lại ngay trong form sửa. Chỉ chạy cục bộ, không gửi đi đâu.
#[tauri::command]
async fn reveal_secret(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let list = load_profiles(&app)?;
    let p = list.iter().find(|x| x.id == id).ok_or("Không tìm thấy tài khoản")?;
    if p.auth == "token" {
        return entry(&p.id)?
            .get_password()
            .map_err(|_| "Chưa có token nào được lưu cho tài khoản này".to_string());
    }
    let path = expand(&p.ssh_key_path);
    fs::read_to_string(&path).map_err(|e| format!("Không đọc được file key ({path}): {e}"))
}

/// Mật khẩu SSH đã lưu của một tài khoản (để xem lại trong form sửa).
#[tauri::command]
async fn reveal_password(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let p = find_profile(&app, &id)?;
    entry(&p.id)?
        .get_password()
        .map_err(|_| "Chưa có mật khẩu nào được lưu cho tài khoản này".to_string())
}

#[tauri::command]
async fn delete_profile(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut list = load_profiles(&app)?;
    let Some(p) = list.iter().find(|p| p.id == id).cloned() else {
        return Ok(());
    };
    list.retain(|x| x.id != id);
    save_profiles(&app, &list)?;

    if let Ok(e) = entry(&id) {
        let _ = e.delete_credential();
    }
    if p.auth == "token" && !p.login.is_empty() {
        let input = format!("protocol=https\nhost={}\nusername={}\n\n", p.host, p.login);
        let _ = git(None, &["credential", "reject"], Some(input.as_str()));
    }
    if let Ok(d) = data_dir(&app) {
        let kp = d.join("keys").join(format!("{id}.key"));
        let _ = fs::remove_file(kp);
    }
    Ok(())
}

#[tauri::command]
async fn apply_profile(
    app: tauri::AppHandle,
    id: String,
    scope: String,
    repo_path: Option<String>,
    convert_remote: bool,
) -> Result<Vec<String>, String> {
    let p = find_profile(&app, &id)?;
    let t = target(&scope, repo_path)?;
    let mut log: Vec<String> = vec![];
    let where_ = if t.repo.is_some() { "repo" } else { "toàn máy" };

    if p.kind == "ssh" {
        return Err("Tài khoản SSH được dùng ở menu SSH host: chọn host rồi bấm tài khoản để kết nối.".into());
    }
    if p.kind == "npm" {
        let token = entry(&p.id)?
            .get_password()
            .map_err(|e| format!("Không đọc được token từ keychain: {e}"))?;
        let path = npmrc_path(t.repo.as_deref());
        npmrc_set(&path, &npm_auth_key(&p.registry), &token)?;
        let reg_key = if p.scope.is_empty() { "registry".to_string() } else { format!("{}:registry", p.scope) };
        npmrc_set(&path, &reg_key, &p.registry)?;
        log.push(format!("[{where_}] {} -> {}", reg_key, p.registry));
        log.push(format!("[{where_}] {} = *** (token ghi vào {})", npm_auth_key(&p.registry), path.display()));
        return Ok(log);
    }

    t.set("user.name", &p.user_name)?;
    t.set("user.email", &p.user_email)?;
    log.push(format!("[{where_}] user.name = {}", p.user_name));
    log.push(format!("[{where_}] user.email = {}", p.user_email));

    let cred_key = format!("credential.https://{}.username", p.host);
    if p.auth == "ssh" {
        if p.ssh_key_path.trim().is_empty() {
            return Err("Tài khoản này chưa có SSH key".into());
        }
        let cmd = ssh_command(&p.ssh_key_path);
        t.set("core.sshCommand", &cmd)?;
        t.unset(&cred_key);
        log.push(format!("[{where_}] core.sshCommand = {cmd}"));
    } else {
        let token = entry(&p.id)?
            .get_password()
            .map_err(|e| format!("Không đọc được token từ keychain: {e}"))?;
        t.unset("core.sshCommand");
        ensure_credential_helper(&mut log)?;
        store_credential(&p.host, &p.login, &token)?;
        t.set(&cred_key, &p.login)?;
        log.push(format!(
            "[{where_}] {cred_key} = {} (token nạp vào credential helper)",
            p.login
        ));
    }

    if convert_remote {
        if let Some(repo) = t.repo.as_deref() {
            let names = git(Some(repo), &["remote"], None)?.stdout;
            for n in names.lines().map(str::trim).filter(|s| !s.is_empty()) {
                let url = git(Some(repo), &["remote", "get-url", n], None)?.stdout;
                if let Some(new) = convert_url(&url, &p.host, p.auth == "ssh") {
                    git_ok(Some(repo), &["remote", "set-url", n, new.as_str()], None)?;
                    log.push(format!("remote {n}: {} -> {}", mask(&url), mask(&new)));
                }
            }
        }
    }
    Ok(log)
}

#[tauri::command]
async fn get_current(
    app: tauri::AppHandle,
    scope: String,
    repo_path: Option<String>,
) -> Result<Current, String> {
    let git_version = git_ok(None, &["--version"], None)?.stdout;
    let t = target(&scope, repo_path)?;
    let repo = t.repo.as_deref();
    let global = repo.is_none();

    let name = cfg_get(repo, global, &["--get", "user.name"]);
    let email = cfg_get(repo, global, &["--get", "user.email"]);
    let ssh_cmd = cfg_get(repo, global, &["--get", "core.sshCommand"]);
    let creds_raw = cfg_get(repo, global, &["--get-regexp", r"^credential\..*\.username$"]);
    let credential_users: Vec<String> = creds_raw
        .lines()
        .filter_map(|l| l.split_once(' ').map(|(_, v)| v.trim().to_string()))
        .collect();

    let remotes: Vec<String> = if repo.is_some() {
        let raw = git(repo, &["remote", "-v"], None)
            .map(|o| o.stdout)
            .unwrap_or_default();
        raw.lines()
            .filter(|l| l.contains("(fetch)"))
            .map(|l| mask(&l.replace('\t', " ").replace(" (fetch)", "")))
            .collect()
    } else {
        vec![]
    };

    let profiles = load_profiles(&app)?;
    // credential.https://<host>.username -> (host, username)
    let cred_pairs: Vec<(String, String)> = creds_raw
        .lines()
        .filter_map(|l| {
            let (k, v) = l.split_once(' ')?;
            let host = k
                .strip_prefix("credential.https://")?
                .strip_suffix(".username")?;
            Some((host.to_lowercase(), v.trim().to_string()))
        })
        .collect();
    // Tài khoản đang hoạt động = cấu hình đăng nhập của nó đang được git dùng
    let active_ids: Vec<String> = profiles
        .iter()
        .filter(|p| {
            if p.kind == "ssh" {
                return false;
            }
            if p.kind == "npm" {
                let path = npmrc_path(repo);
                let have = npmrc_get(&path, &npm_auth_key(&p.registry));
                let tok = entry(&p.id).ok().and_then(|e| e.get_password().ok());
                return match (have, tok) {
                    (Some(a), Some(b)) => a == b,
                    _ => false,
                };
            }
            if p.auth == "ssh" {
                !ssh_cmd.is_empty() && ssh_cmd.contains(&expand(&p.ssh_key_path).replace('\\', "/"))
            } else {
                cred_pairs.iter().any(|(h, u)| *h == p.host && *u == p.login)
            }
        })
        .map(|p| p.id.clone())
        .collect();

    Ok(Current {
        git_version,
        name,
        email,
        ssh_command: ssh_cmd,
        credential_users,
        remotes,
        active_ids,
    })
}

#[tauri::command]
async fn test_profile(app: tauri::AppHandle, id: String) -> Result<TestResult, String> {
    let p = find_profile(&app, &id)?;

    if p.kind == "ssh" {
        return Ok(TestResult {
            ok: false,
            message: "Tài khoản SSH được thử bằng cách kết nối tới một SSH host.".into(),
        });
    }
    if p.kind == "npm" {
        let token = entry(&p.id)?
            .get_password()
            .map_err(|e| format!("Không đọc được token từ keychain: {e}"))?;
        // Đưa token qua stdin để không lộ trong danh sách tiến trình
        let cfg = format!(
            "url = \"{}-/whoami\"\nheader = \"Authorization: Bearer {token}\"\nheader = \"User-Agent: manager-account\"\nheader = \"Accept: application/json\"\n",
            p.registry
        );
        let mut c = new_cmd("curl");
        c.args(["-sS", "-m", "15", "-K", "-", "-w", "\n%{http_code}"]);
        let o = run_cmd(c, Some(cfg.as_str()))?;
        if !o.ok {
            return Ok(TestResult { ok: false, message: format!("curl lỗi: {}", o.stderr) });
        }
        let (body, code) = o.stdout.rsplit_once('\n').unwrap_or((o.stdout.as_str(), ""));
        return Ok(match code.trim() {
            "200" => {
                let v: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
                let who = v["username"].as_str().unwrap_or("?");
                TestResult { ok: true, message: format!("Token hợp lệ - đăng nhập là @{who}") }
            }
            "401" | "403" => TestResult {
                ok: false,
                message: "Token sai hoặc đã hết hạn (HTTP 401).".into(),
            },
            "404" => TestResult {
                ok: false,
                message: "Registry này không hỗ trợ kiểm tra token (không có /-/whoami).".into(),
            },
            c => TestResult { ok: false, message: format!("Phản hồi bất thường (HTTP {c}).") },
        });
    }

    if p.auth == "ssh" {
        let key = expand(&p.ssh_key_path);
        if !PathBuf::from(&key).exists() {
            return Ok(TestResult { ok: false, message: format!("Không thấy file key: {key}") });
        }
        let mut c = new_cmd("ssh");
        c.args([
            "-i",
            key.as_str(),
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=10",
            "-T",
        ])
        .arg(format!("git@{}", p.host));
        let o = run_cmd(c, None)?;
        let text = format!("{}\n{}", o.stderr, o.stdout).trim().to_string();
        let low = text.to_lowercase();
        let ok = low.contains("success")
            || low.contains("welcome")
            || low.contains("logged in as")
            || low.contains("authenticated");
        let message = if text.is_empty() { "(không có phản hồi)".to_string() } else { text };
        return Ok(TestResult { ok, message });
    }

    // Chế độ token: gọi API của GitHub/GitLab
    let token = entry(&p.id)?
        .get_password()
        .map_err(|e| format!("Không đọc được token từ keychain: {e}"))?;
    let (url, header) = if p.host == "github.com" {
        (
            "https://api.github.com/user".to_string(),
            format!("Authorization: Bearer {token}"),
        )
    } else if p.host.contains("gitlab") {
        (
            format!("https://{}/api/v4/user", p.host),
            format!("PRIVATE-TOKEN: {token}"),
        )
    } else {
        return Ok(TestResult {
            ok: false,
            message: "Chưa hỗ trợ test token cho host này (chỉ GitHub/GitLab).".into(),
        });
    };
    // Đưa token qua stdin để không lộ trong danh sách tiến trình
    let cfg = format!(
        "url = \"{url}\"\nheader = \"{header}\"\nheader = \"User-Agent: manager-account\"\nheader = \"Accept: application/json\"\n"
    );
    let mut c = new_cmd("curl");
    c.args(["-sS", "-m", "15", "-K", "-", "-w", "\n%{http_code}"]);
    let o = run_cmd(c, Some(cfg.as_str()))?;
    if !o.ok {
        return Ok(TestResult { ok: false, message: format!("curl lỗi: {}", o.stderr) });
    }
    let (body, code) = o.stdout.rsplit_once('\n').unwrap_or((o.stdout.as_str(), ""));
    match code.trim() {
        "200" => {
            let v: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
            let who = v["login"].as_str().or(v["username"].as_str()).unwrap_or("?");
            Ok(TestResult { ok: true, message: format!("Token hợp lệ - đăng nhập là @{who}") })
        }
        "401" => Ok(TestResult {
            ok: false,
            message: "Token sai hoặc đã hết hạn (HTTP 401).".into(),
        }),
        c => Ok(TestResult { ok: false, message: format!("Phản hồi bất thường (HTTP {c}).") }),
    }
}

// ───────────────────────── Kiểm tra bản cập nhật ─────────────────────────

fn ver_parts(s: &str) -> Vec<u64> {
    s.trim()
        .trim_start_matches(['v', 'V'])
        .split(|c: char| !c.is_ascii_digit())
        .filter(|x| !x.is_empty())
        .map(|x| x.parse().unwrap_or(0))
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let a = ver_parts(latest);
    let b = ver_parts(current);
    for i in 0..a.len().max(b.len()) {
        let x = *a.get(i).unwrap_or(&0);
        let y = *b.get(i).unwrap_or(&0);
        if x != y {
            return x > y;
        }
    }
    false
}

/// Chỉ gửi một yêu cầu GET tới GitHub Releases. Không gửi bất kỳ dữ liệu nào của người dùng.
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    let cfg = format!(
        "url = \"https://api.github.com/repos/{UPDATE_REPO}/releases/latest\"\nheader = \"User-Agent: manager-account\"\nheader = \"Accept: application/vnd.github+json\"\n"
    );
    let mut c = new_cmd("curl");
    c.args(["-sS", "-m", "10", "-K", "-", "-w", "\n%{http_code}"]);
    let o = run_cmd(c, Some(cfg.as_str()))?;
    if !o.ok {
        return Err(format!("Không kết nối được tới GitHub: {}", o.stderr));
    }
    let (body, code) = o.stdout.rsplit_once('\n').unwrap_or((o.stdout.as_str(), ""));
    let mut info = UpdateInfo {
        current: current.clone(),
        latest: String::new(),
        has_update: false,
        none_published: false,
        url: format!("https://github.com/{UPDATE_REPO}/releases"),
        notes: String::new(),
    };
    match code.trim() {
        "200" => {
            let v: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
            let tag = v["tag_name"].as_str().unwrap_or("").to_string();
            if tag.is_empty() {
                return Err("GitHub trả về dữ liệu không đọc được.".into());
            }
            info.has_update = is_newer(&tag, &current);
            if let Some(u) = v["html_url"].as_str() {
                info.url = u.to_string();
            }
            info.notes = v["body"].as_str().unwrap_or("").chars().take(600).collect();
            info.latest = tag;
            Ok(info)
        }
        "404" => {
            info.none_published = true;
            Ok(info)
        }
        "403" | "429" => Err("GitHub tạm giới hạn số lần kiểm tra, hãy thử lại sau ít phút.".into()),
        c => Err(format!("GitHub phản hồi bất thường (HTTP {c}).")),
    }
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    phase: String,
    downloaded: u64,
    total: u64,
}

/// Tải bản mới từ GitHub Releases, kiểm tra chữ ký số, cài đặt rồi khởi động lại app.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    // Chưa có khoá công khai (chưa chạy `pnpm set:pubkey`) thì không thể kiểm tra chữ ký -> không cài
    let pubkey_ok = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|p| p.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if !pubkey_ok {
        return Err("Chưa thiết lập khoá ký cập nhật. Xem README, mục “Thiết lập cập nhật tự động”.".into());
    }

    let updater = app
        .updater()
        .map_err(|e| format!("Chưa cấu hình cập nhật tự động: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Không kiểm tra được bản mới: {e}"))?
        .ok_or("Bạn đang dùng bản mới nhất.")?;

    let mut downloaded: u64 = 0;
    let h1 = app.clone();
    let h2 = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = h1.emit(
                    "update-progress",
                    UpdateProgress { phase: "downloading".into(), downloaded, total: total.unwrap_or(0) },
                );
            },
            move || {
                let _ = h2.emit(
                    "update-progress",
                    UpdateProgress { phase: "installing".into(), downloaded: 0, total: 0 },
                );
            },
        )
        .await
        .map_err(|e| format!("Cập nhật thất bại: {e}"))?;

    app.restart()
}

/// Mở trang tải bản mới bằng trình duyệt mặc định (chỉ cho phép đúng repo của app)
#[tauri::command]
async fn open_release_page(url: String) -> Result<(), String> {
    let prefix = format!("https://github.com/{UPDATE_REPO}");
    if !(url == prefix || url.starts_with(&format!("{prefix}/"))) {
        return Err("Địa chỉ không hợp lệ.".into());
    }
    let c = if cfg!(target_os = "macos") {
        let mut c = new_cmd("open");
        c.arg(&url);
        c
    } else if cfg!(target_os = "windows") {
        let mut c = new_cmd("rundll32");
        c.arg("url.dll,FileProtocolHandler").arg(&url);
        c
    } else {
        let mut c = new_cmd("xdg-open");
        c.arg(&url);
        c
    };
    run_cmd(c, None).map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ssh gọi lại chính file này làm SSH_ASKPASS để điền mật khẩu: không mở giao diện
    if let Ok(id) = std::env::var("MA_ASKPASS_ID") {
        askpass_mode(&id);
        return;
    }
    tauri::Builder::default()
        .manage(Sessions::default())
        .manage(StatsState { sys: Mutex::new(sysinfo::System::new()), started: std::time::Instant::now() })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            user_home, get_stats, ssh_keygen, ssh_public_key, open_url, rules_list, rules_save, rules_delete, rules_sync, reveal_secret, reveal_password, list_hosts, save_host, delete_host, sftp_list, sftp_download, sftp_upload, sftp_mkdir, sftp_rename, sftp_remove, term_open, term_write, term_resize, term_close,
            list_profiles,
            save_profile,
            delete_profile,
            apply_profile,
            get_current,
            test_profile,
            check_update,
            install_update,
            open_release_page
        ])
        .build(tauri::generate_context!())
        .expect("lỗi khi chạy ứng dụng Tauri")
        .run(|app, event| {
            // Thoát app thì đóng hẳn mọi phiên ssh đang mở, không để tiến trình ssh chạy ngầm
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut m) = app.state::<Sessions>().0.lock() {
                    for (_, s) in m.iter_mut() {
                        let _ = s.child.kill();
                    }
                    m.clear();
                }
            }
        });
}
