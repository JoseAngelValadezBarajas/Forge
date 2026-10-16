# DESK-01 — Windows Desktop Architecture

Status: implementation specification approved by the project owner. Target: Windows 11 x64. This document describes the first installable desktop runtime; it does not introduce a hosted-Web architecture.

## Decisions and boundaries

```text
React (bundled Tauri WebView)
       │ invoke: fixed desktop commands; never receives a session token
       ▼
Rust/Tauri host ── starts/stops ──► PyInstaller onedir FastAPI sidecar
       │                                  │
       │ fixed loopback API requests      ├── Alembic migrations
       │ authenticated in Rust            └── SQLite under LocalAppData
       └────────────────────────────────────────────────────────────────
```

- `frontend/` remains the owner of React pages, product behavior, browser fetch transport, DTOs and visual styles. In a Tauri WebView, one small adapter calls the native IPC transport instead of `fetch`.
- `backend/` remains the owner of FastAPI routes, application/domain behavior, persistence and migrations. Desktop startup adds a process-local session-authenticated runtime; it does not alter API routes, payloads, planning fingerprints or database schema.
- `desktop/src-tauri/` owns the Windows window, IPC command handlers, sidecar process, per-launch session capability, loopback client, single-instance/migration lock and installer configuration.
- `scripts/` owns repeatable preparation and installed-product smoke entrypoints. `docs/desktop/` owns operator/build/recovery instructions.
- The only desktop transport methods exposed to the WebView are runtime status/retry, one bounded API request operation, and cancellation. There is no shell, filesystem, arbitrary process, URL-opening, generic HTTP, or user-selected command IPC.

## Version and security baseline

Pin the Rust Tauri runtime to `2.12.4`, `tauri-build` to `2.7.3`, the JavaScript API to `2.12.3`, the npm CLI to `2.12.2`, and Rust to `1.99.1` with target `x86_64-pc-windows-msvc`. Pin PyInstaller `6.22.3` in the locked desktop-build dependency group. Keep npm and Cargo lockfiles committed and require locked installation/builds in CI.

Tauri `2.12.4` is pinned above the patched versions for the relevant IPC advisories: `2.11.1` for remote-origin confusion and `2.11.6` for cross-WebView channel-response access. `2.12.4` was released after both fixes and includes the corresponding runtime. No `remote` capability or remote URL IPC access is configured. This version check does not replace auditing the resolved Cargo dependency graph; review Tauri advisories and release notes before changing the pin. References: [origin-confusion advisory](https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9), [IPC channel advisory](https://github.com/tauri-apps/tauri/security/advisories/GHSA-w28w-mhc8-qvjv), [Tauri 2.12.4 release](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.4), [Tauri capabilities](https://v2.tauri.app/security/capabilities/).

## Window, IPC and WebView security

- Build exactly one `main` WebView from bundled `frontend/dist`; do not load a dev server or remote page in a release build. Set the Forge product name, stable application identifier, graphite/copper application icon, 1360×900 initial dimensions and a usable minimum size. A React startup gate remains visible while the sidecar starts and gives actionable retry/log-location guidance after failure.
- The only capability is assigned to `main`, with no remote origins and no filesystem, shell, process, opener, HTTP, store or dialog plugin permissions. Every custom command independently checks both the `main` label and the exact bundled Windows app origin (`http://tauri.localhost`); any other window/origin is denied. Tauri's navigation callback allows only that app origin (including local SPA paths); external navigation and new windows are rejected rather than opened implicitly.
- Keep `withGlobalTauri` off. Do not add `dangerousRemoteUrlIpcAccess`. Set a restrictive production CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. Tauri's own CSP nonce/hash transformation remains enabled. Inline styles are retained only for the existing dynamic Readiness progress indicator; script execution has no `unsafe-inline` allowance. Revisit a directive only when a real bundled asset requires it; no external origin or backend TCP URL is allowed in `connect-src`.
- API requests carry only a relative `/api/...` path, HTTP method, optional JSON body and opaque cancellation id. A generated, checked-in route manifest is derived from the current FastAPI OpenAPI route registry. Rust accepts only an exact method/path-template match and query names declared for that operation; path parameters use a conservative segment alphabet. It rejects absolute/protocol-relative URLs, authority/fragment, encoded separators, dot segments, unknown methods/routes/query fields, arbitrary headers and oversized bodies. Rust chooses `http://127.0.0.1:<owned-ephemeral-port>`, Host, Origin, Authorization, timeouts and redirect policy itself. Redirects are disabled. Response status, JSON error body, content type, attachment filename and bytes are returned through IPC so the existing `ApiError`, JSON, 204 and download behavior remains equivalent. Existing download links are converted to a shared download helper only because an authenticated IPC request cannot be triggered by a plain anchor.
- Keep request/response caps explicit and tested: JSON request body ≤ 8 MiB, API response/download ≤ 32 MiB; reject overflow with a stable transport error. Do not log request bodies, headers, session data or response content. Cancellation uses an opaque request id and stops the Rust-side request task where possible; it does not claim to roll back a request already accepted by FastAPI.

The route manifest is generated from the backend's registered API operations (not from frontend-authored routes), checked against OpenAPI in quality CI, excludes docs/OpenAPI/static routes, and is compiled into the Rust host. This makes the IPC transport an API-specific bridge, not a general-purpose HTTP proxy.

## Sidecar startup, authentication and shutdown

1. Rust obtains `%LOCALAPPDATA%` through Tauri's path resolver and creates `%LOCALAPPDATA%\Forge\{data,logs,backups}`. A per-user-session Windows named mutex permits only one Forge process at a time, preventing duplicate migrations. The second launch exits with a clear “Forge is already running” message; it never attaches to or terminates another process.
2. Rust generates 32 cryptographically random bytes for the launch capability. It obtains Tauri's resource directory and resolves the exact bundled `resources/forge-sidecar/forge-sidecar.exe` beneath it, starts that file with no arguments and no shell, and has no dependency on the current directory/PATH/Python. The capability and database path are sent once over the child's private stdin pipe; they are never placed in command-line arguments, environment variables, URLs, localStorage or logs.
3. The sidecar validates the bootstrap input, configures `runtime_mode=desktop`, the explicit LocalAppData SQLite URL and the supplied capability in memory, then binds a socket to literal `127.0.0.1:0`. It passes that already-bound socket to Uvicorn, so a port is selected by the OS without a check-then-bind race. Its stdout is a protocol channel only; it emits one strict `FORGE_READY <port>` line after migrations and ASGI startup. Structured logs go to stderr/a bounded per-user log file.
4. Rust validates the readiness message and confirms it came from its retained child handle, then sends an authenticated `/api/health` request to that exact loopback port. Readiness is accepted only if status and service identity are correct. It never regards an already-running listener, port scan result, Host/Origin value or unauthenticated response as proof of ownership. Timeout, child exit, malformed readiness, wrong response or occupied/bind failure becomes a startup error; no unrelated process is contacted or killed.
5. In desktop mode, FastAPI requires `Authorization: Bearer <per-launch capability>` for every `/api` route, including `/api/health` and reads. Comparison is constant-time. Missing/invalid credentials return 401 before route/database access. The capability exists in Rust and the owned backend process memory only; React never receives it. Rust injects the exact Host (`127.0.0.1:<port>`) and the fixed bundled app Origin on mutations. Backend literal-loopback, configured-port Host and mutation-Origin validation remain enabled. The existing `development` behavior and opt-in browser `local` runtime remain unchanged and are not authenticated by this desktop capability.
6. Rust holds the child process handle and a Windows Job Object configured to terminate owned descendants when the app exits. Normal exit sends a shutdown line/EOF, waits a bounded interval, then terminates only the owned job if graceful shutdown fails. Unexpected app termination closes the job and is covered by the installed smoke. Do not use process-name killing or PID guesses.

Threat model: this protects the bundled WebView from remote-page IPC and protects a loopback API from unauthenticated independent local callers who can discover the ephemeral port. It is not authentication against malware running with the same Windows user, a local administrator/debugger, code execution inside Forge's renderer, or an attacker who can replace installed binaries or inspect the backend process memory. Host validation is DNS-rebinding defense, not local-process authentication.

## Backend bundle and runtime resources

- Build `backend/desktop_sidecar.py` as a Windows x64 PyInstaller `onedir` app named `forge-sidecar`. `backend/desktop_sidecar.spec` includes only the app package, FastAPI/SQLAlchemy/Alembic runtime modules, migrations and `alembic.ini`; it excludes tests, `.venv`, Node and source checkout data. The generated `forge-sidecar/` directory is copied under Tauri resources and packaged with the installer.
- Use `sys._MEIPASS`/the frozen runtime root to locate migration scripts and config; never use `C:\Dev\Forge`, a developer working directory or mutable files under the install directory for user data. The sidecar starts the same real FastAPI app and the same Alembic migration chain. There is no network download at first launch.
- PyInstaller itself and its generated bootloader are third-party components; retain its license/bootloader-exception notices and include a dependency/license inventory with the build. Do not claim Forge owns third-party code. Build an x64 bundle on Windows with Python 3.12 and the locked `desktop-build` group; PyInstaller bundles its Python runtime and declared dependencies. Reference: [PyInstaller one-folder mode](https://pyinstaller.org/en/stable/operating-mode.html).

## User data, migrations, backups and upgrades

- Production data is `%LOCALAPPDATA%\Forge\data\forge.db`; logs are in `logs`; pre-migration SQLite snapshots are in `backups`. No runtime write targets the installer directory or the development database `C:\Dev\Forge\.forge\data\forge.db`.
- First run creates directories and runs `alembic upgrade head` against the resolved LocalAppData database. It does not seed sample Workspaces or Projects; the user creates the first real Workspace in the existing UI. Repeated migration startup is idempotent and serialized by the single-instance lock.
- Before an upgrade migration, create a SQLite-consistent backup using SQLite's backup API, verify it can be opened and passes `PRAGMA integrity_check`, and keep it separately. Migration failure stops startup and preserves both the original database and backup; there is no silent delete, destructive reset or automatic rollback. The recovery guide explains how to close Forge, copy/restore a verified backup, and retry.
- NSIS upgrade replaces application files only. It must not replace, migrate, or delete user data except by running the existing forward Alembic migrations. Uninstall removes app binaries/shortcuts/registration only; LocalAppData data, logs and backups remain. CI verifies this behavior. A backup and restore procedure is user-controlled.

## Git and repository authorization

Git remains an optional external prerequisite. Forge planning works without Git. Repository observation requires a compatible `git` executable available on the launching user's PATH; DESK-01 does not bundle Git or execute Git hooks. The existing observer continues to use fixed read-only Git commands, timeouts and process cleanup. Existing canonicalization/symlink checks and `FORGE_ALLOWED_REPOSITORY_ROOTS` apply to both connect and every observation.

By default, the existing Settings policy approves the current user's home directory and the packaged project root; it never approves the entire filesystem. To authorize repositories elsewhere, set the user/environment value `FORGE_ALLOWED_REPOSITORY_ROOTS` to a JSON array of existing absolute directory paths, for example `["D:\\Work\\Projects"]`, then restart Forge. Existing connections outside a subsequently changed allowlist remain readable but cannot be observed until an operator explicitly adds an appropriate root. This compatibility impact is intentional and documented in `docs/development.md`.

## Windows installer, signing and build inputs

- Produce a per-user NSIS installer (`currentUser`), Start-menu shortcut, versioned Forge metadata and uninstaller. Do not request elevation by default. Keep WebView2 handling explicit; Windows 11 includes the Evergreen runtime, and the default bootstrapper policy can install/update it when missing (requires network). Do not embed a 127 MB offline runtime without a concrete offline deployment requirement.
- Build inputs: Windows x64; Rust 1.99.1 MSVC target; Microsoft C++ Build Tools with Desktop development with C++, MSVC linker and Windows SDK; Node/npm pinned by `.node-version`/`package-lock.json`; Python 3.12 + uv + `uv.lock`; NSIS; Git for repository features. WebView2 is required at run time. Exact setup and verification commands are in `docs/desktop/desk-01-windows-alpha.md`.
- Local detection on 2026-10-16: Windows 11 Pro x64 build 26300 and WebView2 Runtime 155.0.4283.45 were found; Rust, Cargo, MSVC `cl.exe`/`vswhere` and NSIS `makensis` were not found. PyInstaller 6.22.3 was installed only inside the repository's locked virtual environment, and the Windows x64 onedir sidecar was built there; this is not an installed desktop app. No system tools were installed. Local Tauri compilation/installer execution is unavailable unless the owner installs the documented prerequisites. Windows CI may certify build and installation, but its actual OS and installed-product checks must be reported; packaging-only success is insufficient.
- No signing certificate is assumed. The alpha installer is unsigned unless a real owner-provided certificate and signing workflow are later configured. Document expected SmartScreen/unknown-publisher warnings; never claim a trusted publisher, disable Defender/SmartScreen, or publish a release.

## Installed-product acceptance

The Windows workflow must build and sign no artifacts, hash the NSIS installer, install it into a disposable Windows user profile, and launch the installed executable—not `tauri dev`. Its smoke must:

1. Assert Start-menu app and uninstaller exist and the installed binary loads the bundled WebView frontend and PyInstaller sidecar without Python, Node, Vite, uv or checkout paths.
2. Create and retrieve a Workspace, Project and Feature through accessible UI flows; close Forge normally; verify only its owned sidecar/job exits; relaunch and confirm the records persist.
3. Launch a second Forge instance and prove it does not start a second migration/sidecar. Hold an unrelated loopback listener during startup, prove Forge selects another ephemeral port and the sentinel receives no request and remains alive.
4. Discover the sidecar listener by its owned process for test purposes and assert unauthenticated GET reads and mutations fail, authenticated same-window requests work, arbitrary Host/Origin do not establish trust, and an external URL/new window is rejected.
5. Uninstall silently in the disposable profile, assert the database remains byte-identical/readable, reinstall, and confirm the user records remain. Exercise Alembic fresh and upgrade-from-current-schema fixtures with temporary databases.
6. Compute SHA-256 over the produced installer and upload the installer plus checksum as a commit-identified Actions artifact. Do not create a GitHub Release or tag.

The Actions runner platform must be named exactly in the report. A Windows Server runner's installed smoke is genuine Windows installation evidence but is not described as a Windows 11-specific run. If the only evidence is build/package success, the installer acceptance remains blocked.

## Explicit non-goals

No FND-07 or new planning/delivery capability; no backend/frontend contract changes; no schema/fingerprint changes; no hosted Web or synchronization model; no Git writes, agent execution, arbitrary shell/HTTP proxy, public release, automatic signing, bundled Git, code-signing purchase or telemetry.
