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
