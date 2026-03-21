use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::Arc;

/// Custom resolver that forces IPv4 resolution.
/// gcdn.thunderstore.io's IPv6 endpoint resets TLS handshakes,
/// but IPv4 works fine. Force IPv4 for all connections.
struct Ipv4Resolver;

impl ureq::Resolver for Ipv4Resolver {
    fn resolve(&self, netloc: &str) -> std::io::Result<Vec<SocketAddr>> {
        let addrs: Vec<SocketAddr> = netloc
            .to_socket_addrs()?
            .filter(|a| a.is_ipv4())
            .collect();
        if addrs.is_empty() {
            Err(std::io::Error::new(
                std::io::ErrorKind::AddrNotAvailable,
                format!("No IPv4 address found for {}", netloc),
            ))
        } else {
            Ok(addrs)
        }
    }
}

/// Build a ureq Agent using the OS native TLS stack (Windows Schannel)
/// with forced IPv4 resolution to avoid broken IPv6 on some CDNs.
pub fn agent() -> ureq::Agent {
    let tls = native_tls::TlsConnector::new().expect("Failed to init native TLS");
    ureq::AgentBuilder::new()
        .tls_connector(Arc::new(tls))
        .resolver(Ipv4Resolver)
        .build()
}
