# Web application scope

## What this repository covers

This **SecurityAppDashboard** web app is scoped to the **admin / intelligence dashboard** slice of the Emergency Response product. **Mobile (React Native) is out of scope** for this codebase.

Two requirement sources apply:

| Source | Focus |
|--------|--------|
| **PDF brief** (Emergency Response development brief) | Public website & **admin dashboard**: secure access, incident metadata, analytics, reports, awareness content. |
| **Field / SAP milestones** (separate doc) | **Equipment** QR validation, SAP PM-style data, **defects** (operations). |

They are **different products** that share branding. This app may include **both** where needed: e.g. **Dashboard / Incidents / Analytics / Reports** align with the PDF web story; **Equipment** (and defect APIs) align with SAP operations.

## Current implementation mapping

- **PDF-aligned (web):** Dashboard metrics and incident lists are served from the **Node API** (`/api/dashboard/summary`, `/api/incidents`) when the server is running; pages **Incidents**, **Analytics**, **Reports**, and **Settings** replace empty placeholders.
- **SAP-aligned:** **Equipment** page and `/api/equipment`, `/api/qr`, `/api/defects` support technician / substation workflows.
- **Authentication:** Demo login in the UI; production should use **Keycloak** (or equivalent) per your security milestone—see server `SKIP_AUTH` and JWT settings.

## How to run (web + API)

1. `npm install` in the project root and in `server/`.
2. Configure `server/.env` (see `server/.env.example`).
3. Terminal A: `npm run dev:api` — API on port **3001** (default).
4. Terminal B: `npm run dev` — Vite proxies `/api` to the API.

Without the API, the dashboard falls back to static demo numbers where implemented in the UI.
