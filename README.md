# Yash Kakadiya Portfolio + Admin Panel

A responsive portfolio website, contact form, and private admin dashboard backed by a small Node.js API. The frontend and admin panel are included as source files in this repository.

## Project structure

- `public/` — portfolio HTML, styles, and browser-side JavaScript.
- `admin/` — admin login and enquiry dashboard source.
- `server.js` — Express server, contact API, admin API, and static-file hosting.
- `data/` — local JSON enquiry storage. `data/leads.json` is created automatically and is intentionally excluded from Git because it contains personal information.
- `package.json` and `package-lock.json` — runtime dependencies and reproducible dependency versions.
- `.env.example` — names of the required environment variables with placeholder values only.

There is no separate database service configured. Enquiries are stored in `data/leads.json`, so use persistent storage and backups if deploying the app.

## Requirements

- Node.js 18 or newer.
- npm (included with Node.js).

## Install and run

From the project root, install the locked dependencies:

```sh
npm ci
```

Configure the admin login in the same terminal before starting the server. For PowerShell:

```powershell
$env:ADMIN_USERNAME = "your-admin-username"
$env:ADMIN_PASSWORD = "use-a-long-unique-password"
$env:ADMIN_TOKEN = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

Keep the password and generated token private. These environment variables apply only to the current terminal session. `.env.example` is a reference file; the app does not automatically load `.env` files.

- Portfolio: <http://localhost:3000>
- Admin panel: <http://localhost:3000/admin/>

Stop the server with `Ctrl+C`. The admin login is unavailable until both `ADMIN_PASSWORD` and `ADMIN_TOKEN` are set.

## Configuration and deployment

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN` using your hosting provider's secret/environment-variable settings. Also set `PORT` if the host requires a specific port. Deploy as a Node.js web service with HTTPS; a static-only host cannot run the API or admin panel. Do not use placeholder credentials in a deployed environment.

The JSON file store is intended for local development or a single-instance demo. For production, configure persistent storage (or migrate the storage to a database), restrict access to enquiry data, and maintain backups.

## Keeping the repository safe

The `.gitignore` excludes dependencies, environment files (except this placeholder template), local enquiry records, logs, and common private key files. Never commit real `.env` files, admin credentials, API keys, or customer enquiry data.
