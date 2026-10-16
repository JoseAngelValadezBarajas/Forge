use crate::api_bridge::{ApiRequest, ApiResponse, forward_request, validate_request_manifest};
use crate::route_policy::RouteManifest;
use crate::session::Session;
use crate::windows_process::{OwnedJob, SingleInstanceLock};
use rand::RngCore;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, sync_channel};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);
const STOP_GRACE: Duration = Duration::from_secs(5);
const MAX_LOG_BYTES: u64 = 4 * 1024 * 1024;
const MAX_LOG_LINE: usize = 16 * 1024;
const MAX_IN_FLIGHT_REQUESTS: usize = 32;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub state: &'static str,
    pub message: Option<&'static str>,
}

#[derive(Clone)]
pub struct RuntimePaths {
    data_root: PathBuf,
    database_path: PathBuf,
    log_path: PathBuf,
    sidecar_path: PathBuf,
    manifest: Arc<RouteManifest>,
}

impl RuntimePaths {
    pub fn new(data_root: PathBuf, resource_root: PathBuf) -> Result<Self, String> {
        if !data_root.is_absolute() {
            return Err("local application data path is invalid".into());
        }
        let data_dir = data_root.join("data");
        let logs_dir = data_root.join("logs");
        let backups_dir = data_root.join("backups");
        for directory in [&data_dir, &logs_dir, &backups_dir] {
            fs::create_dir_all(directory)
                .map_err(|_| "Forge could not prepare its local data directories")?;
        }
        let sidecar_path = resource_root
            .join("resources")
            .join("forge-sidecar")
            .join("forge-sidecar.exe");
        let manifest = RouteManifest::from_json(include_str!("../resources/api-routes.json"))
            .map_err(|_| "desktop API route policy is unavailable")?;
        Ok(Self {
            data_root,
            database_path: data_dir.join("forge.db"),
            log_path: logs_dir.join("forge-desktop.log"),
            sidecar_path,
            manifest: Arc::new(manifest),
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    NotStarted,
    Starting,
    Ready,
    Failed,
    Stopping,
    Stopped,
}

struct RuntimeCore {
    phase: Phase,
    failure_message: Option<&'static str>,
    sidecar: Option<Arc<Mutex<OwnedSidecar>>>,
    start_cancellation: Option<CancellationToken>,
    _instance_lock: Option<SingleInstanceLock>,
}

struct OwnedSidecar {
    child: Child,
    stdin: Option<ChildStdin>,
    job: Option<OwnedJob>,
    session: Option<Session>,
    stopped: bool,
}

impl OwnedSidecar {
    fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.session = None;
        if let Some(mut stdin) = self.stdin.take() {
            let _ = stdin.write_all(b"FORGE_STOP\n");
            let _ = stdin.flush();
        }
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if self.child.try_wait().ok().flatten().is_some() {
                self.job.take();
                self.stopped = true;
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        if let Some(job) = self.job.as_ref() {
            let _ = job.terminate();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.job.take();
        self.stopped = true;
    }
}

impl Drop for OwnedSidecar {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub struct DesktopRuntime {
    core: Mutex<RuntimeCore>,
    paths: OnceLock<RuntimePaths>,
    requests: Arc<Mutex<RequestState>>,
}

#[derive(Default)]
struct RequestState {
    active: HashMap<String, CancellationToken>,
    cancelled_before_start: HashSet<String>,
}

impl RequestState {
    fn cancel(&mut self, request_id: &str) -> bool {
        if let Some(cancellation) = self.active.get(request_id) {
            cancellation.cancel();
            return true;
        }
        if self.cancelled_before_start.len() >= MAX_IN_FLIGHT_REQUESTS {
            return false;
        }
        self.cancelled_before_start.insert(request_id.to_owned());
        true
    }

    fn register(
        &mut self,
        request_id: String,
        cancellation: CancellationToken,
    ) -> Result<(), String> {
        if self.active.contains_key(&request_id) {
            return Err("duplicate request identifier".into());
        }
        if self.active.len() >= MAX_IN_FLIGHT_REQUESTS {
            return Err("too many desktop requests are active".into());
        }
        if self.cancelled_before_start.remove(&request_id) {
            cancellation.cancel();
        }
        self.active.insert(request_id, cancellation);
        Ok(())
    }
}

impl DesktopRuntime {
    pub fn new() -> Self {
        Self {
            core: Mutex::new(RuntimeCore {
                phase: Phase::NotStarted,
                failure_message: None,
                sidecar: None,
                start_cancellation: None,
                _instance_lock: None,
            }),
            paths: OnceLock::new(),
            requests: Arc::new(Mutex::new(RequestState::default())),
        }
    }

    pub fn configure(
        &self,
        paths: RuntimePaths,
        instance_lock: SingleInstanceLock,
    ) -> Result<(), String> {
        self.paths
            .set(paths)
            .map_err(|_| "Forge desktop runtime was already configured")?;
        let mut core = self
            .core
            .lock()
            .map_err(|_| "Forge desktop runtime could not initialize")?;
        core._instance_lock = Some(instance_lock);
        Ok(())
    }

    pub fn start_background(self: &Arc<Self>) -> Result<(), String> {
        let paths = self
            .paths
            .get()
            .cloned()
            .ok_or_else(|| "Forge desktop runtime is not configured".to_owned())?;
        let cancellation = CancellationToken::new();
        {
            let mut core = self
                .core
                .lock()
                .map_err(|_| "Forge desktop runtime is unavailable".to_owned())?;
            if matches!(core.phase, Phase::Starting | Phase::Ready) {
                return Ok(());
            }
            if core.phase == Phase::Stopping || core.phase == Phase::Stopped {
                return Err("Forge desktop runtime is closing".into());
            }
            core.phase = Phase::Starting;
            core.failure_message = None;
            core.start_cancellation = Some(cancellation.clone());
        }

        let runtime = Arc::clone(self);
        thread::Builder::new()
            .name("forge-sidecar-startup".into())
            .spawn(move || {
                let result = runtime.spawn_and_verify(&paths, cancellation.clone());
                match result {
                    Ok(sidecar) => {
                        let mut core = match runtime.core.lock() {
                            Ok(core) => core,
                            Err(_) => {
                                if let Ok(mut process) = sidecar.lock() {
                                    process.shutdown();
                                }
                                return;
                            }
                        };
                        if cancellation.is_cancelled() || core.phase == Phase::Stopping {
                            drop(core);
                            if let Ok(mut process) = sidecar.lock() {
                                process.shutdown();
                            }
                        } else {
                            core.sidecar = Some(sidecar);
                            core.phase = Phase::Ready;
                        }
                    }
                    Err(message) => {
                        runtime.fail_startup(&paths, message, cancellation.is_cancelled());
                    }
                }
            })
            .map_err(|_| {
                if let Ok(mut core) = self.core.lock() {
                    core.phase = Phase::Failed;
                    core.failure_message = Some("Forge could not start its local service.");
                }
                "Forge could not start its local service".to_owned()
            })?;
        Ok(())
    }

    pub fn status(&self) -> RuntimeStatus {
        let Ok(core) = self.core.lock() else {
            return RuntimeStatus {
                state: "failed",
                message: Some("Forge local service status is unavailable."),
            };
        };
        match core.phase {
            Phase::NotStarted | Phase::Starting => RuntimeStatus {
                state: "starting",
                message: None,
            },
            Phase::Ready => RuntimeStatus {
                state: "ready",
                message: None,
            },
            Phase::Failed => RuntimeStatus {
                state: "failed",
                message: core.failure_message,
            },
            Phase::Stopping | Phase::Stopped => RuntimeStatus {
                state: "stopped",
                message: None,
            },
        }
    }

    pub async fn api_request(&self, request: ApiRequest) -> Result<ApiResponse, String> {
        let paths = self
            .paths
            .get()
            .ok_or_else(|| "Forge local service is not ready".to_owned())?;
        validate_request_manifest(&paths.manifest, &request)?;
        let request_id = request.request_id.clone();
        let (session, cancellation) = self.register_request(request_id.clone())?;
        let _registration = RequestRegistration {
            requests: Arc::clone(&self.requests),
            request_id,
        };
        forward_request(&session, request, &paths.manifest, cancellation).await
    }

    pub fn cancel_request(&self, request_id: &str) -> bool {
        let Ok(mut requests) = self.requests.lock() else {
            return false;
        };
        requests.cancel(request_id)
    }

    pub fn shutdown(&self) {
        let sidecar = {
            let Ok(mut core) = self.core.lock() else {
                return;
            };
            if core.phase == Phase::Stopped {
                return;
            }
            core.phase = Phase::Stopping;
            if let Some(cancellation) = core.start_cancellation.as_ref() {
                cancellation.cancel();
            }
            core.sidecar.clone()
        };
        if let Ok(mut requests) = self.requests.lock() {
            for cancellation in requests.active.values() {
                cancellation.cancel();
            }
            requests.cancelled_before_start.clear();
        }
        if let Some(sidecar) = sidecar {
            if let Ok(mut process) = sidecar.lock() {
                process.shutdown();
            }
        }
        if let Ok(mut core) = self.core.lock() {
            core.sidecar = None;
            core.phase = Phase::Stopped;
        }
    }

    fn register_request(&self, id: String) -> Result<(Session, CancellationToken), String> {
        let session = {
            let core = self
                .core
                .lock()
                .map_err(|_| "Forge local service is unavailable".to_owned())?;
            if core.phase != Phase::Ready {
                return Err("Forge local service is not ready".into());
            }
            core.sidecar
                .as_ref()
                .and_then(|sidecar| sidecar.lock().ok()?.session.clone())
                .ok_or_else(|| "Forge local service is not ready".to_owned())?
        };
        let cancellation = CancellationToken::new();
        let mut requests = self
            .requests
            .lock()
            .map_err(|_| "Forge local service is unavailable".to_owned())?;
        requests.register(id, cancellation.clone())?;
        Ok((session, cancellation))
    }

    fn spawn_and_verify(
        self: &Arc<Self>,
        paths: &RuntimePaths,
        cancellation: CancellationToken,
    ) -> Result<Arc<Mutex<OwnedSidecar>>, &'static str> {
        if cancellation.is_cancelled() {
            return Err("Forge startup was cancelled.");
        }
        if !paths.sidecar_path.is_file() {
            return Err("Forge's bundled local service is missing.");
        }
        let mut command = Command::new(&paths.sidecar_path);
        command
            .current_dir(&paths.data_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_remove("PYTHONPATH")
            .env_remove("PYTHONHOME")
            .env_remove("FORGE_DATABASE_URL")
            .env_remove("FORGE_RUNTIME_MODE")
            .env_remove("FORGE_RUNTIME_HOST")
            .env_remove("FORGE_RUNTIME_PORT")
            .env_remove("FORGE_FRONTEND_ORIGIN");
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);
        let mut child = command
            .spawn()
            .map_err(|_| "Forge could not launch its bundled local service.")?;
        let job = match OwnedJob::assign(&child) {
            Ok(job) => job,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Forge could not establish local service process ownership.");
            }
        };
        let mut stdin = child
            .stdin
            .take()
            .ok_or("Forge could not establish local service communication.")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Forge could not establish local service communication.")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Forge could not establish local service logging.")?;
        drain_stderr(stderr, paths.log_path.clone());

        let mut secret = Zeroizing::new([0u8; 32]);
        rand::rng().fill_bytes(&mut *secret);
        if write_bootstrap(&mut stdin, &secret, &paths.database_path).is_err() {
            let _ = child.kill();
            let _ = child.wait();
            drop(job);
            return Err("Forge could not initialize its local service.");
        }
        let (sender, receiver) = sync_channel(1);
        thread::Builder::new()
            .name("forge-sidecar-readiness".into())
            .spawn(move || {
                let result = read_ready_port(stdout);
                let _ = sender.send(result);
            })
            .map_err(|_| "Forge could not monitor its local service startup.")?;

        let sidecar = Arc::new(Mutex::new(OwnedSidecar {
            child,
            stdin: Some(stdin),
            job: Some(job),
            session: None,
            stopped: false,
        }));
        let stored = {
            let mut core = self
                .core
                .lock()
                .map_err(|_| "Forge local service is unavailable.")?;
            if core.phase == Phase::Stopping || cancellation.is_cancelled() {
                false
            } else {
                core.sidecar = Some(Arc::clone(&sidecar));
                true
            }
        };
        if !stored {
            if let Ok(mut process) = sidecar.lock() {
                process.shutdown();
            }
            return Err("Forge startup was cancelled.");
        }

        let port = match wait_ready_port(&sidecar, &receiver, &cancellation) {
            Ok(port) => port,
            Err(message) => return Err(message),
        };
        let session = Session::new(port, *secret);
        if !verify_authenticated_health(&session, cancellation.clone()) {
            return Err("Forge local service readiness verification failed.");
        }
        if let Ok(mut process) = sidecar.lock() {
            process.session = Some(session);
        } else {
            return Err("Forge local service state is unavailable.");
        }
        Ok(sidecar)
    }

    fn fail_startup(&self, paths: &RuntimePaths, message: &'static str, cancelled: bool) {
        write_log_line(&paths.log_path, format!("{message}\n").as_bytes());
        let sidecar = {
            let Ok(mut core) = self.core.lock() else {
                return;
            };
            let sidecar = core.sidecar.take();
            if !cancelled && core.phase != Phase::Stopping && core.phase != Phase::Stopped {
                core.phase = Phase::Failed;
                core.failure_message =
                    Some("Forge could not start its local service. Retry or review the local log.");
            }
            sidecar
        };
        if let Some(sidecar) = sidecar {
            if let Ok(mut process) = sidecar.lock() {
                process.shutdown();
            }
        }
    }
}

impl Default for DesktopRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for DesktopRuntime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct RequestRegistration {
    requests: Arc<Mutex<RequestState>>,
    request_id: String,
}

impl Drop for RequestRegistration {
    fn drop(&mut self) {
        if let Ok(mut requests) = self.requests.lock() {
            requests.active.remove(&self.request_id);
        }
    }
}

#[cfg(test)]
mod request_state_tests {
    use super::RequestState;
    use tokio_util::sync::CancellationToken;

    #[test]
    fn cancellation_arriving_before_request_registration_is_not_lost() {
        let mut state = RequestState::default();
        assert!(state.cancel("req-1"));
        let token = CancellationToken::new();
        state
            .register("req-1".into(), token.clone())
            .expect("register request");
        assert!(token.is_cancelled());
        assert!(state.cancelled_before_start.is_empty());
    }

    #[test]
    fn active_requests_are_cancelled_and_pending_cancellations_are_bounded() {
        let mut state = RequestState::default();
        let token = CancellationToken::new();
        state
            .register("active".into(), token.clone())
            .expect("register request");
        assert!(state.cancel("active"));
        assert!(token.is_cancelled());
        for index in 0..32 {
            assert!(state.cancel(&format!("pending-{index}")));
        }
        assert!(!state.cancel("overflow"));
    }
}

#[derive(Serialize)]
struct BootstrapMessage<'a> {
    session_secret: &'a str,
    database_path: &'a str,
}

fn write_bootstrap(
    stdin: &mut ChildStdin,
    secret: &[u8; 32],
    database_path: &Path,
) -> io::Result<()> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut secret_hex = Zeroizing::new(String::with_capacity(64));
    for byte in secret {
        secret_hex.push(HEX[(byte >> 4) as usize] as char);
        secret_hex.push(HEX[(byte & 0x0f) as usize] as char);
    }
    let path = database_path.to_string_lossy();
    serde_json::to_writer(
        &mut *stdin,
        &BootstrapMessage {
            session_secret: secret_hex.as_str(),
            database_path: path.as_ref(),
        },
    )
    .map_err(io::Error::other)?;
    stdin.write_all(b"\n")?;
    stdin.flush()
}

fn read_ready_port(stdout: impl Read) -> Result<u16, &'static str> {
    let mut reader = BufReader::new(stdout).take(129);
    let mut line = Vec::new();
    reader
        .read_until(b'\n', &mut line)
        .map_err(|_| "Forge local service readiness could not be read.")?;
    if line.len() > 128 || !line.ends_with(b"\n") {
        return Err("Forge local service readiness was invalid.");
    }
    let line = std::str::from_utf8(&line[..line.len() - 1])
        .map_err(|_| "Forge local service readiness was invalid.")?;
    let port_text = line
        .strip_prefix("FORGE_READY ")
        .ok_or("Forge local service readiness was invalid.")?;
    if port_text.is_empty() || !port_text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Forge local service readiness was invalid.");
    }
    let port = port_text
        .parse::<u16>()
        .map_err(|_| "Forge local service readiness was invalid.")?;
    if port == 0 {
        return Err("Forge local service readiness was invalid.");
    }
    Ok(port)
}

fn wait_ready_port(
    sidecar: &Arc<Mutex<OwnedSidecar>>,
    receiver: &Receiver<Result<u16, &'static str>>,
    cancellation: &CancellationToken,
) -> Result<u16, &'static str> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if cancellation.is_cancelled() {
            return Err("Forge startup was cancelled.");
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(result) => return result,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                return Err("Forge local service exited before readiness.");
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }
        let exited = sidecar
            .lock()
            .ok()
            .and_then(|mut process| process.child.try_wait().ok().flatten())
            .is_some();
        if exited {
            return Err("Forge local service exited before readiness.");
        }
    }
    Err("Forge local service startup timed out.")
}

fn verify_authenticated_health(session: &Session, cancellation: CancellationToken) -> bool {
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => return false,
    };
    runtime.block_on(async {
        let client = match reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(3))
            .build()
        {
            Ok(client) => client,
            Err(_) => return false,
        };
        let authorization = session.authorization_value();
        let endpoint = format!("http://127.0.0.1:{}/api/health", session.port);
        let host = format!("127.0.0.1:{}", session.port);
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if cancellation.is_cancelled() {
                return false;
            }
            let result = tokio::select! {
                _ = cancellation.cancelled() => return false,
                response = client
                    .get(&endpoint)
                    .header(reqwest::header::HOST, &host)
                    .header(reqwest::header::AUTHORIZATION, authorization.as_str())
                    .send() => response,
            };
            if let Ok(response) = result {
                if response.status().as_u16() == 200 {
                    if let Ok(payload) = response.json::<serde_json::Value>().await {
                        if payload.get("status").and_then(|value| value.as_str()) == Some("ok")
                            && payload.get("service").and_then(|value| value.as_str())
                                == Some("Forge")
                        {
                            return true;
                        }
                    }
                    return false;
                }
                return false;
            }
            tokio::select! {
                _ = cancellation.cancelled() => return false,
                _ = tokio::time::sleep(Duration::from_millis(100)) => {}
            }
        }
        false
    })
}

fn drain_stderr(stderr: impl Read + Send + 'static, log_path: PathBuf) {
    let _ = thread::Builder::new()
        .name("forge-sidecar-logs".into())
        .spawn(move || {
            let mut reader = BufReader::new(stderr);
            loop {
                let mut line = Vec::new();
                match reader.read_until(b'\n', &mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        if line.len() > MAX_LOG_LINE {
                            line.truncate(MAX_LOG_LINE);
                            line.extend_from_slice(b" [line truncated]\n");
                        }
                        write_log_line(&log_path, &line);
                    }
                }
            }
        });
}

fn write_log_line(path: &Path, line: &[u8]) {
    if line.is_empty() {
        return;
    }
    if fs::metadata(path)
        .map(|metadata| metadata.len().saturating_add(line.len() as u64) > MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        let rotated = path.with_extension("log.1");
        let _ = fs::remove_file(&rotated);
        let _ = fs::rename(path, rotated);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line);
    }
}

#[cfg(test)]
mod tests {
    use super::read_ready_port;

    #[test]
    fn readiness_handshake_is_strict_and_requires_a_valid_port() {
        assert_eq!(read_ready_port(&b"FORGE_READY 41234\n"[..]), Ok(41234));
        for invalid in [
            &b"FORGE_READY 0\n"[..],
            &b"FORGE_READY +123\n"[..],
            &b"FORGE_READY 12\r\n"[..],
            &b"OTHER 123\n"[..],
            &b"FORGE_READY 123"[..],
        ] {
            assert!(read_ready_port(invalid).is_err());
        }
    }
}
