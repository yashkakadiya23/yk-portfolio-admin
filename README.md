# Yash Kakadiya Portfolio + Admin Panel

A responsive portfolio website, contact form, and private admin dashboard backed by a small Node.js API. The frontend and admin panel are included as source files in this repository.

## Project structure

- `public/` — portfolio HTML, styles, and browser-side JavaScript.
- `admin/` — admin login, enquiry dashboard, and portfolio content manager.
- `server.js` and `portfolio.js` — Express server, contact/admin APIs, portfolio APIs, and static-file hosting.
- `data/portfolio-seed.json` — initial categories and migrated Health & Wellness case study.
- `data/portfolio.json` — live persistent categories, subcategories, projects, case studies, image references, and metrics; created from the seed on first startup and excluded from Git.
- `data/portfolio-uploads/` — validated portfolio images uploaded through the authenticated dashboard; keep this folder on persistent storage.
- `data/leads.json` and `data/admin-auth.json` — private enquiry and reset-credential data; these are excluded from Git.
- `package.json` and `package-lock.json` — runtime dependencies and reproducible dependency versions.
- `.env.example` — safe template for admin and Gmail SMTP configuration; secrets stay in the ignored `.env` file.

There is no separate database service configured. Enquiries and portfolio content are stored in JSON files, so use persistent storage and backups if deploying the app.

## Requirements

- Node.js 20 or newer (required by the current secure Nodemailer release).
- npm (included with Node.js).

## Install and run

From the project root, install the locked dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env` and set the admin credentials and Gmail App Password there. `.env` is loaded at startup and is excluded from Git. Use a Google App Password, not your normal Gmail password:

```powershell
Copy-Item .env.example .env
# Edit .env locally and set ADMIN_PASSWORD, ADMIN_TOKEN, and SMTP_PASSWORD.
npm start
```

Keep all passwords and generated tokens private. For Gmail, keep `SMTP_USER`, `SMTP_FROM`, and `ADMIN_RESET_EMAIL` set to the recovery Gmail address. Generate `ADMIN_TOKEN` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The sender address must be authorized by Gmail.

- Portfolio: <http://localhost:3000>
- Admin panel: <http://localhost:3000/admin/>

The admin login is unavailable until `ADMIN_PASSWORD` and `ADMIN_TOKEN` are set. The “Forgot password?” flow emails a one-time link to `ADMIN_RESET_EMAIL`; links expire after 15 minutes. After a reset, the password hash and rotated API token are saved in `data/admin-auth.json`, so keep this file private and preserve it across restarts. Set `APP_URL` to the public HTTPS origin when deploying.

After signing in, open **Portfolio content** to manage categories, subcategories, and projects. Draft projects are hidden from visitors. Published case studies appear in the matching industry category and use the existing case-study page design. Projects support galleries, screenshots, creatives, performance metrics, actual/estimated results, and a visitor preview. Category or subcategory deletion is blocked while it still contains child content.

Image uploads accept PNG, JPEG, WebP, and GIF files up to 8 MB each (32 MB total per upload request). The server checks image signatures, stores new files outside the public static directory, and only serves them publicly while referenced by a visible category or published project. Back up both `data/portfolio.json` and `data/portfolio-uploads/` before deployments or storage changes. The existing Health & Wellness case study and its screenshot are included in the initial seed; the prior HTML and image were copied to the ignored `data/portfolio-backup-20261017/` directory before migration.

Stop the server with `Ctrl+C`.

## Configuration and deployment

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`, and the SMTP/recovery variables using your hosting provider's secret/environment-variable settings. Also set `PORT` if the host requires a specific port. Deploy as a Node.js web service with HTTPS; a static-only host cannot run the API or admin panel. Do not use placeholder credentials in a deployed environment.

The JSON file store is intended for local development or a single-instance demo. For production, configure persistent storage (or migrate the storage to a database), restrict access to enquiry data, and maintain backups.

## Keeping the repository safe

The `.gitignore` excludes dependencies, environment files (except this placeholder template), local enquiry records, reset admin credentials, logs, and common private key files. Never commit real `.env` files, admin credentials, API keys, or customer enquiry data.
