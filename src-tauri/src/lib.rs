use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const KEYRING_SERVICE: &str = "manager-account";

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

#[tauri::command]
async fn save_profile(app: tauri::AppHandle, input: ProfileInput) -> Result<Profile, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            user_home,
            list_profiles,
            save_profile,
            delete_profile,
            apply_profile,
            get_current,
            test_profile
        ])
        .run(tauri::generate_context!())
        .expect("lỗi khi chạy ứng dụng Tauri");
}
