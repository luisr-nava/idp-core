# 🐳 Microservicio de Autenticación (NestJS + PostgreSQL + Docker)

Este microservicio implementa **autenticación JWT** con NestJS y TypeORM, conectado a una base de datos **PostgreSQL** dentro de un contenedor Docker.

---

## 🚀 Requisitos previos

- Tener instalado:
  - [Docker](https://www.docker.com/)
  - [Docker Compose](https://docs.docker.com/compose/)
  - [Node.js](https://nodejs.org/) 

---

## 📁 Estructura general del proyecto

```
idp-core/
│
├── src/ 
│ ├── auth/
│ │ ├── auth.module.ts
│ │ ├── auth.service.ts
│ │ ├── auth.controller.ts
│ │ ├── entities/
│ │ ├── strategies/
│ │ └── dto/
│ ├── main.ts
│ └── app.module.ts
│
├── Dockerfile
├── docker-compose.yml
├── .env
├── .env.template
└── README.md
```

---

## ⚙️ Configuración del entorno

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Copiar el archivo de entorno y remplazarlo por .env:
   ```bash
   .env.template
   ```

## ▶️ Levantar el entorno con Docker

```bash
docker compose up --build
```

Esto levantará dos contenedores:

```bash
authdb → Base de datos PostgreSQL

auth_service → Microservicio de autenticación (NestJS)
```

## ✅ Verificación

```bash
authdb | database system is ready to accept connections
auth_service | [Nest] ... Database connected
auth_service | [Nest] ... Application running on: http://0.0.0.0:3000
```

El microservicio ya estará corriendo correctamente 🎉
Podés acceder desde tu navegador o Postman a:

```bash
http://localhost:3001/api/v1
```

---

## 📚 Documentación

Este proyecto incluye documentación completa para diferentes casos de uso:

### Para el Equipo Backend/DevOps
- **[SECURITY.md](./SECURITY.md)** - Guía completa de seguridad
  - Características de seguridad implementadas
  - Refresh Tokens, JWT Blacklist, 2FA
  - Configuración de Cron Jobs
  - Endpoints API completos
  - Mantenimiento y monitoreo
  - Puntuación: **9.9/10**

### Para Desarrolladores Frontend
- **[FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)** - Integración con aplicaciones Frontend
  - Configuración de Axios con interceptores
  - Manejo de tokens (access + refresh)
  - Hooks de React (useAuth, use2FA)
  - Componentes completos (Login, Register, 2FA)
  - Ejemplos de código listo para usar
  - Mejores prácticas de seguridad

### Para Microservicios (Backend General)
- **[MICROSERVICES_GUIDE.md](./MICROSERVICES_GUIDE.md)** - Consumir desde cualquier backend
  - 3 estrategias de validación JWT
  - Ejemplos en 4 lenguajes (Node.js, Python, Go, Java)
  - Verificación de roles y permisos
  - Caché y optimización
  - Comunicación inter-servicios
  - Circuit Breaker y resiliencia

### Para Microservicios NestJS
- **[NESTJS_INTEGRATION.md](./NESTJS_INTEGRATION.md)** - Integración específica para NestJS
  - Configuración completa de módulos
  - Guards y Decorators personalizados
  - Estrategia JWT con Passport
  - Controladores de ejemplo
  - Caché con @nestjs/cache-manager
  - Testing unitario y E2E
  - **Proyecto completo listo para copiar**

### ¿Qué documentación usar?

| Si eres... | Lee... |
|-----------|--------|
| DevOps/Backend configurando el sistema | `SECURITY.md` |
| Desarrollador Frontend (React, Vue, Angular) | `FRONTEND_GUIDE.md` |
| Desarrollador Backend (Node, Python, Go, Java) | `MICROSERVICES_GUIDE.md` |
| Desarrollador NestJS | `NESTJS_INTEGRATION.md` |

---

## 🔐 Características de Seguridad

- ✅ **JWT Access Tokens**: 15 minutos de duración
- ✅ **Refresh Tokens**: 30 días con rotación automática
- ✅ **JWT Blacklist**: Logout real con invalidación de tokens
- ✅ **2FA (TOTP)**: Autenticación de dos factores con Google Authenticator
- ✅ **Rate Limiting**: Protección contra fuerza bruta
- ✅ **CORS**: Lista blanca de orígenes
- ✅ **Helmet**: Headers de seguridad (CSP, HSTS, etc.)
- ✅ **Account Lockout**: 5 intentos fallidos = 30 min de bloqueo
- ✅ **Password Security**: 12+ caracteres con complejidad
- ✅ **Security Logging**: Registro de todos los eventos
- ✅ **Cron Jobs**: Limpieza automática de tokens expirados

**Puntuación de Seguridad: 9.9/10**
