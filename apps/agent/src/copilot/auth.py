"""Cloudflare Access JWT verification, same rules as the TypeScript API."""

from collections.abc import Callable
from typing import Any

import jwt
from fastapi import HTTPException, Request

from .config import Settings

HEADER = "Cf-Access-Jwt-Assertion"


def make_verifier(
    settings: Settings, get_key: Callable[[str], Any] | None = None
) -> Callable[[Request], str]:
    """Returns a FastAPI dependency giving the verified email (or 'local')."""
    if settings.auth_mode == "none":

        def local(request: Request) -> str:
            return "local"

        return local

    issuer = f"https://{settings.cf_access_team_domain}"
    allowed = {e.strip().lower() for e in settings.allowed_emails.split(",") if e.strip()}
    if get_key is None:
        client = jwt.PyJWKClient(f"{issuer}/cdn-cgi/access/certs", cache_keys=True)

        def get_key(token: str) -> Any:
            return client.get_signing_key_from_jwt(token).key

    resolve = get_key

    def verify(request: Request) -> str:
        token = request.headers.get(HEADER, "")
        if not token:
            raise HTTPException(status_code=401, detail="unauthenticated")
        try:
            claims = jwt.decode(
                token,
                resolve(token),
                algorithms=["RS256"],
                audience=settings.cf_access_aud,
                issuer=issuer,
                options={"require": ["exp", "iss", "aud"]},
            )
        except Exception as exc:
            raise HTTPException(status_code=401, detail="unauthenticated") from exc
        email = str(claims.get("email", "")).lower()
        if email not in allowed:
            raise HTTPException(status_code=403, detail="forbidden")
        return email

    return verify
