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

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/health` | Estado del servidor y si usa SQLite local o Turso. |
| GET | `/api/dashboard` | Tablero completo: perfil, misiones, racha, logros, tendencias y compensación. |
| GET | `/api/compensation` | Rango actual, avance de mantenimiento, niveles de bono y alertas del mes. |
| GET | `/api/export` | Descarga un respaldo JSON de todas las tablas. |
| GET/POST | `/api/contacts` | Listar (con filtros `kind` y `q`) y crear contactos. |
| PATCH/DELETE | `/api/contacts/<id>` | Editar cualquier campo o eliminar un contacto. |
| GET/POST | `/api/tasks` | Listar misiones por fecha y crear nuevas. |
| PATCH/DELETE | `/api/tasks/<id>` | Editar, completar o eliminar una misión. |
| GET/POST | `/api/metrics` | Historial y registro diario de resultados. |
| PATCH | `/api/goals/<id>` | Ajustar avance y objetivo de una meta. |
| PATCH | `/api/development/<id>` | Actualizar el progreso de una ruta de desarrollo. |
| PATCH | `/api/profile` | Editar datos personales, rango y meta mensual. |
| GET/POST | `/api/capture-sessions` | Listar y crear sesiones de captura por QR. |
| PATCH/DELETE | `/api/capture-sessions/<id>` | Abrir, cerrar, renombrar o eliminar una sesión. |
| GET | `/api/capture-sessions/<id>/qr.svg` | Código QR de la sesión en SVG. |
| GET | `/captura/<token>` | **Público.** Formulario que la persona llena desde su celular. |
| GET/POST | `/api/captura/<token>` | **Público.** Consulta la sesión y recibe el registro. |
| POST | `/api/profile/scores` | Guardar el resultado del test de perfiles. |

## Módulos incluidos

- Tablero gamificado con nivel, experiencia, racha calculada y misiones.
- CRM de prospectos, clientes y asociados con alta, edición y eliminación.
- Agenda diaria por perfil y puntos XP, con misiones que puedes crear, editar y borrar.
- Seguimiento del plan de compensación: rango, mantenimiento mensual en VVP,
  niveles del Bono por Volumen de Clientes y del BDN, con alertas y fecha límite.
- Logros que se desbloquean solos al cumplir sus condiciones.
- Respaldo descargable en JSON desde la guía interactiva.
- Mapa de crecimiento con metas SMART.
- Registro de indicadores y ventas diarias.
- Brújula de cinco perfiles con test rápido interactivo. La rueda, el polígono y los
  números se dibujan con los puntajes guardados (`web/compass.js`): no hay ilustraciones
  con datos de ejemplo pintados encima.
- Avatar propio: género, tono de piel, cara, corte y color de cabello, barba, estatura,
  complexión, ropa y lentes. Se dibuja como vector en el navegador (`web/avatar.js`), así
  que no hay imágenes que mantener y las combinaciones no se agotan.
- Perfil personal editable con nombre, contacto, ciudad, propósito, meta mensual y fecha objetivo.
- Representación visual femenina, masculina o neutral que adapta las ilustraciones del tablero, mapa y brújula.
- Rutas de capacitación y desarrollo personal.
- Guía interactiva con recorrido guiado, simulador de niveles, reglas de XP, manual del CRM, perfiles, plan de primera semana y preguntas frecuentes.

## Frases de acompañamiento

`frases.py` guarda el banco (111 frases) en cinco listas: recordatorios de actividad
pendiente, motivación para las llamadas, frases generales, frases por perfil dominante
y cierres del día. **Para agregar más, basta con escribirlas en la lista que corresponda**;
no hay que tocar nada más.

La aplicación elige según la hora (mañana, tarde y noche), el perfil dominante y lo que
haya en la agenda. La elección es estable dentro de cada momento —no cambia al recargar—
y el desplazamiento por momento garantiza que las tres frases del día sean distintas.

## Cuentas y acceso

Cada persona entra con su correo y su contraseña, y **ve únicamente su propia red**:
sus contactos, misiones, métricas, metas y logros están separados por usuario.

```bash
python server.py --add-account correo@ejemplo.com "Nombre Completo" --gender female --role admin
python server.py --list-accounts
```

`--add-account` genera una contraseña aleatoria y la muestra **una sola vez**: en la base
solo queda su hash (PBKDF2-SHA256, 260 000 iteraciones). Nunca se guardan contraseñas en
el repositorio. Quien entra con una contraseña temporal recibe el aviso para cambiarla.

Para la cuenta de demostración, que se presta y se dicta, conviene una contraseña fija:
`--password` la deja tal cual y sin el aviso de cambiarla, tanto al crear la cuenta como
al reiniciarla. Úsalo solo para esa cuenta de prueba, nunca para una cuenta real.

```bash
python server.py --reset-password prueba@brujula.mx --password "una-clave-fija"
```

Para dejar esa cuenta presentable —contactos, misiones, métricas, metas y desarrollo—
`--demo-data` la llena con el mismo contenido de demostración con el que nace la base.
Reemplaza lo que la cuenta tuviera, así que es para cuentas de prueba, no para reales.

```bash
python server.py --demo-data prueba@brujula.mx
```

Detalles de la protección:

- Sesión en cookie `HttpOnly` con `SameSite=Lax`, y `Secure` cuando se sirve por HTTPS.
- Toda la API exige sesión; los intentos de leer o modificar datos ajenos responden 404.
- Máximo de intentos de inicio de sesión por IP para frenar el probado de contraseñas.
- Al cambiar la contraseña se cierran las demás sesiones abiertas.
- Siguen siendo públicos, a propósito: la pantalla de acceso, `/api/health` y el
  formulario del QR (`/captura/<token>`), que es lo que permite el registro en grupo.

## Captura por QR

Para registrar a varias personas a la vez en una plática. Desde **Mi red → Captura por QR**
se crea una sesión con su propio código; cada asistente lo escanea y llena sus datos en
`/captura/<token>` desde su celular, incluido un espacio privado para escribir qué quiere
mejorar de su salud. Los registros entran a la red como prospectos marcados con ▦ y con
un seguimiento agendado para el día siguiente.

Ese endpoint **escribe sin autenticación**, que es justamente lo que lo hace útil. Lo que
lo acota:

- El enlace lleva un token aleatorio: no se adivina.
- La sesión se cierra al terminar el evento y el código deja de funcionar.
- Hay un tope de envíos por IP (`CAPTURE_RATE_LIMIT`), alto a propósito porque en un
  evento todos los asistentes comparten la IP del WiFi del lugar.
- Solo permite crear contactos; no expone ni modifica nada más.

## Plan de compensación

Las reglas del plan oficial de Immunotec (México) viven en constantes al inicio de
`server.py`: `RANKS`, `CLIENT_BONUS_TIERS`, `BDN_TIERS` y `RETAIL_MARGIN`. Si el plan
cambia, edita esos valores y no la lógica que los usa.

La aplicación calcula solo lo que tú registras: **VVP**, pedidos de cliente de 400+ VP
y consultores inscritos en el mes. Los volúmenes de organización (**VGP**, **VTOC**) y
las comisiones de equipo por generaciones dependen de tu línea descendente y se
consultan en el back office oficial; por eso el rango se captura manualmente.

Cualquier cifra mostrada es una estimación, no una garantía de ingresos.

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

El repositorio incluye `render.yaml`, que ya describe el servicio (build, arranque,
health check y auto-deploy). En [render.com](https://render.com) basta con:

1. **New > Blueprint**, apuntando a este repositorio: Render lee `render.yaml` y arma el servicio solo.
2. Capturar ahí `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` con los valores del paso 1; van marcados como
   secretos (`sync: false`), así que se piden una vez y nunca viajan en el repositorio.

Hecho eso, **cada `git push` a `main` despliega solo**: no hay que volver a tocar el panel.
Render inyecta `PORT` automáticamente; el servidor ya lo respeta.

El plan gratis de Render "duerme" el servicio tras ~15 minutos sin tráfico; el primer request tras dormir tarda unos segundos en responder.
