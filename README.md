# BRÚJULA — CRM gamificado local

Aplicación web basada en el método descrito en `BRUJULA.docx`: conocimiento personal, planeación, gestión de prospectos/clientes/asociados, acciones diarias, medición y desarrollo.

## Abrir la aplicación

En Windows, haz doble clic en `INICIAR_BRUJULA.cmd`. La aplicación quedará disponible en:

`http://127.0.0.1:8787`

También puede iniciarse desde una terminal con:

```powershell
python server.py
```

No requiere instalar paquetes. Usa únicamente Python y SQLite, que forma parte de Python.

## Datos

- Base local: `data/brujula.db`
- La información permanece en este equipo.
- La base se crea y se carga con datos de demostración la primera vez que se inicia.
- Para conservar cambios, respalda el archivo `data/brujula.db`.

## Módulos incluidos

- Tablero gamificado con nivel, experiencia, racha y misiones.
- CRM de prospectos, clientes y asociados.
- Agenda diaria por perfil y puntos XP.
- Mapa de crecimiento con metas SMART.
- Registro de indicadores y ventas diarias.
- Brújula de cinco perfiles con test rápido interactivo.
- Perfil personal editable con nombre, contacto, ciudad, propósito, meta mensual y fecha objetivo.
- Representación visual femenina, masculina o neutral que adapta las ilustraciones del tablero, mapa y brújula.
- Rutas de capacitación y desarrollo personal.
- Guía interactiva con recorrido guiado, simulador de niveles, reglas de XP, manual del CRM, perfiles, plan de primera semana y preguntas frecuentes.

## Estructura principal

- `server.py`: servidor local y API.
- `web/`: interfaz de la aplicación.
- `data/brujula.db`: base SQLite local (no se usa en la nube).
- `public/assets/`: ilustraciones de la experiencia gamificada.

## Despliegue en la nube (gratis)

El servidor detecta automáticamente si debe usar SQLite local o Turso (SQLite en la nube) según las variables de entorno `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`. Sin esas variables, sigue funcionando 100% local como hasta ahora.

### 1. Crear la base de datos en Turso

El CLI de Turso en Windows requiere WSL. Ya quedó instalado en tu WSL (Ubuntu) en `~/.turso/turso`. Abre una terminal de WSL (`wsl` desde PowerShell, o Windows Terminal con el perfil Ubuntu) y ejecuta:

```bash
turso auth login
turso db create brujula-crm
turso db show brujula-crm --url
turso db tokens create brujula-crm
```

- `turso auth login` abre tu navegador para iniciar sesión (con GitHub o email) — hazlo tú directamente, es tu cuenta.
- Guarda la URL (`libsql://...`) y el token que te devuelvan los dos últimos comandos; los necesitas en el paso 2 y en Render.

### 2. Sembrar el esquema y los datos de demo en Turso

```bash
TURSO_DATABASE_URL="libsql://tu-url-aqui" TURSO_AUTH_TOKEN="tu-token-aqui" py -3 server.py --init-only
```

### 3. Subir el proyecto a GitHub

1. Crea un repositorio vacío en [github.com/new](https://github.com/new) (puede ser privado).
2. En este proyecto:

```bash
git add -A
git commit -m "Preparar despliegue en la nube"
git remote add origin https://github.com/tu-usuario/brujula-crm.git
git branch -M main
git push -u origin main
```

### 4. Desplegar en Render (gratis)

1. En [render.com](https://render.com), crear un **Web Service** nuevo apuntando al repositorio de GitHub.
2. Build command: `pip install -r requirements.txt`
3. Start command: `python server.py`
4. Variables de entorno: agregar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` con los valores del paso 1.
5. Render inyecta `PORT` automáticamente; el servidor ya lo respeta.

El plan gratis de Render "duerme" el servicio tras ~15 minutos sin tráfico; el primer request tras dormir tarda unos segundos en responder.
