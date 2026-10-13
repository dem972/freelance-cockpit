"""Client for the TypeScript API: business data and the calculation engine.

The agents never compute amounts themselves: they go through these calls.
"""

from typing import Any

import httpx

from .config import Settings

Json = Any


class ApiClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        self._http = httpx.Client(
            base_url=settings.api_url,
            headers={"Authorization": f"Bearer {settings.agent_api_token.get_secret_value()}"},
            timeout=30,
            transport=transport,
        )

    def _get(self, path: str, **params: Any) -> Json:
        response = self._http.get(path, params=params)
        response.raise_for_status()
        return response.json()

    def _send(self, method: str, path: str, body: Json) -> Json:
        response = self._http.request(method, path, json=body)
        if response.status_code >= 400:
            raise ApiError(response.status_code, response.text)
        return response.json() if response.content else None

    # --- read ---------------------------------------------------------------
    def cockpit(self, year: int) -> Json:
        return self._get("/cockpit", year=year)

    def alerts(self, year: int) -> Json:
        return self._get("/alerts", year=year)

    def transactions(self, year: int) -> Json:
        return self._get("/transactions", year=year)

    def invoices(self, year: int) -> Json:
        return self._get("/invoices", year=year)

    def deadlines(self, year: int) -> Json:
        return self._get("/deadlines", year=year)

    def settings_timeline(self) -> Json:
        return self._get("/settings")

    def projection(self, year: int) -> Json:
        return self._get(f"/projections/{year}")

    def rates(self, year: int) -> Json:
        return self._get("/rates", year=year)

    def simulate(self, body: Json) -> Json:
        return self._send("POST", "/simulate", body)

    # --- write (only after user approval) --------------------------------------
    def add_transaction(self, body: Json) -> Json:
        return self._send("POST", "/transactions", body)

    def add_invoice(self, body: Json) -> Json:
        return self._send("POST", "/invoices", body)

    def pay_invoice(self, invoice_id: int, date: str) -> Json:
        return self._send("POST", f"/invoices/{invoice_id}/pay", {"date": date})

    def pay_deadline(self, deadline_id: int, date: str) -> Json:
        return self._send("POST", f"/deadlines/{deadline_id}/pay", {"date": date})

    def put_settings(self, timeline: Json) -> Json:
        return self._send("PUT", "/settings", timeline)

    def put_projection(self, year: int, body: Json) -> Json:
        return self._send("PUT", f"/projections/{year}", body)


class ApiError(Exception):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"API {status}: {body[:300]}")
        self.status = status
