use std::sync::Arc;
use url::Url;
use zeroize::Zeroizing;

pub const APP_ORIGIN: &str = "http://tauri.localhost";

#[derive(Clone)]
pub struct Session {
    pub port: u16,
    secret: Arc<Zeroizing<[u8; 32]>>,
}

impl Session {
    pub fn new(port: u16, secret: [u8; 32]) -> Self {
        Self {
            port,
            secret: Arc::new(Zeroizing::new(secret)),
        }
    }

    pub fn authorization_value(&self) -> Zeroizing<String> {
        let mut value = Zeroizing::new(String::with_capacity(71));
        value.push_str("Bearer ");
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for byte in self.secret.iter() {
            value.push(HEX[(byte >> 4) as usize] as char);
            value.push(HEX[(byte & 0x0f) as usize] as char);
        }
        value
    }
}

pub fn is_bundled_app_url(url: &Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("tauri.localhost")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

pub fn is_trusted_caller(label: &str, url: &Url) -> bool {
    label == "main" && is_bundled_app_url(url)
}

#[cfg(test)]
mod tests {
    use super::{Session, is_bundled_app_url, is_trusted_caller};

    #[test]
    fn caller_policy_requires_the_bundled_origin_and_main_label() {
        let app_url = "http://tauri.localhost/projects/p1".parse().expect("valid URL");
        let remote_url = "https://attacker.invalid/".parse().expect("valid URL");
        let spoofed_user = "http://user@tauri.localhost/".parse().expect("valid URL");
        let alternate_port = "http://tauri.localhost:8080/".parse().expect("valid URL");

        assert!(is_trusted_caller("main", &app_url));
        assert!(!is_trusted_caller("remote", &app_url));
        assert!(!is_trusted_caller("main", &remote_url));
        assert!(!is_bundled_app_url(&spoofed_user));
        assert!(!is_bundled_app_url(&alternate_port));
    }

    #[test]
    fn bearer_capability_is_hex_encoded_and_not_debuggable() {
        let session = Session::new(41234, [0xabu8; 32]);
        assert_eq!(
            session.authorization_value().as_str(),
            format!("Bearer {}", "ab".repeat(32))
        );
        assert_eq!(session.port, 41234);
    }
}
