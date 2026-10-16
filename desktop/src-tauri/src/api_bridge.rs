use crate::route_policy::{ApiBridgeError, RouteManifest};
use crate::session::{APP_ORIGIN, Session};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::header::{
    ACCEPT, AUTHORIZATION, CONTENT_DISPOSITION, CONTENT_TYPE, HOST, HeaderValue, ORIGIN,
};
use reqwest::{Client, Method, Response};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const MAX_RESPONSE_BODY: usize = 32 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApiRequest {
    pub request_id: String,
    pub method: String,
    pub path_and_query: String,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub status: u16,
    pub content_type: Option<String>,
    pub content_disposition: Option<String>,
    pub body_base64: String,
}

pub fn validate_request_manifest(
    manifest: &RouteManifest,
    request: &ApiRequest,
) -> Result<crate::route_policy::ValidatedApiRequest, String> {
    if request.request_id.is_empty()
        || request.request_id.len() > 96
        || !request
            .request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("invalid request identifier".into());
    }
    let body = request.body.as_deref().unwrap_or_default();
    if !body.is_empty() && serde_json::from_str::<serde_json::Value>(body).is_err() {
        return Err("request body must be JSON".into());
    }
    manifest
        .validate_request(&request.method, &request.path_and_query, body.len())
        .map_err(|_| "API operation is not available to the desktop client".to_owned())
}

fn safe_response_header(response: &Response, name: reqwest::header::HeaderName) -> Option<String> {
    let value = response.headers().get(name)?.to_str().ok()?;
    if value.len() > 1024 || value.bytes().any(|byte| byte.is_ascii_control()) {
        return None;
    }
    Some(value.to_owned())
}

pub async fn forward_request(
    session: &Session,
    request: ApiRequest,
    manifest: &RouteManifest,
    cancellation: CancellationToken,
) -> Result<ApiResponse, String> {
    let validated = validate_request_manifest(manifest, &request)?;
    let method = Method::from_bytes(validated.method.to_ascii_uppercase().as_bytes())
        .map_err(|_| "API operation is not available to the desktop client")?;
    let url = format!(
        "http://127.0.0.1:{}{}",
        session.port, validated.path_and_query
    );
    let host = format!("127.0.0.1:{}", session.port);
    let authorization = session.authorization_value();
    let authorization = HeaderValue::from_str(authorization.as_str())
        .map_err(|_| "desktop session is unavailable")?;
    let host = HeaderValue::from_str(&host).map_err(|_| "desktop backend is unavailable")?;
    let client = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| "desktop backend is unavailable")?;

    let mut outgoing = client
        .request(method, url)
        .header(HOST, host)
        .header(AUTHORIZATION, authorization)
        .header(ACCEPT, "application/json");
    if request.method.eq_ignore_ascii_case("post")
        || request.method.eq_ignore_ascii_case("patch")
        || request.method.eq_ignore_ascii_case("put")
        || request.method.eq_ignore_ascii_case("delete")
    {
        outgoing = outgoing.header(ORIGIN, APP_ORIGIN);
    }
    if let Some(body) = request.body {
        outgoing = outgoing.header(CONTENT_TYPE, "application/json").body(body);
    }

    let mut response = tokio::select! {
        _ = cancellation.cancelled() => return Err("request cancelled".into()),
        result = outgoing.send() => result.map_err(|_| "desktop backend is unavailable")?,
    };
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BODY as u64)
    {
        return Err("desktop API response exceeded the size limit".into());
    }
    let status = response.status().as_u16();
    let content_type = safe_response_header(&response, CONTENT_TYPE);
    let content_disposition = safe_response_header(&response, CONTENT_DISPOSITION);
    let mut body = Vec::new();
    loop {
        let next = tokio::select! {
            _ = cancellation.cancelled() => return Err("request cancelled".into()),
            chunk = response.chunk() => chunk.map_err(|_| "desktop backend response failed")?,
        };
        let Some(chunk) = next else { break };
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BODY {
            return Err("desktop API response exceeded the size limit".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(ApiResponse {
        status,
        content_type,
        content_disposition,
        body_base64: STANDARD.encode(body),
    })
}

#[cfg(test)]
mod tests {
    use super::{forward_request, validate_request_manifest, ApiRequest};
    use crate::route_policy::RouteManifest;
    use crate::session::Session;
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;
    use tokio_util::sync::CancellationToken;

    fn manifest() -> RouteManifest {
        RouteManifest::from_json(r#"{"/api/health":{"get":[]},"/api/workspaces":{"post":[]}}"#)
            .expect("valid manifest")
    }

    fn read_complete_request(stream: &mut TcpStream) -> String {
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let count = stream.read(&mut chunk).expect("read request");
            if count == 0 {
                break;
            }
            request.extend_from_slice(&chunk[..count]);
            if let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") {
                let header_text = String::from_utf8_lossy(&request[..header_end]);
                let content_length = header_text
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
        }
        String::from_utf8_lossy(&request).into_owned()
    }

    #[test]
    fn request_contract_accepts_only_declared_routes_and_json_body() {
        let valid = ApiRequest {
            request_id: "req_123".into(),
            method: "POST".into(),
            path_and_query: "/api/workspaces".into(),
            body: Some(r#"{"name":"Workspace"}"#.into()),
        };
        assert!(validate_request_manifest(&manifest(), &valid).is_ok());

        let unknown = ApiRequest {
            path_and_query: "https://attacker.invalid/api/health".into(),
            method: "GET".into(),
            body: None,
            ..valid
        };
        assert!(validate_request_manifest(&manifest(), &unknown).is_err());
    }

    #[test]
    fn request_contract_rejects_invalid_json_and_opaque_ids() {
        let invalid_json = ApiRequest {
            request_id: "req-1".into(),
            method: "POST".into(),
            path_and_query: "/api/workspaces".into(),
            body: Some("not-json".into()),
        };
        assert!(validate_request_manifest(&manifest(), &invalid_json).is_err());
        let invalid_id = ApiRequest {
            request_id: "../secret".into(),
            method: "GET".into(),
            path_and_query: "/api/health".into(),
            body: None,
        };
        assert!(validate_request_manifest(&manifest(), &invalid_id).is_err());
    }

    #[tokio::test]
    async fn forwards_only_fixed_security_headers_and_preserves_error_and_download_response() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock backend");
        let port = listener.local_addr().expect("listener address").port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let request = read_complete_request(&mut stream);
            let body = r#"{"detail":"expected conflict"}"#;
            write!(
                stream,
                "HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\nContent-Disposition: attachment; filename=report.json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
            request
        });
        let request = ApiRequest {
            request_id: "req-409".into(),
            method: "POST".into(),
            path_and_query: "/api/workspaces".into(),
            body: Some(r#"{"name":"Example"}"#.into()),
        };

        let response = forward_request(
            &Session::new(port, [0xabu8; 32]),
            request,
            &manifest(),
            CancellationToken::new(),
        )
        .await
        .expect("forward response");

        assert_eq!(response.status, 409);
        assert_eq!(response.content_type.as_deref(), Some("application/json"));
        assert_eq!(
            response.content_disposition.as_deref(),
            Some("attachment; filename=report.json")
        );
        assert_eq!(
            STANDARD.decode(response.body_base64).expect("base64 body"),
            br#"{"detail":"expected conflict"}"#
        );
        let request = server.join().expect("mock backend thread");
        assert!(request.contains("POST /api/workspaces HTTP/1.1"));
        assert!(
            request
                .to_ascii_lowercase()
                .contains(&format!("host: 127.0.0.1:{port}"))
        );
        assert!(request.contains(&format!("Authorization: Bearer {}", "ab".repeat(32))));
        assert!(request.contains("Origin: http://tauri.localhost"));
        assert!(request.ends_with(r#"{"name":"Example"}"#));
    }

    #[tokio::test]
    async fn returns_redirect_without_following_it_and_honors_pre_cancelled_requests() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock backend");
        let port = listener.local_addr().expect("listener address").port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request);
            stream
                .write_all(b"HTTP/1.1 302 Found\r\nLocation: http://attacker.invalid/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .expect("write redirect");
        });
        let response = forward_request(
            &Session::new(port, [0xabu8; 32]),
            ApiRequest {
                request_id: "req-redirect".into(),
                method: "GET".into(),
                path_and_query: "/api/health".into(),
                body: None,
            },
            &manifest(),
            CancellationToken::new(),
        )
        .await
        .expect("redirect response is not followed");
        assert_eq!(response.status, 302);
        server.join().expect("mock backend thread");

        let cancellation = CancellationToken::new();
        cancellation.cancel();
        let result = forward_request(
            &Session::new(port, [0xabu8; 32]),
            ApiRequest {
                request_id: "req-cancelled".into(),
                method: "GET".into(),
                path_and_query: "/api/health".into(),
                body: None,
            },
            &manifest(),
            cancellation,
        )
        .await;
        assert_eq!(
            result.expect_err("cancelled request rejected"),
            "request cancelled"
        );
    }
}
