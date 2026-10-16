fn main() {
    let commands = [
        "desktop_runtime_status",
        "desktop_retry_start",
        "desktop_api_request",
        "desktop_cancel_api_request",
    ];
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&commands));
    tauri_build::try_build(attributes).expect("failed to configure Forge desktop ACL");
}
