"""Shared HTTP networking helpers."""
import urllib.request
import httpx


def build_proxy_mounts() -> dict:
    """Convert urllib system proxies to httpx mounts format."""
    raw = urllib.request.getproxies()
    mounts = {}
    if "https" in raw:
        mounts["https://"] = httpx.AsyncHTTPTransport(proxy=raw["https"], verify=False)
    if "http" in raw:
        mounts["http://"] = httpx.AsyncHTTPTransport(proxy=raw["http"])
    return mounts


PROXY_MOUNTS = build_proxy_mounts()
