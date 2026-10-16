# Forge Windows Desktop Alpha

DESK-01 packages the existing React/FastAPI product as a Windows x64 desktop app. The bundled React app runs in one Tauri 2 WebView; Rust starts and owns an authenticated FastAPI sidecar on an ephemeral loopback port. User data is separate from the installed application.

This is a source checkout/build guide, not evidence that a machine has installed Forge. Installer acceptance is claimed only after the Windows Actions workflow installs, launches, exercises, uninstalls and reinstalls the actual NSIS artifact. A Windows Server runner is reported as Windows Server, never as Windows 11.

## Prerequisites

The pinned toolchain is Windows x64, Rust `1.99.1` with `x86_64-pc-windows-msvc`, Node.js `24.13.0`, npm `11.6.2`, Python `3.12`, uv, Visual Studio C++ Build Tools, NSIS and WebView2 Evergreen Runtime. Git is optional and needed only for repository observation. The installed product does not need Node, Python, uv, Rust, MSVC or NSIS.

From an elevated PowerShell only when machine-wide C++ tools are needed, install Visual Studio 2022 Build Tools and its C++ workload using Microsoft's documented bootstrapper:

```powershell
$installer = Join-Path $env:TEMP 'vs_BuildTools.exe'
Invoke-WebRequest 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile $installer
Start-Process -FilePath $installer -ArgumentList @(
  '--wait', '--quiet', '--norestart',
  '--add', 'Microsoft.VisualStudio.Workload.VCTools',
  '--includeRecommended'
) -Wait
```

The `Microsoft.VisualStudio.Workload.VCTools` workload supplies the MSVC compiler/linker and Windows SDK components. Open **Developer PowerShell for VS 2022** and verify `cl.exe /Bv`; also verify `vswhere.exe` exists under `C:\Program Files (x86)\Microsoft Visual Studio\Installer\`.

Install rustup, then the exact repository toolchain and target:

```powershell
winget install --id Rustlang.Rustup --exact
rustup toolchain install 1.99.1-x86_64-pc-windows-msvc --profile minimal --component rustfmt --component clippy
rustup target add x86_64-pc-windows-msvc --toolchain 1.99.1-x86_64-pc-windows-msvc
rustc +1.99.1-x86_64-pc-windows-msvc --version
cargo +1.99.1-x86_64-pc-windows-msvc --version
```

Install the exact Node.js 24.13.0 x64 MSI from the official Node.js release distribution, then pin npm and verify both versions:

```powershell
$nodeMsi = Join-Path $env:TEMP 'node-v24.13.0-x64.msi'
Invoke-WebRequest 'https://nodejs.org/dist/v24.13.0/node-v24.13.0-x64.msi' -OutFile $nodeMsi
Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $nodeMsi, '/qn', '/norestart') -Wait
npm install --global npm@11.6.2
node --version
npm --version
```

Install Python 3.12 and Git using the official installers or `winget`; install uv with its official PowerShell installer if it is not already available:

```powershell
winget install --id Python.Python.3.12 --exact
winget install --id Git.Git --exact
irm https://astral.sh/uv/install.ps1 | iex
python --version
uv --version
git --version
```

Install NSIS with an approved package manager, for example `choco install nsis --yes`, and verify `makensis.exe /VERSION`. Windows 11 normally includes WebView2 Evergreen Runtime; if missing, install the Microsoft [WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/). The configured NSIS bootstrapper can download the runtime when it is missing, so first installation then needs network access. No sign-in is required.

These commands are provided for operators; DESK-01 did not install system tools on the development machine. The verified local environment had Windows 11 Pro x64 and WebView2, but no Rust, Cargo, MSVC or NSIS. PyInstaller was installed only in the repository's locked Python environment. The local installer therefore remains unbuilt until a Windows toolchain runner provides the evidence below.

## Build from a clean checkout

Run from the repository root in a Developer PowerShell for Visual Studio:

```powershell
uv sync --locked --dev --group desktop-build
Push-Location frontend
npm ci
npm run desktop:prepare
npm run desktop:build
Pop-Location
```

`desktop:prepare` verifies the generated OpenAPI route manifest, builds the bundled React assets, produces the PyInstaller `onedir` sidecar and Alembic resources, and generates the Windows icons. `desktop:build` creates only an unsigned per-user NSIS installer for `x86_64-pc-windows-msvc`. It writes the installer and SHA-256 file under the ignored `desktop/bundle/` directory. It does not create a tag or release.

The Windows Actions workflow additionally runs Rust format/tests/Clippy, installs the actual setup executable into a disposable runner profile, and drives its visible window through native Windows UI Automation (`UIAutomationClient`). It launches the unmodified production executable without WebView debugging arguments or registry overrides, exercises workspace/project/feature persistence, probes unauthenticated loopback access from an independent process, captures the real app window, verifies sidecar exit, uninstalls and reinstalls, and confirms the SQLite database remains byte-identical. Screenshots and setup checksum are uploaded with the commit SHA. Packaging alone is not installed-product acceptance.

## First launch and data

The per-user installer does not request elevation. The application starts its backend automatically; Python, Node, Git, a terminal and a manually started server are not required for ordinary planning use. The window displays a startup status until Rust has authenticated the owned sidecar's readiness response. If startup fails, use **Retry local service** and review:

```text
%LOCALAPPDATA%\Forge\logs\forge-desktop.log
```

Persistent files are stored outside the install directory:

```text
%LOCALAPPDATA%\Forge\data\forge.db
%LOCALAPPDATA%\Forge\logs\forge-desktop.log
%LOCALAPPDATA%\Forge\logs\forge-desktop.log.1
%LOCALAPPDATA%\Forge\backups\forge-<UTC timestamp>.db
```

First run applies the repository's existing Alembic head and opens the normal empty Workspace state. No sample Workspace, Project, Feature, repository or delivery record is seeded. Upgrades use a verified SQLite backup, migrate a staging copy, run an integrity check and replace the database only after success. A failed migration leaves the prior database and backup intact.

Before a user-controlled manual backup or restore, exit Forge completely. Copy `forge.db` and, optionally, the `backups` directory to a protected location. To restore, close Forge, preserve a copy of the current database, replace `data\forge.db` with the chosen verified backup, then relaunch. Do not restore or migrate while the app is running. Uninstall removes application files and shortcuts but deliberately preserves the entire `%LOCALAPPDATA%\Forge` directory. Reinstalling the same per-user app reuses that data and applies forward migrations.

## Optional Git observations

Git is an optional external prerequisite; all planning workflows work without it. To observe repositories, install Git for Windows and ensure `git.exe` is on the environment `PATH` inherited by Forge. Forge issues the existing bounded, read-only Git commands; DESK-01 does not bundle Git, run hooks, write commits or access remotes.

Repository connection and every observation must resolve under an approved repository root. The default policy is limited to the current user's home and packaged project root; it never trusts the whole filesystem. To approve another existing directory, configure `FORGE_ALLOWED_REPOSITORY_ROOTS` as a JSON array in the user environment and restart Forge, for example:

```powershell
[Environment]::SetEnvironmentVariable(
  'FORGE_ALLOWED_REPOSITORY_ROOTS',
  '["D:\Work\Projects"]',
  'User'
)
```

This restricts observation, not historical reads: existing connection records remain visible if a later policy change excludes their paths, but new observations are denied until an operator approves the appropriate root. Keep the list narrow and use real absolute paths; symlinks are resolved before authorization.

## Installer trust and verification

The alpha installer is unsigned. Windows may show an unknown publisher or SmartScreen warning. This build does not claim a trusted publisher, code-signing certificate, Microsoft Store identity or release status. Do not disable SmartScreen or Defender to install it. Verify the downloaded Actions artifact against its adjacent `.sha256` file before opening it:

```powershell
Get-FileHash .\Forge_0.1.0_x64-setup.exe -Algorithm SHA256
Get-Content .\Forge_0.1.0_x64-setup.exe.sha256
```

Host validation in the local sidecar prevents a hostile DNS name from reaching the loopback API. It is not authentication against malware or another process running as the same Windows user. Session authentication is required for every API operation; the token remains in Rust and the owned Python process, not the WebView, URL, local storage or logs.

## Certification limits

The installed smoke does not enable WebView2 remote debugging, inject JavaScript, or inspect the renderer's DOM/network/console. It uses the Windows accessibility tree and UI Automation patterns for visible user flows; independent-process HTTP probes and the existing Rust/frontend security and transport tests cover the API and navigation boundaries without modifying the product binary. No registry policy or machine configuration is changed. GitHub's `windows-2025` runner is Windows Server 2025, not Windows 11. A passing install smoke proves the packaged product ran on the reported runner; Windows 11-specific certification requires a real Windows 11 installed-product run. FND-07, hosted Web, signing, releases and new product capabilities are not part of DESK-01.
