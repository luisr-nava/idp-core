# 📘 Auth MS · Guía Rápida del Repositorio

Una vista rápida y amable para entender, correr y consumir el microservicio de autenticación multi-app. Sin rodeos, con iconografía y pasos claros.

---

## 🧭 Qué es y qué resuelve
- 🔐 Identidad y autenticación JWT por `appKey` (multi-app real).
- 👥 Usuarios OWNER / MANAGER / EMPLOYEE con herencia de plan por app.
- 💳 Suscripciones por `(ownerId + appKey)` sincronizadas con Stripe (solo en Auth).
- 📨 Emails externos (contenedor aparte) para verificación y recuperación.
- 🚫 No maneja lógica de negocio, stock, ventas ni reportes.

---

## 🏗️ Stack esencial
- NestJS + TypeScript
- TypeORM + PostgreSQL
- Stripe SDK (billing solo aquí)
- Docker / Docker Compose

---

## ⚡ Arranque rápido (dev / staging)
```bash
# Instalar dependencias (si no usas docker para build local)
npm ci

# Arrancar todo con Docker
docker compose up --build
```
El servicio se expone en `http://localhost:3001/api/v1`.

---

## 🔑 Configuración mínima (env)
- `ALLOWED_APP_KEYS` (obligatorio, coma-separated, lowercase) → ej: `tuapp,backoffice`
- `DEFAULT_APP_KEY` (opcional) → si tu entorno (por ejemplo `URL_BALANZIO`) siempre usa la misma app, el backend usará ese `appKey` si no llega en la request.
- Stripe: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`
- JWT: `JWT_SECRET`, `ISSUER`
- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Mailer: `MAIL_PROVIDER`, `MAIL_HOST`/`MAIL_PORT` o `RESEND_API_KEY`, `MAIL_FROM`

Si `appKey` no está en la allowlist → `401 Unauthorized`.

---

## 🚀 Endpoints que más usas
- `POST /auth/register` → Alta OWNER en una app (requiere `appKey`).
- `POST /auth/login` → Login por `(email + appKey)`; retorna JWT con plan/estado.
- `POST /auth/forgot-password` / `reset-password` → Flujo clásico por email.
- `POST /auth/recover-by-identity` / `recover-confirm` → Recuperación por documento (anti-enumeración, tokens one-time).
- `POST /billing/checkout` → Checkout Stripe para `(ownerId + appKey)`; responde `url` de Stripe.
- `POST /billing/portal` → Customer Portal URL.
- `POST /billing/webhook` → Webhooks Stripe (raw body + firma).

Documentación extendida: `AUTH_API.md` (API) y `AUTH_SERVICE_DETAILS.md` (integración avanzada).

---

## 🛡️ Seguridad en pocas líneas
- Allowlist estricta de `appKey` (sin fallback).
- Tokens de recuperación de un solo uso, expiración corta.
- Documentos de identidad hasheados; respuestas genéricas para evitar enumeración.
- Webhooks Stripe con firma obligatoria y metadata `{ ownerId, appKey }`.
- No se guardan `null` en persistencia; spreads condicionales en create/save.

---

## 🔁 Flujos típicos
1) Registro OWNER con `appKey` → email de verificación → `verify-code`.
2) Login `(email + appKey)` → JWT con plan/estado de esa app.
3) Billing: `checkout` → redirección a Stripe → webhook actualiza `Subscription` → siguiente login refleja el nuevo plan.
4) Recuperación sin email: `recover-by-identity` (respuesta genérica) → token por email real → `recover-confirm`.

---

## 📌 Tips para otros microservicios
- Siempre envía `appKey` permitido; no reutilices tokens entre apps.
- Confía en `plan` y `subscriptionStatus` del JWT para la autorización interna.
- No llames a Stripe directo: usa `/billing/checkout` y `/billing/portal`.
- Tras cambiar email/password, fuerza re-login.

---

Listo para compartir en el repo y para onboarding acelerado. 🛠️✨
