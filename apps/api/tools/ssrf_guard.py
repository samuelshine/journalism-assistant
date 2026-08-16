"""Guards tools that fetch an arbitrary, model- or user-supplied URL against
SSRF: a crafted or redirected URL pointing at localhost, a private network
range, or a cloud metadata endpoint (169.254.169.254) instead of a real
public article. Only http(s) is allowed, and the hostname is resolved and
checked *before* connecting — including on every redirect hop, since a
public-looking URL that 302s to an internal address is the standard bypass
for a naive one-time check."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}


class UnsafeURLError(Exception):
    pass


def assert_safe_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise UnsafeURLError(f"unsupported scheme: {parsed.scheme!r}")
    if not parsed.hostname:
        raise UnsafeURLError("URL has no hostname")

    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as e:
        raise UnsafeURLError(f"could not resolve host {parsed.hostname!r}: {e}") from e

    for _family, _type, _proto, _canonname, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise UnsafeURLError(f"refusing to fetch an internal/private address ({ip})")
