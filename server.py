#!/usr/bin/env python3
"""BRUJULA CRM - servidor local sin dependencias externas."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import sqlite3
from datetime import date, datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "brujula.db"
WEB_DIR = ROOT / "web"
PUBLIC_DIR = ROOT / "public"

MAX_BODY_BYTES = 1_000_000


APP_VERSION = "dev"


def app_version() -> str:
    """Huella de los archivos del frontend, para detectar versiones desactualizadas."""
    marca = hashlib.sha256()
    for archivo in sorted(WEB_DIR.glob("*")):
        if archivo.is_file():
            marca.update(archivo.name.encode())
            marca.update(str(archivo.stat().st_mtime_ns).encode())
    return marca.hexdigest()[:12]

TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL", "").strip() or None
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "").strip() or None
USE_TURSO = bool(TURSO_DATABASE_URL)

if USE_TURSO:
    import libsql


def today() -> str:
    return date.today().isoformat()


def day_offset(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


VALID_KINDS = {"Prospecto", "Cliente", "Asociado"}
VALID_INTEREST = {"Alto", "Medio", "Bajo"}
VALID_GENDERS = {"female", "male", "neutral"}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")


def clean_text(value, limit: int, label: str, required: bool = False) -> str:
    text = str(value if value is not None else "").strip()
    if required and not text:
        raise ValueError(f"{label} es obligatorio")
    if len(text) > limit:
        raise ValueError(f"{label} no puede tener más de {limit} caracteres")
    return text


def clean_choice(value, options: set, label: str, default: str) -> str:
    text = str(value if value is not None else "").strip() or default
    if text not in options:
        raise ValueError(f"{label} debe ser una de estas opciones: {', '.join(sorted(options))}")
    return text


def clean_date(value, label: str):
    text = str(value if value is not None else "").strip()
    if not text:
        return None
    if not DATE_PATTERN.match(text):
        raise ValueError(f"{label} debe tener el formato AAAA-MM-DD")
    try:
        date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"{label} no corresponde a una fecha real")
    return text


def clean_time(value, label: str):
    text = str(value if value is not None else "").strip()
    if not text:
        return None
    if not TIME_PATTERN.match(text):
        raise ValueError(f"{label} debe tener el formato HH:MM")
    hours, minutes = (int(part) for part in text.split(":"))
    if hours > 23 or minutes > 59:
        raise ValueError(f"{label} no corresponde a una hora real")
    return text


def clean_email(value, label: str = "El correo") -> str:
    text = clean_text(value, 160, label)
    if text and not EMAIL_PATTERN.match(text):
        raise ValueError(f"{label} no tiene un formato válido (ejemplo: nombre@correo.com)")
    return text


def clean_number(value, label: str, minimum: float = 0, maximum: float | None = None) -> float:
    if value in (None, ""):
        return minimum
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} debe ser un número")
    if number < minimum:
        raise ValueError(f"{label} no puede ser menor que {minimum:g}")
    if maximum is not None and number > maximum:
        raise ValueError(f"{label} no puede ser mayor que {maximum:g}")
    return number


SCHEMA_STATEMENTS = [
    """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'female',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  dominant_profile TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  target_income REAL NOT NULL DEFAULT 0,
  goal_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """
CREATE TABLE IF NOT EXISTS profile_scores (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  label TEXT NOT NULL,
  score INTEGER NOT NULL,
  color TEXT NOT NULL,
  UNIQUE(user_id, profile_key)
)""",
    """
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('Prospecto','Cliente','Asociado')),
  interest TEXT NOT NULL DEFAULT 'Medio',
  stage TEXT NOT NULL DEFAULT 'Nuevo',
  source TEXT NOT NULL DEFAULT 'En persona',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  health_profile TEXT DEFAULT '',
  estimated_objective TEXT DEFAULT '',
  products TEXT DEFAULT '',
  monthly_consumption REAL NOT NULL DEFAULT 0,
  next_action TEXT DEFAULT '',
  next_action_date TEXT,
  last_contact TEXT,
  birthday TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  category TEXT NOT NULL,
  profile_tag TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  due_date TEXT NOT NULL,
  due_time TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """
CREATE TABLE IF NOT EXISTS daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_date TEXT NOT NULL UNIQUE,
  new_prospects INTEGER NOT NULL DEFAULT 0,
  presentations INTEGER NOT NULL DEFAULT 0,
  new_clients INTEGER NOT NULL DEFAULT 0,
  new_associates INTEGER NOT NULL DEFAULT 0,
  sales REAL NOT NULL DEFAULT 0,
  products_sold TEXT DEFAULT ''
)""",
    """
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  current REAL NOT NULL DEFAULT 0,
  target REAL NOT NULL,
  unit TEXT NOT NULL,
  color TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'En curso'
)""",
    """
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  unlocked_at TEXT
)""",
    """
CREATE TABLE IF NOT EXISTS development_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  profile_tag TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0
)""",
]


def connect():
    if USE_TURSO:
        return libsql.connect(TURSO_DATABASE_URL, auth_token=TURSO_AUTH_TOKEN)
    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def row_to_dict(cursor, row) -> dict | None:
    if row is None:
        return None
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))


def rows(cursor) -> list[dict]:
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def fetch_one(db, sql: str, params=()) -> dict | None:
    cursor = db.execute(sql, params)
    return row_to_dict(cursor, cursor.fetchone())


ACHIEVEMENT_CATALOG = [
    ("first-steps", "Primeros pasos", "Escribe tu propósito y define tu primera meta.", "🧭"),
    ("network-10", "Red en marcha", "Registra 10 personas en tu red.", "🌐"),
    ("connector", "Gran conexión", "Registra 25 conversaciones significativas.", "🤝"),
    ("streak-7", "Racha imparable", "Trabaja tu plan durante siete días seguidos.", "🔥"),
    ("mentor", "Mentoría en camino", "Acompaña a tu primer asociado.", "🏅"),
    ("first-sale", "Primera venta", "Registra tu primera venta del mes.", "💫"),
    ("level-5", "Nivel 5 alcanzado", "Acumula 1,000 XP de experiencia.", "⭐"),
]


def sync_achievement_catalog(db) -> None:
    """Agrega logros nuevos y actualiza sus textos sin tocar los ya desbloqueados."""
    for slug, title, description, icon in ACHIEVEMENT_CATALOG:
        db.execute(
            "INSERT OR IGNORE INTO achievements (slug,title,description,icon,unlocked_at) VALUES (?,?,?,?,NULL)",
            (slug, title, description, icon),
        )
        db.execute(
            "UPDATE achievements SET title=?, description=?, icon=? WHERE slug=?",
            (title, description, icon, slug),
        )


def ensure_column(db, table: str, column: str, definition: str) -> None:
    try:
        existing = {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except Exception:
        pass


def initialize_database() -> None:
    if not USE_TURSO:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        for statement in SCHEMA_STATEMENTS:
            db.execute(statement)
        ensure_column(db, "users", "gender", "TEXT NOT NULL DEFAULT 'female'")
        ensure_column(db, "users", "email", "TEXT NOT NULL DEFAULT ''")
        ensure_column(db, "users", "phone", "TEXT NOT NULL DEFAULT ''")
        ensure_column(db, "users", "city", "TEXT NOT NULL DEFAULT ''")
        sync_achievement_catalog(db)
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            return

        db.execute(
            "INSERT INTO users (id,name,purpose,dominant_profile,xp,streak,target_income,goal_date) VALUES (1,?,?,?,?,?,?,?)",
            (
                "Mariana Torres",
                "Construyo mi negocio para cuidar mi salud, alcanzar libertad financiera y ayudar a otras personas a crecer.",
                "Liderazgo",
                1480,
                0,
                35000,
                day_offset(143),
            ),
        )
        db.executemany(
            "INSERT INTO profile_scores (user_id,profile_key,label,score,color) VALUES (1,?,?,?,?)",
            [
                ("leadership", "Liderazgo", 34, "#2878d0"),
                ("connection", "Conexión", 31, "#7755c7"),
                ("constancy", "Constancia", 27, "#55a85b"),
                ("analyst", "Analista", 23, "#ef5f86"),
                ("executor", "Ejecutor", 21, "#f49a2f"),
            ],
        )
        db.executemany(
            """INSERT INTO contacts
            (name,kind,interest,stage,source,phone,health_profile,estimated_objective,products,monthly_consumption,next_action,next_action_date,last_contact,birthday,notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                ("Ana Robles", "Prospecto", "Alto", "Presentación", "Café virtual", "656 555 0148", "Problemas de circulación; busca más energía", "Cliente / Asociada", "", 0, "Contarle una historia de éxito e invitarla a café", day_offset(0), day_offset(-2), "1988-08-12", "No llamar durante el horario laboral."),
                ("Pedro Sosa", "Prospecto", "Medio", "Contactado", "Referido", "656 555 0192", "Interés en rendimiento físico", "Cliente", "", 0, "Enviar video de testimonio", day_offset(0), day_offset(-4), None, "Prefiere mensajes de WhatsApp."),
                ("Carlos Vega", "Prospecto", "Alto", "Seguimiento", "Facebook", "656 555 0174", "Investiga antioxidantes", "Cliente", "", 0, "Enviar video científico", day_offset(1), day_offset(-1), None, "Le interesan datos y estudios."),
                ("Luisa Mendoza", "Cliente", "Alto", "Recompra", "En persona", "656 555 0107", "Bienestar general", "Cliente frecuente", "Immunocal Platinum", 3200, "Confirmar recompra mensual", day_offset(2), day_offset(-6), "1979-09-03", "Compartió un testimonio positivo."),
                ("Karina López", "Cliente", "Medio", "Testimonio", "Instagram", "656 555 0119", "Recuperación deportiva", "Referidos", "Immunocal Sport", 2100, "Solicitar testimonio y dos referidos", day_offset(3), day_offset(-7), None, "Participa en carreras locales."),
                ("Claudia Ruiz", "Asociado", "Alto", "Capacitación", "Evento", "656 555 0133", "", "Líder de equipo", "", 4500, "Revisar plan semanal de cinco contactos", day_offset(0), day_offset(-3), "1985-11-28", "Perfil Conexión-Constancia."),
                ("Luis Ortega", "Asociado", "Medio", "Activación", "Referido", "656 555 0166", "", "Productor", "", 1800, "Agendar capacitación técnica", day_offset(4), day_offset(-10), None, "Necesita acompañamiento para crear rutina."),
            ],
        )
        db.executemany(
            "INSERT INTO tasks (title,detail,category,profile_tag,points,due_date,due_time,completed,contact_id) VALUES (?,?,?,?,?,?,?,?,?)",
            [
                ("Llamar a Ana Robles", "Invitarla a un café y compartir historia de éxito", "Llamada", "Conexión", 30, today(),"09:30", 0, 1),
                ("Enviar testimonio a Pedro", "Video corto de resultado de cliente", "Contenido", "Conexión", 20, today(),"11:00", 1, 2),
                ("Revisar plan con Claudia", "Cinco contactos y seguimiento semanal", "Mentoría", "Liderazgo", 40, today(),"16:00", 0, 6),
                ("Publicar historia en Facebook", "Tema: energía para tu día", "Redes", "Ejecutor", 20, today(),"18:30", 0, None),
                ("Módulo de conocimiento científico", "Completar la lección de glutatión", "Capacitación", "Analista", 35, today(),"20:00", 0, None),
                ("Actualizar el CRM", "Registrar contactos y próximos pasos", "Organización", "Constancia", 25, today(),"20:30", 0, None),
            ],
        )
        db.executemany(
            "INSERT INTO daily_metrics (metric_date,new_prospects,presentations,new_clients,new_associates,sales,products_sold) VALUES (?,?,?,?,?,?,?)",
            [
                (day_offset(-4), 3, 2, 1, 0, 4200, "Platinum x1, Sport x1"),
                (day_offset(-3), 2, 1, 0, 1, 3100, "Classic x1"),
                (day_offset(-2), 5, 3, 2, 0, 7800, "Platinum x2, Sport x1"),
                (day_offset(-1), 4, 2, 1, 1, 6400, "Platinum x1, Classic x2"),
                (day_offset(0), 2, 1, 1, 0, 3200, "Platinum x1"),
            ],
        )
        db.executemany(
            "INSERT INTO goals (title,current,target,unit,color) VALUES (?,?,?,?,?)",
            [
                ("Lista de prospectos", 68, 100, "personas", "#7755c7"),
                ("Contactos esta semana", 17, 25, "contactos", "#ef5f86"),
                ("Ventas del mes", 24700, 35000, "MXN", "#f2a93b"),
                ("Sesiones de conocimiento", 3, 4, "sesiones", "#2878d0"),
            ],
        )
        db.executemany(
            "INSERT INTO development_items (title,kind,progress,profile_tag,points) VALUES (?,?,?,?,?)",
            [
                ("Fundamentos científicos del producto", "Curso", 72, "Analista", 120),
                ("Conversaciones que conectan", "Práctica", 45, "Conexión", 90),
                ("Formación de líderes", "Ruta", 28, "Liderazgo", 180),
                ("Sistema de seguimiento semanal", "Hábito", 83, "Constancia", 110),
            ],
        )


def compute_streak(db) -> int:
    """Días consecutivos con registro diario, contando hacia atrás desde hoy."""
    recorded = {row["metric_date"] for row in rows(db.execute("SELECT metric_date FROM daily_metrics ORDER BY metric_date DESC LIMIT 400"))}
    if not recorded:
        return 0
    cursor = date.today()
    if cursor.isoformat() not in recorded:
        # Aún no se registra hoy: la racha sigue viva si ayer sí se registró.
        cursor -= timedelta(days=1)
    streak = 0
    while cursor.isoformat() in recorded:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def achievement_stats(db) -> dict:
    user = fetch_one(db, "SELECT xp, purpose FROM users WHERE id=1") or {}
    counts = {item["kind"]: item["count"] for item in rows(db.execute("SELECT kind,COUNT(*) count FROM contacts GROUP BY kind"))}
    return {
        "xp": user.get("xp", 0),
        "has_purpose": bool((user.get("purpose") or "").strip()),
        "contacts": sum(counts.values()),
        "associates": counts.get("Asociado", 0),
        "goals": db.execute("SELECT COUNT(*) FROM goals").fetchone()[0],
        "streak": compute_streak(db),
        "sales": db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics").fetchone()[0],
    }


ACHIEVEMENT_RULES = {
    "first-steps": lambda s: s["has_purpose"] and s["goals"] > 0,
    "network-10": lambda s: s["contacts"] >= 10,
    "connector": lambda s: s["contacts"] >= 25,
    "streak-7": lambda s: s["streak"] >= 7,
    "mentor": lambda s: s["associates"] >= 1,
    "first-sale": lambda s: s["sales"] > 0,
    "level-5": lambda s: s["xp"] >= 1000,
}


def evaluate_achievements(db) -> list[dict]:
    """Desbloquea los logros cuya condición ya se cumple. Devuelve los nuevos."""
    locked = rows(db.execute("SELECT slug,title,icon FROM achievements WHERE unlocked_at IS NULL"))
    if not locked:
        return []
    stats = achievement_stats(db)
    unlocked = []
    for achievement in locked:
        rule = ACHIEVEMENT_RULES.get(achievement["slug"])
        if rule and rule(stats):
            db.execute("UPDATE achievements SET unlocked_at=? WHERE slug=?", (today(), achievement["slug"]))
            unlocked.append(achievement)
    return unlocked


def sync_progress(db) -> list[dict]:
    """Recalcula racha y meta de ventas, y evalúa logros. Devuelve logros nuevos."""
    db.execute("UPDATE users SET streak=? WHERE id=1", (compute_streak(db),))
    month_sales = db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics WHERE metric_date LIKE ?", (f"{today()[:7]}-%",)).fetchone()[0]
    db.execute("UPDATE goals SET current=? WHERE unit='MXN'", (month_sales,))
    return evaluate_achievements(db)


def week_activity(db) -> list[dict]:
    """Los últimos siete días con marca de actividad, para los puntos de la racha."""
    recorded = {row["metric_date"] for row in rows(db.execute("SELECT metric_date FROM daily_metrics ORDER BY metric_date DESC LIMIT 60"))}
    labels = ["L", "M", "M", "J", "V", "S", "D"]
    start = date.today() - timedelta(days=date.today().weekday())
    week = []
    for index in range(7):
        current = start + timedelta(days=index)
        week.append({
            "label": labels[index],
            "date": current.isoformat(),
            "done": current.isoformat() in recorded,
            "future": current > date.today(),
        })
    return week


def dashboard_payload(db) -> dict:
    new_achievements = sync_progress(db)
    user = fetch_one(db, "SELECT * FROM users WHERE id=1")
    profile_scores = rows(db.execute("SELECT * FROM profile_scores WHERE user_id=1 ORDER BY score DESC"))
    task_list = rows(db.execute("SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE due_date=? ORDER BY completed, due_time", (today(),)))
    contact_counts = {item["kind"]: item["count"] for item in rows(db.execute("SELECT kind,COUNT(*) count FROM contacts GROUP BY kind"))}
    metrics = fetch_one(db, "SELECT * FROM daily_metrics WHERE metric_date=?", (today(),)) or {}
    sales_month = db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics WHERE metric_date LIKE ?", (f"{today()[:7]}-%",)).fetchone()[0]
    month_totals = fetch_one(db, """SELECT COALESCE(SUM(new_prospects),0) prospects, COALESCE(SUM(new_clients),0) clients,
        COALESCE(SUM(new_associates),0) associates FROM daily_metrics WHERE metric_date LIKE ?""", (f"{today()[:7]}-%",)) or {}
    week_prospects = db.execute("SELECT COALESCE(SUM(new_prospects),0) FROM daily_metrics WHERE metric_date>=?", (day_offset(-6),)).fetchone()[0]
    user["level"] = user["xp"] // 250 + 1
    user["level_progress"] = user["xp"] % 250
    return {
        "user": user,
        "profile_scores": profile_scores,
        "tasks": task_list,
        "contact_counts": contact_counts,
        "metrics": metrics,
        "sales_month": sales_month,
        "trends": {
            "week_prospects": week_prospects,
            "month_clients": month_totals.get("clients", 0),
            "month_associates": month_totals.get("associates", 0),
        },
        "week_activity": week_activity(db),
        "goals": rows(db.execute("SELECT * FROM goals ORDER BY id")),
        "achievements": rows(db.execute("SELECT * FROM achievements ORDER BY unlocked_at IS NULL, unlocked_at DESC, id")),
        "new_achievements": new_achievements,
        "recent_contacts": rows(db.execute("SELECT * FROM contacts ORDER BY COALESCE(last_contact,created_at) DESC LIMIT 5")),
        "development": rows(db.execute("SELECT * FROM development_items ORDER BY id")),
    }


class AppHandler(BaseHTTPRequestHandler):
    server_version = "BrujulaCRM/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")

    def handle_one_request(self) -> None:
        # El navegador puede cortar la conexión a media respuesta; no es un error real.
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def send_json(self, payload, status=HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY_BYTES:
            raise ValueError("Cuerpo demasiado grande")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Se esperaba un objeto JSON")
        return payload

    def dispatch(self, route) -> None:
        """Ninguna solicitud malformada debe tumbar el manejador."""
        try:
            route()
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json({"error": "El cuerpo de la solicitud no es JSON válido en UTF-8"}, HTTPStatus.BAD_REQUEST)
        except ValueError as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception as error:
            self.log_message("Error no controlado: %s", error)
            try:
                self.send_json({"error": "Ocurrió un error inesperado en el servidor"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            except Exception:
                self.close_connection = True

    def do_GET(self) -> None:
        self.dispatch(self.route_get)

    def route_get(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        self.dispatch(self.route_post)

    def route_post(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/contacts":
            self.create_contact()
        elif parsed.path == "/api/metrics":
            self.save_metrics()
        elif parsed.path == "/api/profile/scores":
            self.save_profile_scores()
        elif parsed.path == "/api/tasks":
            self.create_task()
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def do_PATCH(self) -> None:
        self.dispatch(self.route_patch)

    def route_patch(self) -> None:
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if parsed.path == "/api/profile":
            self.update_profile()
        elif len(parts) == 3 and parts[:2] == ["api", "tasks"]:
            self.update_task(self.parse_id(parts[2]))
        elif len(parts) == 3 and parts[:2] == ["api", "contacts"]:
            self.update_contact(self.parse_id(parts[2]))
        elif len(parts) == 3 and parts[:2] == ["api", "goals"]:
            self.update_goal(self.parse_id(parts[2]))
        elif len(parts) == 3 and parts[:2] == ["api", "development"]:
            self.update_development(self.parse_id(parts[2]))
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        self.dispatch(self.route_delete)

    def route_delete(self) -> None:
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "contacts"]:
            self.delete_record("contacts", self.parse_id(parts[2]), "Contacto eliminado")
        elif len(parts) == 3 and parts[:2] == ["api", "tasks"]:
            self.delete_record("tasks", self.parse_id(parts[2]), "Misión eliminada")
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def parse_id(self, raw: str) -> int | None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    def handle_api_get(self, parsed) -> None:
        with connect() as db:
            if parsed.path == "/api/health":
                self.send_json({"ok": True, "database": "turso" if USE_TURSO else "sqlite", "date": today(), "version": APP_VERSION})
            elif parsed.path == "/api/export":
                self.export_data(db)
            elif parsed.path == "/api/dashboard":
                self.send_json(dashboard_payload(db))
            elif parsed.path == "/api/tasks":
                query = parse_qs(parsed.query)
                due = query.get("date", [today()])[0]
                self.send_json(rows(db.execute(
                    "SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE due_date=? ORDER BY completed, due_time",
                    (due,))))
            elif parsed.path == "/api/contacts":
                query = parse_qs(parsed.query)
                kind = query.get("kind", [""])[0]
                search = query.get("q", [""])[0]
                sql = "SELECT * FROM contacts WHERE 1=1"
                values = []
                if kind:
                    sql += " AND kind=?"
                    values.append(kind)
                if search:
                    sql += " AND (name LIKE ? OR notes LIKE ? OR stage LIKE ?)"
                    values.extend([f"%{search}%"] * 3)
                sql += " ORDER BY CASE interest WHEN 'Alto' THEN 1 WHEN 'Medio' THEN 2 ELSE 3 END, COALESCE(next_action_date,'9999')"
                self.send_json(rows(db.execute(sql, values)))
            elif parsed.path == "/api/metrics":
                self.send_json(rows(db.execute("SELECT * FROM daily_metrics ORDER BY metric_date DESC LIMIT 14")))
            else:
                self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def contact_fields(self, data: dict) -> dict:
        """Valida y normaliza los campos de un contacto. Lanza ValueError con un mensaje claro."""
        return {
            "name": clean_text(data.get("name"), 120, "El nombre", required=True),
            "kind": clean_choice(data.get("kind"), VALID_KINDS, "El tipo", "Prospecto"),
            "interest": clean_choice(data.get("interest"), VALID_INTEREST, "El interés", "Medio"),
            "stage": clean_text(data.get("stage"), 60, "La etapa") or "Nuevo",
            "source": clean_text(data.get("source"), 60, "La fuente") or "En persona",
            "phone": clean_text(data.get("phone"), 40, "El teléfono"),
            "email": clean_email(data.get("email")),
            "health_profile": clean_text(data.get("health_profile"), 400, "El perfil de salud"),
            "estimated_objective": clean_text(data.get("estimated_objective"), 120, "El objetivo"),
            "products": clean_text(data.get("products"), 200, "El campo de productos"),
            "monthly_consumption": clean_number(data.get("monthly_consumption"), "El consumo mensual", 0, 10_000_000),
            "next_action": clean_text(data.get("next_action"), 300, "La próxima acción"),
            "next_action_date": clean_date(data.get("next_action_date"), "La próxima fecha"),
            "last_contact": clean_date(data.get("last_contact"), "La fecha del último contacto"),
            "birthday": clean_date(data.get("birthday"), "El cumpleaños"),
            "notes": clean_text(data.get("notes"), 1000, "El campo de notas"),
        }

    def create_contact(self) -> None:
        values = self.contact_fields(self.read_json())
        columns = list(values)
        with connect() as db:
            cursor = db.execute(
                f"INSERT INTO contacts ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})",
                [values[column] for column in columns],
            )
            db.execute("UPDATE users SET xp=xp+25 WHERE id=1")
            contact = fetch_one(db, "SELECT * FROM contacts WHERE id=?", (cursor.lastrowid,))
            unlocked = evaluate_achievements(db)
        self.send_json({**contact, "new_achievements": unlocked}, HTTPStatus.CREATED)

    def update_contact(self, contact_id: int | None) -> None:
        if contact_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        with connect() as db:
            actual = fetch_one(db, "SELECT * FROM contacts WHERE id=?", (contact_id,))
        if not actual:
            self.send_json({"error": "No encontrado"}, HTTPStatus.NOT_FOUND)
            return
        # Validar sobre el contacto completo para no perder campos ni saltarse reglas.
        limpio = self.contact_fields({**actual, **data})
        updates = [(key, limpio[key]) for key in data if key in limpio]
        if not updates:
            self.send_json({"error": "No hay cambios válidos"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            db.execute(f"UPDATE contacts SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=?", [value for _, value in updates] + [contact_id])
            record = fetch_one(db, "SELECT * FROM contacts WHERE id=?", (contact_id,))
        self.send_json(record if record else {"error": "No encontrado"}, HTTPStatus.OK if record else HTTPStatus.NOT_FOUND)

    def delete_record(self, table: str, record_id: int | None, message: str) -> None:
        if record_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            existing = fetch_one(db, f"SELECT id FROM {table} WHERE id=?", (record_id,))
            if not existing:
                self.send_json({"error": "No encontrado"}, HTTPStatus.NOT_FOUND)
                return
            db.execute(f"DELETE FROM {table} WHERE id=?", (record_id,))
        self.send_json({"ok": True, "message": message})

    def task_fields(self, data: dict) -> dict:
        return {
            "title": clean_text(data.get("title"), 160, "El título de la misión", required=True),
            "detail": clean_text(data.get("detail"), 400, "El detalle"),
            "category": clean_text(data.get("category"), 60, "La categoría") or "Organización",
            "profile_tag": clean_text(data.get("profile_tag"), 60, "El perfil") or "Constancia",
            "points": int(clean_number(data.get("points") if data.get("points") not in (None, "") else 20, "El puntaje", 0, 500)),
            "due_date": clean_date(data.get("due_date"), "La fecha") or today(),
            "due_time": clean_time(data.get("due_time"), "La hora"),
        }

    def create_task(self) -> None:
        data = self.read_json()
        campos = self.task_fields(data)
        values = (
            campos["title"], campos["detail"], campos["category"], campos["profile_tag"],
            campos["points"], campos["due_date"], campos["due_time"],
            data.get("contact_id") or None,
        )
        with connect() as db:
            cursor = db.execute(
                "INSERT INTO tasks (title,detail,category,profile_tag,points,due_date,due_time,contact_id) VALUES (?,?,?,?,?,?,?,?)",
                values,
            )
            task = fetch_one(db, "SELECT * FROM tasks WHERE id=?", (cursor.lastrowid,))
        self.send_json(task, HTTPStatus.CREATED)

    def update_task(self, task_id: int | None) -> None:
        if task_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        with connect() as db:
            task = fetch_one(db, "SELECT * FROM tasks WHERE id=?", (task_id,))
            if not task:
                self.send_json({"error": "Misión no encontrada"}, HTTPStatus.NOT_FOUND)
                return
            limpio = self.task_fields({**task, **data})
            updates = [(key, limpio[key]) for key in data if key in limpio]
            if updates:
                db.execute(f"UPDATE tasks SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=?",
                           [value for _, value in updates] + [task_id])
            unlocked = []
            if "completed" in data:
                completed = 1 if data.get("completed") else 0
                was_completed = task["completed"]
                db.execute("UPDATE tasks SET completed=? WHERE id=?", (completed, task_id))
                if completed and not was_completed:
                    db.execute("UPDATE users SET xp=xp+? WHERE id=1", (task["points"],))
                elif not completed and was_completed:
                    db.execute("UPDATE users SET xp=MAX(0,xp-?) WHERE id=1", (task["points"],))
                unlocked = evaluate_achievements(db)
            elif not updates:
                self.send_json({"error": "No hay cambios válidos"}, HTTPStatus.BAD_REQUEST)
                return
            user = fetch_one(db, "SELECT * FROM users WHERE id=1")
        self.send_json({"ok": True, "xp": user["xp"], "level": user["xp"] // 250 + 1, "new_achievements": unlocked})

    def update_goal(self, goal_id: int | None) -> None:
        if goal_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        updates = []
        for key in ("title", "unit", "status"):
            if key in data:
                updates.append((key, str(data[key]).strip()[:120]))
        for key in ("current", "target"):
            if key in data:
                try:
                    updates.append((key, max(0, float(data[key] or 0))))
                except (TypeError, ValueError):
                    self.send_json({"error": f"El valor de {key} debe ser un número"}, HTTPStatus.BAD_REQUEST)
                    return
        if not updates:
            self.send_json({"error": "No hay cambios válidos"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            db.execute(f"UPDATE goals SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=?",
                       [value for _, value in updates] + [goal_id])
            record = fetch_one(db, "SELECT * FROM goals WHERE id=?", (goal_id,))
        self.send_json(record if record else {"error": "No encontrada"}, HTTPStatus.OK if record else HTTPStatus.NOT_FOUND)

    def update_development(self, item_id: int | None) -> None:
        if item_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        try:
            progress = max(0, min(100, int(data.get("progress"))))
        except (TypeError, ValueError):
            self.send_json({"error": "El avance debe ser un número entre 0 y 100"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            record = fetch_one(db, "SELECT * FROM development_items WHERE id=?", (item_id,))
            if not record:
                self.send_json({"error": "No encontrada"}, HTTPStatus.NOT_FOUND)
                return
            db.execute("UPDATE development_items SET progress=? WHERE id=?", (progress, item_id))
            record = fetch_one(db, "SELECT * FROM development_items WHERE id=?", (item_id,))
        self.send_json(record)

    def export_data(self, db) -> None:
        tables = ["users", "profile_scores", "contacts", "tasks", "daily_metrics", "goals", "achievements", "development_items"]
        payload = {"exported_at": datetime.now().isoformat(timespec="seconds"), "data": {}}
        for table in tables:
            payload["data"][table] = rows(db.execute(f"SELECT * FROM {table}"))
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="brujula-respaldo-{today()}.json"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def save_metrics(self) -> None:
        data = self.read_json()
        metric_date = data.get("metric_date") or today()
        fields = ["new_prospects", "presentations", "new_clients", "new_associates", "sales", "products_sold"]
        values = [data.get(field, 0) for field in fields]
        with connect() as db:
            db.execute(
                """INSERT INTO daily_metrics (metric_date,new_prospects,presentations,new_clients,new_associates,sales,products_sold)
                VALUES (?,?,?,?,?,?,?) ON CONFLICT(metric_date) DO UPDATE SET
                new_prospects=excluded.new_prospects,presentations=excluded.presentations,new_clients=excluded.new_clients,
                new_associates=excluded.new_associates,sales=excluded.sales,products_sold=excluded.products_sold""",
                [metric_date] + values,
            )
            db.execute("UPDATE users SET xp=xp+15 WHERE id=1")
            unlocked = sync_progress(db)
            streak = fetch_one(db, "SELECT streak FROM users WHERE id=1")["streak"]
        self.send_json({"ok": True, "message": "Avance guardado +15 XP", "streak": streak, "new_achievements": unlocked})

    def save_profile_scores(self) -> None:
        data = self.read_json()
        scores = data.get("scores", {})
        valid = {"leadership", "connection", "constancy", "analyst", "executor"}
        if not scores or not set(scores).issubset(valid):
            self.send_json({"error": "Resultados inválidos"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            for key, score in scores.items():
                db.execute("UPDATE profile_scores SET score=? WHERE user_id=1 AND profile_key=?", (int(score), key))
            winner = db.execute("SELECT label FROM profile_scores WHERE user_id=1 ORDER BY score DESC LIMIT 1").fetchone()[0]
            db.execute("UPDATE users SET dominant_profile=?, xp=xp+75 WHERE id=1", (winner,))
        self.send_json({"ok": True, "dominant_profile": winner, "message": "Tu brújula fue actualizada +75 XP"})

    def update_profile(self) -> None:
        data = self.read_json()
        values = (
            clean_text(data.get("name"), 120, "Tu nombre", required=True),
            clean_choice(data.get("gender"), VALID_GENDERS, "La representación visual", "female"),
            clean_email(data.get("email")),
            clean_text(data.get("phone"), 40, "El teléfono"),
            clean_text(data.get("city"), 100, "La ciudad"),
            clean_text(data.get("purpose"), 800, "Tu propósito"),
            clean_number(data.get("target_income"), "La meta de ingresos", 0, 100_000_000),
            clean_date(data.get("goal_date"), "La fecha objetivo"),
        )
        with connect() as db:
            db.execute(
                """UPDATE users SET name=?,gender=?,email=?,phone=?,city=?,
                purpose=?,target_income=?,goal_date=? WHERE id=1""",
                values,
            )
            user = fetch_one(db, "SELECT * FROM users WHERE id=1")
        user["level"] = user["xp"] // 250 + 1
        user["level_progress"] = user["xp"] % 250
        self.send_json({"ok": True, "user": user, "message": "Tu perfil y tu experiencia visual fueron actualizados"})

    def serve_static(self, request_path: str) -> None:
        if request_path in ("", "/"):
            target = WEB_DIR / "index.html"
        elif request_path.startswith("/assets/"):
            target = PUBLIC_DIR / request_path.removeprefix("/")
        else:
            target = WEB_DIR / request_path.removeprefix("/")
        try:
            target = target.resolve()
            allowed = WEB_DIR.resolve() in target.parents or PUBLIC_DIR.resolve() in target.parents or target == WEB_DIR.resolve()
            if not allowed or not target.is_file():
                raise FileNotFoundError
            body = target.read_bytes()
            mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            etag = f'"{hashlib.sha256(body).hexdigest()[:16]}"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                self.send_header("ETag", etag)
                self.end_headers()
                return
            self.send_response(HTTPStatus.OK)
            self.send_header("ETag", etag)
            self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") or mime == "application/javascript" else mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache" if target.suffix in {".html", ".js", ".css"} else "public, max-age=86400")
            self.end_headers()
            self.wfile.write(body)
        except (FileNotFoundError, OSError):
            self.send_error(HTTPStatus.NOT_FOUND, "Archivo no encontrado")


def main() -> None:
    parser = argparse.ArgumentParser(description="BRUJULA CRM local")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8787)))
    parser.add_argument("--init-only", action="store_true")
    args = parser.parse_args()
    global APP_VERSION
    APP_VERSION = app_version()
    initialize_database()
    if args.init_only:
        print(f"Base de datos lista ({'Turso' if USE_TURSO else DB_PATH})")
        return
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"BRUJULA CRM disponible en http://{args.host}:{args.port} (BD: {'Turso' if USE_TURSO else 'SQLite local'})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
