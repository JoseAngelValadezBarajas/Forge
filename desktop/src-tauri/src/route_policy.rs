use serde::Deserialize;
use std::collections::BTreeMap;
use thiserror::Error;
use url::form_urlencoded;

const MAX_REQUEST_BODY: usize = 8 * 1024 * 1024;
const MAX_PATH_AND_QUERY: usize = 16 * 1024;
const METHODS: &[&str] = &["delete", "get", "patch", "post", "put"];

#[derive(Debug, Deserialize)]
pub struct RouteManifest(BTreeMap<String, BTreeMap<String, Vec<String>>>);

#[derive(Debug, PartialEq, Eq)]
pub struct ValidatedApiRequest {
    pub method: String,
    pub path_and_query: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ApiBridgeError {
    #[error("unsupported HTTP method")]
    Method,
    #[error("request must be a relative API path")]
    Path,
    #[error("API operation is not available to the desktop client")]
    Route,
    #[error("query parameter is not declared for this operation")]
    Query,
    #[error("request body exceeds the desktop limit")]
    BodyTooLarge,
}

impl RouteManifest {
    pub fn from_json(source: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(source)
    }

    pub fn validate_request(
        &self,
        method: &str,
        relative_path_and_query: &str,
        body_len: usize,
    ) -> Result<ValidatedApiRequest, ApiBridgeError> {
        let normalized_method = method.to_ascii_lowercase();
        if !METHODS.contains(&normalized_method.as_str()) {
            return Err(ApiBridgeError::Method);
        }
        if body_len > MAX_REQUEST_BODY {
            return Err(ApiBridgeError::BodyTooLarge);
        }
        if relative_path_and_query.is_empty()
            || relative_path_and_query.len() > MAX_PATH_AND_QUERY
            || !relative_path_and_query.starts_with('/')
            || relative_path_and_query.starts_with("//")
            || relative_path_and_query
                .chars()
                .any(|character| matches!(character, '#' | '\\' | '\r' | '\n' | '\0'))
            || relative_path_and_query.contains("://")
        {
            return Err(ApiBridgeError::Path);
        }

        let (path, query) = relative_path_and_query
            .split_once('?')
            .map_or((relative_path_and_query, ""), |(path, query)| (path, query));
        if (path != "/api" && !path.starts_with("/api/")) || path.contains('%') {
            return Err(ApiBridgeError::Path);
        }
        let segments: Vec<_> = path.split('/').skip(1).collect();
        if segments.iter().any(|segment| {
            segment.is_empty()
                || *segment == "."
                || *segment == ".."
                || !segment.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '~')
                })
        }) {
            return Err(ApiBridgeError::Path);
        }

        let mut matching_routes = self
            .0
            .iter()
            .filter(|(template, _)| path_matches(template, path));
        let (_, route) = matching_routes.next().ok_or(ApiBridgeError::Route)?;
        if matching_routes.next().is_some() {
            return Err(ApiBridgeError::Route);
        }
        let operation = route.get(&normalized_method).ok_or(ApiBridgeError::Route)?;
        let allowed_names: std::collections::BTreeSet<_> =
            operation.iter().map(String::as_str).collect();
        for (name, _) in form_urlencoded::parse(query.as_bytes()) {
            if !allowed_names.contains(name.as_ref()) {
                return Err(ApiBridgeError::Query);
            }
        }
        Ok(ValidatedApiRequest {
            method: normalized_method,
            path_and_query: relative_path_and_query.to_owned(),
        })
    }
}

fn path_matches(template: &str, path: &str) -> bool {
    let template_segments: Vec<_> = template.split('/').skip(1).collect();
    let path_segments: Vec<_> = path.split('/').skip(1).collect();
    template_segments.len() == path_segments.len()
        && template_segments
            .iter()
            .zip(path_segments.iter())
            .all(|(expected, actual)| {
                (expected.starts_with('{') && expected.ends_with('}')) || expected == actual
            })
}

#[cfg(test)]
mod tests {
    use super::{ApiBridgeError, RouteManifest};

    fn routes() -> RouteManifest {
        RouteManifest::from_json(
            r#"{
              "/api/health": {"get": []},
              "/api/workspaces": {"get": ["search"], "post": []},
              "/api/projects/{project_id}/features/{feature_id}": {"get": ["include"]}
            }"#,
        )
        .expect("test manifest")
    }

    #[test]
    fn accepts_registered_api_operation_and_declared_query() {
        let request = routes()
            .validate_request("GET", "/api/workspaces?search=forge", 0)
            .expect("registered route");
        assert_eq!(request.method, "get");
    }

    #[test]
    fn matches_path_parameters_without_wildcarding_other_segments() {
        assert!(
            routes()
                .validate_request("GET", "/api/projects/p1/features/f1?include=criteria", 0,)
                .is_ok()
        );
        assert_eq!(
            routes().validate_request("GET", "/api/projects/p1/features", 0),
            Err(ApiBridgeError::Route)
        );
    }

    #[test]
    fn rejects_unknown_methods_routes_and_query_names() {
        assert_eq!(
            routes().validate_request("OPTIONS", "/api/health", 0),
            Err(ApiBridgeError::Method)
        );
        assert_eq!(
            routes().validate_request("GET", "/api/unknown", 0),
            Err(ApiBridgeError::Route)
        );
        assert_eq!(
            routes().validate_request("GET", "/api/workspaces?extra=x", 0),
            Err(ApiBridgeError::Query)
        );
    }

    #[test]
    fn rejects_authorities_dot_segments_encoded_separators_and_crlf() {
        for path in [
            "https://example.invalid/api/health",
            "//example.invalid/api/health",
            "/api/../health",
            "/api/a%2fhealth",
            "/api/a%5chealth",
            "/api/health\r\nHost: attacker.invalid",
        ] {
            assert!(
                routes().validate_request("GET", path, 0).is_err(),
                "accepted {path:?}"
            );
        }
    }

    #[test]
    fn enforces_request_body_limit() {
        assert_eq!(
            routes().validate_request("POST", "/api/workspaces", 8 * 1024 * 1024 + 1),
            Err(ApiBridgeError::BodyTooLarge)
        );
    }

    #[test]
    fn rejects_ambiguous_path_templates() {
        let manifest = RouteManifest::from_json(
            r#"{
              "/api/projects/{project_id}/features": {"get": []},
              "/api/{workspace_id}/features": {"get": ["include"]}
            }"#,
        )
        .expect("test manifest");
        assert_eq!(
            manifest.validate_request("GET", "/api/projects/features", 0),
            Err(ApiBridgeError::Route)
        );
    }
}
