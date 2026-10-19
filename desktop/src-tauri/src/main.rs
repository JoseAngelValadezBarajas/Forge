#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api_bridge;
mod lifecycle;
mod route_policy;
mod session;
mod windows_process;

use api_bridge::{ApiDownloadResponse, ApiRequest, ApiResponse, save_download};
use lifecycle::{DesktopRuntime, RuntimePaths, RuntimeStatus};
use session::is_trusted_caller;
use std::io;
use std::sync::Arc;
use tauri::{Manager, State, WebviewWindow};

#[tauri::command]
fn desktop_runtime_status(
    window: WebviewWindow,
    runtime: State<'_, Arc<DesktopRuntime>>,
) -> Result<RuntimeStatus, String> {
    verify_bundled_caller(&window)?;
    Ok(runtime.status())
}

#[tauri::command]
fn desktop_retry_start(
    window: WebviewWindow,
    runtime: State<'_, Arc<DesktopRuntime>>,
) -> Result<(), String> {
    verify_bundled_caller(&window)?;
    runtime.start_background()
}

#[tauri::command]
async fn desktop_api_request(
    window: WebviewWindow,
    runtime: State<'_, Arc<DesktopRuntime>>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    verify_bundled_caller(&window)?;
    runtime.api_request(request).await
}

#[tauri::command]
async fn desktop_save_download(
    window: WebviewWindow,
    app: tauri::AppHandle,
    runtime: State<'_, Arc<DesktopRuntime>>,
    request: ApiRequest,
    fallback_filename: String,
) -> Result<ApiDownloadResponse, String> {
    verify_bundled_caller(&window)?;
    let response = runtime.api_request(request).await?;
    save_download(&app, response, &fallback_filename)
}

#[tauri::command]
fn desktop_cancel_api_request(
    window: WebviewWindow,
    runtime: State<'_, Arc<DesktopRuntime>>,
    request_id: String,
) -> Result<bool, String> {
    verify_bundled_caller(&window)?;
    if request_id.is_empty()
        || request_id.len() > 96
        || !request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("invalid request identifier".into());
    }
    Ok(runtime.cancel_request(&request_id))
}

fn verify_bundled_caller(window: &WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "desktop command caller is not trusted".to_owned())?;
    if is_trusted_caller(window.label(), &url) {
        Ok(())
    } else {
        Err("desktop command caller is not trusted".into())
    }
}

fn main() {
    let runtime = Arc::new(DesktopRuntime::new());
    let run_runtime = Arc::clone(&runtime);
    let application = tauri::Builder::default()
        .manage(runtime)
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_status,
            desktop_retry_start,
            desktop_api_request,
            desktop_save_download,
            desktop_cancel_api_request
        ])
        .setup(|app| {
            let local_data_dir = app.path().local_data_dir()?;
            let data_root = local_data_dir.join("Forge");
            let resource_root = app.path().resource_dir()?;
            let sidecar_paths =
                RuntimePaths::new(data_root, resource_root).map_err(io::Error::other)?;
            let instance_lock = match windows_process::SingleInstanceLock::acquire() {
                Ok(lock) => lock,
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    windows_process::show_already_running();
                    return Err(Box::new(error));
                }
                Err(error) => return Err(Box::new(error)),
            };
            let runtime = app.state::<Arc<DesktopRuntime>>().inner().clone();
            runtime
                .configure(sidecar_paths, instance_lock)
                .map_err(io::Error::other)?;

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Forge")
            .inner_size(1360.0, 900.0)
            .min_inner_size(1024.0, 640.0)
            .resizable(true)
            .on_navigation(session::is_bundled_app_url)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .build()?;

            runtime.start_background().map_err(io::Error::other)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                let runtime = window
                    .app_handle()
                    .state::<Arc<DesktopRuntime>>()
                    .inner()
                    .clone();
                runtime.shutdown();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to initialize Forge desktop host");

    application.run(move |_, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            run_runtime.shutdown();
        }
    });
}
