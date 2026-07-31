#!/usr/bin/env python3
"""BRUJULA CRM - servidor local sin dependencias externas."""

from __future__ import annotations

import argparse
import calendar
import hashlib
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
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

# --- Autenticación --------------------------------------------------------
SESSION_COOKIE = "brujula_sesion"
SESSION_DAYS = 30
PBKDF2_ROUNDS = 260_000
LOGIN_RATE_LIMIT = 10
LOGIN_RATE_WINDOW = 600
VALID_ROLES = {"admin", "consultor"}

# Rutas que funcionan sin haber iniciado sesión.
PUBLIC_PATHS = {"/login", "/login.html", "/api/auth/login", "/api/health"}
PUBLIC_PREFIXES = ("/captura/", "/api/captura/", "/assets/", "/styles.css", "/favicon")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algoritmo, rondas, salt_hex, hash_hex = (stored or "").split("$")
        if algoritmo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rondas))
        return secrets.compare_digest(digest.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def generate_password() -> str:
    """Clave legible de dictar por teléfono, pero con suficiente entropía."""
    alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "-".join("".join(secrets.choice(alfabeto) for _ in range(5)) for _ in range(3))


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


# ---------------------------------------------------------------------------
# Plan de compensación oficial (México). Los valores provienen del documento
# "Plan de Compensación Oficial" y pueden cambiar: edítalos aquí, no en la lógica.
# ---------------------------------------------------------------------------

RANKS = [
    {"key": "Empresario", "label": "Consultor Empresario", "maintenance": 0, "promotion_bonus": 0,
     "requirement": "Aún no acumulas 400 VVP en un mes de comisión.", "tracked_by_app": True, "requirement_vvp": 0},
    {"key": "Miembro", "label": "Consultor Miembro", "maintenance": 180, "promotion_bonus": 0,
     "requirement": "400 VVP en cualquier mes de comisión.", "tracked_by_app": True, "requirement_vvp": 400},
    {"key": "Asociado", "label": "Asociado", "maintenance": 400, "promotion_bonus": 0,
     "requirement": "2,000 VGP, de los cuales 400 deben ser VVP.", "tracked_by_app": False, "requirement_vvp": 400},
    {"key": "Plata", "label": "Plata", "maintenance": 400, "promotion_bonus": 2600,
     "requirement": "6,000 VTOC · máximo 2,700 por ramificación · 3 ramificaciones vendiendo.", "tracked_by_app": False, "requirement_vvp": 0},
    {"key": "Oro", "label": "Oro", "maintenance": 600, "promotion_bonus": 6500,
     "requirement": "30,000 VTOC · máximo 13,500 por ramificación · 4 ramificaciones vendiendo.", "tracked_by_app": False, "requirement_vvp": 0},
    {"key": "Diamante", "label": "Diamante", "maintenance": 600, "promotion_bonus": 32500,
     "requirement": "125,000 VTOC · máximo 56,250 por ramificación.", "tracked_by_app": False, "requirement_vvp": 0},
    {"key": "Diamante Ejecutivo", "label": "Diamante Ejecutivo", "maintenance": 600, "promotion_bonus": 65000,
     "requirement": "500,000 VTOC · máximo 225,000 por ramificación.", "tracked_by_app": False, "requirement_vvp": 0},
    {"key": "Platino", "label": "Platino", "maintenance": 600, "promotion_bonus": 130000,
     "requirement": "1,500,000 VTOC · máximo 675,000 por ramificación.", "tracked_by_app": False, "requirement_vvp": 0},
]
RANK_KEYS = [rank["key"] for rank in RANKS]

# Un pedido de Cliente cuenta para el bono a partir de este volumen.
QUALIFYING_ORDER_VP = 400
# Niveles documentados del Bono por Volumen de Clientes. El plan menciona
# niveles intermedios que este documento no detalla.
CLIENT_BONUS_TIERS = [
    {"clients": 3, "percent": 5, "label": "Primer nivel"},
    {"clients": 8, "percent": 20, "label": "Nivel superior"},
]
# Bono de Desarrollo de Negocio: solo el primer mes de actividad del consultor nuevo.
BDN_TIERS = [
    {"consultants": 1, "percent": 5},
    {"consultants": 2, "percent": 10},
    {"consultants": 3, "percent": 20},
]
RETAIL_MARGIN = {"min": 5, "max": 30}

INCOME_DISCLAIMER = (
    "Las cifras son estimaciones con base en el plan de compensación y en lo que registras. "
    "No son una garantía ni una proyección de ingresos reales: el resultado depende de tu esfuerzo de ventas."
)


def rank_index(key: str) -> int:
    try:
        return RANK_KEYS.index(key)
    except ValueError:
        return 0


def days_left_in_month() -> int:
    hoy = date.today()
    ultimo = calendar.monthrange(hoy.year, hoy.month)[1]
    return ultimo - hoy.day


def tier_for(value: int, tiers: list[dict], field: str) -> dict | None:
    alcanzado = None
    for tier in tiers:
        if value >= tier[field]:
            alcanzado = tier
    return alcanzado


def next_tier(value: int, tiers: list[dict], field: str) -> dict | None:
    for tier in tiers:
        if value < tier[field]:
            return tier
    return None


SCHEMA_STATEMENTS = [
    """
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login TEXT
)""",
    """
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)""",
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
  rank TEXT NOT NULL DEFAULT 'Empresario',
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
  volume_points REAL NOT NULL DEFAULT 0,
  next_action TEXT DEFAULT '',
  next_action_date TEXT,
  last_contact TEXT,
  birthday TEXT,
  notes TEXT DEFAULT '',
  capture_session_id INTEGER,
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """
CREATE TABLE IF NOT EXISTS daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  metric_date TEXT NOT NULL,
  new_prospects INTEGER NOT NULL DEFAULT 0,
  presentations INTEGER NOT NULL DEFAULT 0,
  new_clients INTEGER NOT NULL DEFAULT 0,
  new_associates INTEGER NOT NULL DEFAULT 0,
  sales REAL NOT NULL DEFAULT 0,
  volume_points REAL NOT NULL DEFAULT 0,
  client_orders INTEGER NOT NULL DEFAULT 0,
  products_sold TEXT DEFAULT '',
  UNIQUE(user_id, metric_date)
)""",
    """
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  current REAL NOT NULL DEFAULT 0,
  target REAL NOT NULL,
  unit TEXT NOT NULL,
  color TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'En curso',
  user_id INTEGER NOT NULL DEFAULT 1
)""",
    """
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  unlocked_at TEXT,
  UNIQUE(user_id, slug)
)""",
    """
CREATE TABLE IF NOT EXISTS capture_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """
CREATE TABLE IF NOT EXISTS development_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  profile_tag TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL DEFAULT 1
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
    ("vvp-400", "Volumen de Miembro", "Acumula 400 VVP en un mes: el requisito para calificar como Consultor Miembro.", "📦"),
    ("client-bonus", "Bono desbloqueado", "Consigue 3 pedidos de cliente de 400+ VP en un mes y activa el Bono por Volumen de Clientes.", "🎯"),
    ("bdn-max", "Desarrollo al máximo", "Inscribe 3 consultores en un mismo mes y lleva tu BDN al 20%.", "🚀"),
]


def sync_achievement_catalog(db, user_id: int) -> None:
    """Agrega logros nuevos y actualiza sus textos sin tocar los ya desbloqueados."""
    for slug, title, description, icon in ACHIEVEMENT_CATALOG:
        db.execute(
            "INSERT OR IGNORE INTO achievements (user_id,slug,title,description,icon,unlocked_at) VALUES (?,?,?,?,?,NULL)",
            (user_id, slug, title, description, icon),
        )
        db.execute(
            "UPDATE achievements SET title=?, description=?, icon=? WHERE user_id=? AND slug=?",
            (title, description, icon, user_id, slug),
        )


def ensure_column(db, table: str, column: str, definition: str) -> None:
    try:
        existing = {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except Exception:
        pass


def create_session(db, account_id: int) -> str:
    token = secrets.token_urlsafe(32)
    ahora = datetime.now()
    db.execute(
        "INSERT INTO sessions (token,account_id,created_at,expires_at) VALUES (?,?,?,?)",
        (token, account_id, ahora.isoformat(timespec="seconds"),
         (ahora + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")),
    )
    return token


def session_account(db, token: str | None) -> dict | None:
    if not token:
        return None
    cuenta = fetch_one(db, """SELECT a.id, a.user_id, a.name, a.email, a.role, a.must_change_password, s.expires_at
                              FROM sessions s JOIN accounts a ON a.id = s.account_id
                              WHERE s.token = ? AND a.active = 1""", (token,))
    if not cuenta:
        return None
    if cuenta["expires_at"] < datetime.now().isoformat(timespec="seconds"):
        db.execute("DELETE FROM sessions WHERE token=?", (token,))
        return None
    return cuenta


def table_columns(db, table: str) -> set:
    try:
        return {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    except Exception:
        return set()


def rebuild_for_multiuser(db, table: str, columns: str, unique: str) -> None:
    """Reconstruye una tabla cuya restricción UNIQUE bloquearía a varios usuarios.

    SQLite no permite quitar un UNIQUE de columna sin recrear la tabla, así que
    se copia el contenido existente asignándolo al usuario 1.
    """
    if "user_id" in table_columns(db, table):
        return
    campos = [c.strip().split()[0] for c in columns.split("\n") if c.strip() and not c.strip().startswith("UNIQUE")]
    heredables = [c for c in campos if c != "user_id" and c in table_columns(db, table)]
    db.execute(f"ALTER TABLE {table} RENAME TO {table}_legacy")
    db.execute(f"CREATE TABLE {table} (\n{columns},\n  {unique}\n)")
    db.execute(f"INSERT INTO {table} (user_id,{','.join(heredables)}) SELECT 1,{','.join(heredables)} FROM {table}_legacy")
    db.execute(f"DROP TABLE {table}_legacy")
    print(f"  tabla {table} reconstruida para varios usuarios")


def migrate_multiuser(db) -> None:
    for tabla in ("contacts", "tasks", "goals", "development_items", "capture_sessions"):
        ensure_column(db, tabla, "user_id", "INTEGER NOT NULL DEFAULT 1")
    rebuild_for_multiuser(db, "daily_metrics", """  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  metric_date TEXT NOT NULL,
  new_prospects INTEGER NOT NULL DEFAULT 0,
  presentations INTEGER NOT NULL DEFAULT 0,
  new_clients INTEGER NOT NULL DEFAULT 0,
  new_associates INTEGER NOT NULL DEFAULT 0,
  sales REAL NOT NULL DEFAULT 0,
  volume_points REAL NOT NULL DEFAULT 0,
  client_orders INTEGER NOT NULL DEFAULT 0,
  products_sold TEXT DEFAULT ''""", "UNIQUE(user_id, metric_date)")
    rebuild_for_multiuser(db, "achievements", """  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  unlocked_at TEXT""", "UNIQUE(user_id, slug)")


def seed_user_catalogs(db, user_id: int) -> None:
    """Contenido base que cada usuario necesita para que la app no salga vacía."""
    if not db.execute("SELECT COUNT(*) FROM profile_scores WHERE user_id=?", (user_id,)).fetchone()[0]:
        db.executemany(
            "INSERT INTO profile_scores (user_id,profile_key,label,score,color) VALUES (?,?,?,?,?)",
            [(user_id, *fila) for fila in [
                ("leadership", "Liderazgo", 25, "#2878d0"),
                ("connection", "Conexión", 25, "#7755c7"),
                ("constancy", "Constancia", 25, "#55a85b"),
                ("analyst", "Analista", 25, "#ef5f86"),
                ("executor", "Ejecutor", 25, "#f49a2f"),
            ]],
        )
    if not db.execute("SELECT COUNT(*) FROM goals WHERE user_id=?", (user_id,)).fetchone()[0]:
        db.executemany(
            "INSERT INTO goals (user_id,title,current,target,unit,color) VALUES (?,?,?,?,?,?)",
            [(user_id, *fila) for fila in [
                ("Lista de prospectos", 0, 100, "personas", "#7755c7"),
                ("Contactos esta semana", 0, 25, "contactos", "#ef5f86"),
                ("Ventas del mes", 0, 35000, "MXN", "#f2a93b"),
                ("Sesiones de conocimiento", 0, 4, "sesiones", "#2878d0"),
            ]],
        )
    if not db.execute("SELECT COUNT(*) FROM development_items WHERE user_id=?", (user_id,)).fetchone()[0]:
        db.executemany(
            "INSERT INTO development_items (user_id,title,kind,progress,profile_tag,points) VALUES (?,?,?,?,?,?)",
            [(user_id, *fila) for fila in [
                ("Fundamentos científicos del producto", "Curso", 0, "Analista", 120),
                ("Conversaciones que conectan", "Práctica", 0, "Conexión", 90),
                ("Formación de líderes", "Ruta", 0, "Liderazgo", 180),
                ("Sistema de seguimiento semanal", "Hábito", 0, "Constancia", 110),
            ]],
        )
    sync_achievement_catalog(db, user_id)


def create_account(email: str, name: str, gender: str = "neutral", role: str = "admin", password: str | None = None) -> dict:
    """Crea una cuenta con su propio CRM. Devuelve la clave generada una sola vez."""
    email = clean_email(email, "El correo").lower()
    name = clean_text(name, 120, "El nombre", required=True)
    role = clean_choice(role, VALID_ROLES, "El rol", "admin")
    gender = clean_choice(gender, VALID_GENDERS, "El género", "neutral")
    password = password or generate_password()
    with connect() as db:
        if fetch_one(db, "SELECT id FROM accounts WHERE email=?", (email,)):
            raise ValueError(f"Ya existe una cuenta con el correo {email}")
        cursor = db.execute(
            """INSERT INTO users (name,gender,email,purpose,dominant_profile,xp,streak,target_income,rank)
               VALUES (?,?,?,'','Liderazgo',0,0,35000,'Empresario')""",
            (name, gender, email),
        )
        user_id = cursor.lastrowid
        db.execute(
            "INSERT INTO accounts (user_id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
            (user_id, name, email, hash_password(password), role),
        )
        seed_user_catalogs(db, user_id)
    return {"email": email, "name": name, "role": role, "user_id": user_id, "password": password}


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
        ensure_column(db, "users", "rank", "TEXT NOT NULL DEFAULT 'Empresario'")
        ensure_column(db, "daily_metrics", "volume_points", "REAL NOT NULL DEFAULT 0")
        ensure_column(db, "daily_metrics", "client_orders", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(db, "contacts", "volume_points", "REAL NOT NULL DEFAULT 0")
        ensure_column(db, "contacts", "capture_session_id", "INTEGER")
        migrate_multiuser(db)
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (datetime.now().isoformat(timespec="seconds"),))
        for existente in rows(db.execute("SELECT id FROM users")):
            sync_achievement_catalog(db, existente["id"])
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            return

        db.execute(
            "INSERT INTO users (id,name,purpose,dominant_profile,xp,streak,target_income,goal_date,rank) VALUES (1,?,?,?,?,?,?,?,'Asociado')",
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
            (user_id,name,kind,interest,stage,source,phone,health_profile,estimated_objective,products,monthly_consumption,next_action,next_action_date,last_contact,birthday,notes)
            VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
            "INSERT INTO tasks (user_id,title,detail,category,profile_tag,points,due_date,due_time,completed,contact_id) VALUES (1,?,?,?,?,?,?,?,?,?)",
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
            "INSERT INTO daily_metrics (user_id,metric_date,new_prospects,presentations,new_clients,new_associates,sales,volume_points,client_orders,products_sold) VALUES (1,?,?,?,?,?,?,?,?,?)",
            [
                (day_offset(-4), 3, 2, 1, 0, 4200, 600, 1, "Platinum x1, Sport x1"),
                (day_offset(-3), 2, 1, 0, 1, 3100, 440, 1, "Classic x1"),
                (day_offset(-2), 5, 3, 2, 0, 7800, 1120, 2, "Platinum x2, Sport x1"),
                (day_offset(-1), 4, 2, 1, 1, 6400, 920, 1, "Platinum x1, Classic x2"),
                (day_offset(0), 2, 1, 1, 0, 3200, 460, 1, "Platinum x1"),
            ],
        )
        db.executemany(
            "INSERT INTO goals (user_id,title,current,target,unit,color) VALUES (1,?,?,?,?,?)",
            [
                ("Lista de prospectos", 68, 100, "personas", "#7755c7"),
                ("Contactos esta semana", 17, 25, "contactos", "#ef5f86"),
                ("Ventas del mes", 24700, 35000, "MXN", "#f2a93b"),
                ("Sesiones de conocimiento", 3, 4, "sesiones", "#2878d0"),
            ],
        )
        db.executemany(
            "INSERT INTO development_items (user_id,title,kind,progress,profile_tag,points) VALUES (1,?,?,?,?,?)",
            [
                ("Fundamentos científicos del producto", "Curso", 72, "Analista", 120),
                ("Conversaciones que conectan", "Práctica", 45, "Conexión", 90),
                ("Formación de líderes", "Ruta", 28, "Liderazgo", 180),
                ("Sistema de seguimiento semanal", "Hábito", 83, "Constancia", 110),
            ],
        )


def compute_streak(db, user_id: int) -> int:
    """Días consecutivos con registro diario, contando hacia atrás desde hoy."""
    recorded = {row["metric_date"] for row in rows(db.execute("SELECT metric_date FROM daily_metrics WHERE user_id=? ORDER BY metric_date DESC LIMIT 400", (user_id,)))}
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


def achievement_stats(db, user_id: int) -> dict:
    user = fetch_one(db, "SELECT xp, purpose FROM users WHERE id=?", (user_id,)) or {}
    counts = {item["kind"]: item["count"] for item in rows(db.execute("SELECT kind,COUNT(*) count FROM contacts WHERE user_id=? GROUP BY kind", (user_id,)))}
    return {
        "xp": user.get("xp", 0),
        "has_purpose": bool((user.get("purpose") or "").strip()),
        "contacts": sum(counts.values()),
        "associates": counts.get("Asociado", 0),
        "goals": db.execute("SELECT COUNT(*) FROM goals WHERE user_id=?", (user_id,)).fetchone()[0],
        "streak": compute_streak(db, user_id),
        "sales": db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics WHERE user_id=?", (user_id,)).fetchone()[0],
        "month_vvp": db.execute("SELECT COALESCE(SUM(volume_points),0) FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?", (user_id, f"{today()[:7]}-%")).fetchone()[0],
        "month_orders": db.execute("SELECT COALESCE(SUM(client_orders),0) FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?", (user_id, f"{today()[:7]}-%")).fetchone()[0],
        "month_consultants": db.execute("SELECT COALESCE(SUM(new_associates),0) FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?", (user_id, f"{today()[:7]}-%")).fetchone()[0],
    }


ACHIEVEMENT_RULES = {
    "first-steps": lambda s: s["has_purpose"] and s["goals"] > 0,
    "network-10": lambda s: s["contacts"] >= 10,
    "connector": lambda s: s["contacts"] >= 25,
    "streak-7": lambda s: s["streak"] >= 7,
    "mentor": lambda s: s["associates"] >= 1,
    "first-sale": lambda s: s["sales"] > 0,
    "level-5": lambda s: s["xp"] >= 1000,
    "vvp-400": lambda s: s["month_vvp"] >= 400,
    "client-bonus": lambda s: s["month_orders"] >= CLIENT_BONUS_TIERS[0]["clients"],
    "bdn-max": lambda s: s["month_consultants"] >= BDN_TIERS[-1]["consultants"],
}


def evaluate_achievements(db, user_id: int) -> list[dict]:
    """Desbloquea los logros cuya condición ya se cumple. Devuelve los nuevos."""
    locked = rows(db.execute("SELECT slug,title,icon FROM achievements WHERE user_id=? AND unlocked_at IS NULL", (user_id,)))
    if not locked:
        return []
    stats = achievement_stats(db, user_id)
    unlocked = []
    for achievement in locked:
        rule = ACHIEVEMENT_RULES.get(achievement["slug"])
        if rule and rule(stats):
            db.execute("UPDATE achievements SET unlocked_at=? WHERE user_id=? AND slug=?", (today(), user_id, achievement["slug"]))
            unlocked.append(achievement)
    return unlocked


def sync_progress(db, user_id: int) -> list[dict]:
    """Recalcula racha y meta de ventas, y evalúa logros. Devuelve logros nuevos."""
    db.execute("UPDATE users SET streak=? WHERE id=?", (compute_streak(db, user_id), user_id))
    month_sales = db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?", (user_id, f"{today()[:7]}-%")).fetchone()[0]
    db.execute("UPDATE goals SET current=? WHERE user_id=? AND unit='MXN'", (month_sales, user_id))
    return evaluate_achievements(db, user_id)


def compensation_snapshot(db, user_id: int) -> dict:
    """Traduce lo registrado este mes a los términos del plan de compensación."""
    mes = f"{today()[:7]}-%"
    totales = fetch_one(db, """SELECT
        COALESCE(SUM(volume_points),0) vvp,
        COALESCE(SUM(client_orders),0) pedidos,
        COALESCE(SUM(new_associates),0) consultores,
        COALESCE(SUM(new_clients),0) clientes,
        COALESCE(SUM(sales),0) ventas
        FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?""", (user_id, mes)) or {}

    vvp = float(totales.get("vvp") or 0)
    pedidos = int(totales.get("pedidos") or 0)
    consultores = int(totales.get("consultores") or 0)
    restantes = days_left_in_month()

    usuario = fetch_one(db, "SELECT rank FROM users WHERE id=?", (user_id,)) or {}
    indice = rank_index(usuario.get("rank") or "Empresario")
    actual = RANKS[indice]
    siguiente = RANKS[indice + 1] if indice + 1 < len(RANKS) else None

    mantenimiento = actual["maintenance"]
    falta_mantener = max(0, mantenimiento - vvp)

    bono_clientes = tier_for(pedidos, CLIENT_BONUS_TIERS, "clients")
    siguiente_clientes = next_tier(pedidos, CLIENT_BONUS_TIERS, "clients")
    bdn = tier_for(consultores, BDN_TIERS, "consultants")
    siguiente_bdn = next_tier(consultores, BDN_TIERS, "consultants")

    # Clientes cuyo consumo registrado ya califica para el bono.
    clientes_calificados = db.execute(
        "SELECT COUNT(*) FROM contacts WHERE user_id=? AND kind='Cliente' AND volume_points >= ?", (user_id, QUALIFYING_ORDER_VP)
    ).fetchone()[0]

    return {
        "disclaimer": INCOME_DISCLAIMER,
        "days_left": restantes,
        "month_vvp": vvp,
        "month_orders": pedidos,
        "month_consultants": consultores,
        "month_sales": float(totales.get("ventas") or 0),
        "qualifying_clients": clientes_calificados,
        "qualifying_order_vp": QUALIFYING_ORDER_VP,
        "retail_margin": RETAIL_MARGIN,
        "rank": {
            "key": actual["key"],
            "label": actual["label"],
            "maintenance": mantenimiento,
            "maintenance_missing": falta_mantener,
            "maintenance_met": falta_mantener == 0,
            "progress": min(100, round((vvp / mantenimiento) * 100)) if mantenimiento else 100,
        },
        "next_rank": {
            "key": siguiente["key"],
            "label": siguiente["label"],
            "requirement": siguiente["requirement"],
            "promotion_bonus": siguiente["promotion_bonus"],
            "tracked_by_app": siguiente["tracked_by_app"],
            "requirement_vvp": siguiente["requirement_vvp"],
            "vvp_progress": min(100, round((vvp / siguiente["requirement_vvp"]) * 100)) if siguiente["requirement_vvp"] else 0,
        } if siguiente else None,
        "client_bonus": {
            "percent": bono_clientes["percent"] if bono_clientes else 0,
            "label": bono_clientes["label"] if bono_clientes else "Sin nivel todavía",
            "next_percent": siguiente_clientes["percent"] if siguiente_clientes else None,
            "next_clients": siguiente_clientes["clients"] if siguiente_clientes else None,
            "missing": max(0, siguiente_clientes["clients"] - pedidos) if siguiente_clientes else 0,
        },
        "bdn": {
            "percent": bdn["percent"] if bdn else 0,
            "next_percent": siguiente_bdn["percent"] if siguiente_bdn else None,
            "missing": max(0, siguiente_bdn["consultants"] - consultores) if siguiente_bdn else 0,
        },
        "alerts": compensation_alerts(vvp, pedidos, consultores, restantes, actual, siguiente,
                                      bono_clientes, siguiente_clientes, bdn, siguiente_bdn),
    }


def compensation_alerts(vvp, pedidos, consultores, restantes, actual, siguiente,
                        bono_clientes, siguiente_clientes, bdn, siguiente_bdn) -> list[dict]:
    """Avisos accionables: qué falta, cuánto y hasta cuándo."""
    plazo = "hoy es el último día del mes" if restantes == 0 else f"quedan {restantes} día{'s' if restantes != 1 else ''} del mes"
    avisos = []

    falta = max(0, actual["maintenance"] - vvp)
    if actual["maintenance"] and falta > 0:
        avisos.append({
            "tone": "urgent" if restantes <= 7 else "warning",
            "title": f"Te faltan {falta:,.0f} VVP para mantener {actual['label']}",
            "message": f"Llevas {vvp:,.0f} de {actual['maintenance']:,} VVP y {plazo}.",
        })
    elif actual["maintenance"]:
        avisos.append({
            "tone": "success",
            "title": f"Rango {actual['label']} asegurado este mes",
            "message": f"Llevas {vvp:,.0f} VVP y el mínimo es {actual['maintenance']:,}.",
        })

    if siguiente and siguiente["tracked_by_app"] and siguiente["requirement_vvp"]:
        faltan = max(0, siguiente["requirement_vvp"] - vvp)
        if faltan > 0:
            avisos.append({
                "tone": "info",
                "title": f"A {faltan:,.0f} VVP de alcanzar {siguiente['label']}",
                "message": f"{siguiente['requirement']} Ya llevas {vvp:,.0f} VVP este mes.",
            })

    if siguiente_clientes:
        faltan = max(0, siguiente_clientes["clients"] - pedidos)
        actual_pct = bono_clientes["percent"] if bono_clientes else 0
        avisos.append({
            "tone": "info",
            "title": f"Con {faltan} cliente{'s' if faltan != 1 else ''} más pasas al {siguiente_clientes['percent']}% del Bono por Volumen de Clientes",
            "message": f"Llevas {pedidos} pedido{'s' if pedidos != 1 else ''} de {QUALIFYING_ORDER_VP}+ VP este mes"
                       + (f" ({actual_pct}% actual)." if actual_pct else ". El bono arranca con 3 clientes.")
                       + f" Recuerda que {plazo}.",
        })

    if siguiente_bdn:
        faltan = max(0, siguiente_bdn["consultants"] - consultores)
        actual_pct = bdn["percent"] if bdn else 0
        avisos.append({
            "tone": "warning" if restantes <= 10 else "info",
            "title": f"Con {faltan} consultor{'es' if faltan != 1 else ''} más tu BDN sube al {siguiente_bdn['percent']}%",
            "message": f"Inscribiste {consultores} este mes"
                       + (f" ({actual_pct}% actual)." if actual_pct else ".")
                       + f" El Bono de Desarrollo de Negocio solo aplica el primer mes de cada consultor nuevo, y {plazo}.",
        })

    return avisos


# ---------------------------------------------------------------------------
# Captura por QR: sesiones con enlace propio para que la gente se registre sola.
# ---------------------------------------------------------------------------

CAPTURE_INTERESTS = {
    "Cliente": "Quiero probar los productos",
    "Consultor": "Quiero conocer el negocio",
    "Ambos": "Me interesan las dos cosas",
    "Sin definir": "Todavía no lo sé",
}
# Tope de registros por IP dentro de la ventana. Es generoso a propósito: en una
# plática todos los asistentes salen por la misma IP del WiFi del lugar, así que
# un límite bajo bloquearía a personas legítimas. Frena el abuso automatizado,
# no a una sala llena.
CAPTURE_RATE_LIMIT = 60
CAPTURE_RATE_WINDOW = 600
_capture_hits: dict[str, list[float]] = {}
_capture_lock = threading.Lock()


_login_hits: dict[str, list[float]] = {}


def login_rate_ok(client_ip: str) -> bool:
    """Frena el probado de contraseñas por fuerza bruta."""
    ahora = datetime.now().timestamp()
    with _capture_lock:
        recientes = [t for t in _login_hits.get(client_ip, []) if ahora - t < LOGIN_RATE_WINDOW]
        if len(recientes) >= LOGIN_RATE_LIMIT:
            _login_hits[client_ip] = recientes
            return False
        recientes.append(ahora)
        _login_hits[client_ip] = recientes
        return True


def capture_rate_ok(client_ip: str) -> bool:
    ahora = datetime.now().timestamp()
    with _capture_lock:
        recientes = [t for t in _capture_hits.get(client_ip, []) if ahora - t < CAPTURE_RATE_WINDOW]
        if len(recientes) >= CAPTURE_RATE_LIMIT:
            _capture_hits[client_ip] = recientes
            return False
        recientes.append(ahora)
        _capture_hits[client_ip] = recientes
        return True


def new_capture_token() -> str:
    return secrets.token_urlsafe(9)


def find_capture_session(db, token: str) -> dict | None:
    return fetch_one(db, "SELECT * FROM capture_sessions WHERE token=?", (token,))


def capture_qr_svg(url: str) -> bytes:
    import segno
    buffer = io.BytesIO()
    segno.make(url, error="m").save(buffer, kind="svg", scale=8, border=2, dark="#1a224d")
    return buffer.getvalue()


def week_activity(db, user_id: int) -> list[dict]:
    """Los últimos siete días con marca de actividad, para los puntos de la racha."""
    recorded = {row["metric_date"] for row in rows(db.execute("SELECT metric_date FROM daily_metrics WHERE user_id=? ORDER BY metric_date DESC LIMIT 60", (user_id,)))}
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


def dashboard_payload(db, user_id: int) -> dict:
    new_achievements = sync_progress(db, user_id)
    user = fetch_one(db, "SELECT * FROM users WHERE id=?", (user_id,))
    profile_scores = rows(db.execute("SELECT * FROM profile_scores WHERE user_id=? ORDER BY score DESC", (user_id,)))
    task_list = rows(db.execute("SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE t.user_id=? AND t.due_date=? ORDER BY t.completed, t.due_time", (user_id, today())))
    contact_counts = {item["kind"]: item["count"] for item in rows(db.execute("SELECT kind,COUNT(*) count FROM contacts WHERE user_id=? GROUP BY kind", (user_id,)))}
    metrics = fetch_one(db, "SELECT * FROM daily_metrics WHERE user_id=? AND metric_date=?", (user_id, today())) or {}
    sales_month = db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?", (user_id, f"{today()[:7]}-%")).fetchone()[0]
    month_totals = fetch_one(db, """SELECT COALESCE(SUM(new_prospects),0) prospects, COALESCE(SUM(new_clients),0) clients,
        COALESCE(SUM(new_associates),0) associates FROM daily_metrics WHERE user_id=? AND metric_date LIKE ?""", (user_id, f"{today()[:7]}-%")) or {}
    week_prospects = db.execute("SELECT COALESCE(SUM(new_prospects),0) FROM daily_metrics WHERE user_id=? AND metric_date>=?", (user_id, day_offset(-6))).fetchone()[0]
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
        "week_activity": week_activity(db, user_id),
        "compensation": compensation_snapshot(db, user_id),
        "goals": rows(db.execute("SELECT * FROM goals WHERE user_id=? ORDER BY id", (user_id,))),
        "achievements": rows(db.execute("SELECT * FROM achievements WHERE user_id=? ORDER BY unlocked_at IS NULL, unlocked_at DESC, id", (user_id,))),
        "new_achievements": new_achievements,
        "recent_contacts": rows(db.execute("SELECT * FROM contacts WHERE user_id=? ORDER BY COALESCE(last_contact,created_at) DESC LIMIT 5", (user_id,))),
        "development": rows(db.execute("SELECT * FROM development_items WHERE user_id=? ORDER BY id", (user_id,))),
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

    def read_cookie(self, name: str) -> str | None:
        crudo = self.headers.get("Cookie", "")
        for parte in crudo.split(";"):
            clave, _, valor = parte.strip().partition("=")
            if clave == name:
                return valor
        return None

    def is_public(self, path: str) -> bool:
        return path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES)

    def require_session(self, path: str) -> bool:
        """Resuelve la sesión. Devuelve False si ya respondió negando el acceso."""
        self.account = None
        self.user_id = None
        with connect() as db:
            self.account = session_account(db, self.read_cookie(SESSION_COOKIE))
        if self.account:
            self.user_id = self.account["user_id"]
            return True
        if self.is_public(path):
            return True
        if path.startswith("/api/"):
            self.send_json({"error": "Necesitas iniciar sesión", "auth": False}, HTTPStatus.UNAUTHORIZED)
        else:
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/login")
            self.end_headers()
        return False

    def dispatch(self, route) -> None:
        """Ninguna solicitud malformada debe tumbar el manejador."""
        try:
            if not self.require_session(urlparse(self.path).path):
                return
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
        # El enlace del QR abre el formulario público, sea cual sea el token.
        if parsed.path.startswith("/captura/"):
            self.serve_static("/captura.html")
            return
        if parsed.path == "/login":
            self.serve_static("/login.html")
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
        elif parsed.path == "/api/capture-sessions":
            self.create_capture_session()
        elif parsed.path.startswith("/api/captura/"):
            self.submit_capture(parsed.path.rsplit("/", 1)[-1])
        elif parsed.path == "/api/auth/login":
            self.login()
        elif parsed.path == "/api/auth/logout":
            self.logout()
        elif parsed.path == "/api/auth/password":
            self.change_password()
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def login(self) -> None:
        cliente = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        if not login_rate_ok(cliente):
            self.send_json({"error": "Demasiados intentos. Espera unos minutos antes de volver a probar."},
                           HTTPStatus.TOO_MANY_REQUESTS)
            return
        data = self.read_json()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        with connect() as db:
            cuenta = fetch_one(db, "SELECT * FROM accounts WHERE email=? AND active=1", (email,))
            # Mismo mensaje exista o no la cuenta: no revelar qué correos están dados de alta.
            if not cuenta or not verify_password(password, cuenta["password_hash"]):
                self.send_json({"error": "Correo o contraseña incorrectos"}, HTTPStatus.UNAUTHORIZED)
                return
            token = create_session(db, cuenta["id"])
            db.execute("UPDATE accounts SET last_login=? WHERE id=?",
                       (datetime.now().isoformat(timespec="seconds"), cuenta["id"]))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        seguro = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" or USE_TURSO else ""
        self.send_header("Set-Cookie",
                         f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS * 86400}{seguro}")
        cuerpo = json.dumps({"ok": True, "name": cuenta["name"], "role": cuenta["role"],
                             "must_change_password": bool(cuenta["must_change_password"])}, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def logout(self) -> None:
        token = self.read_cookie(SESSION_COOKIE)
        if token:
            with connect() as db:
                db.execute("DELETE FROM sessions WHERE token=?", (token,))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
        cuerpo = json.dumps({"ok": True}).encode("utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def change_password(self) -> None:
        data = self.read_json()
        actual = str(data.get("current_password", ""))
        nueva = str(data.get("new_password", ""))
        if len(nueva) < 10:
            self.send_json({"error": "La contraseña nueva debe tener al menos 10 caracteres"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            cuenta = fetch_one(db, "SELECT * FROM accounts WHERE id=?", (self.account["id"],))
            if not cuenta or not verify_password(actual, cuenta["password_hash"]):
                self.send_json({"error": "Tu contraseña actual no coincide"}, HTTPStatus.UNAUTHORIZED)
                return
            db.execute("UPDATE accounts SET password_hash=?, must_change_password=0 WHERE id=?",
                       (hash_password(nueva), cuenta["id"]))
            # Cerrar las demás sesiones por seguridad.
            db.execute("DELETE FROM sessions WHERE account_id=? AND token<>?",
                       (cuenta["id"], self.read_cookie(SESSION_COOKIE) or ""))
        self.send_json({"ok": True, "message": "Tu contraseña quedó actualizada"})

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
        elif len(parts) == 3 and parts[:2] == ["api", "capture-sessions"]:
            self.update_capture_session(self.parse_id(parts[2]))
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
        elif len(parts) == 3 and parts[:2] == ["api", "capture-sessions"]:
            self.delete_record("capture_sessions", self.parse_id(parts[2]), "Sesión de captura eliminada")
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def parse_id(self, raw: str) -> int | None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    def handle_api_get(self, parsed) -> None:
        with connect() as db:
            if parsed.path == "/api/auth/me":
                self.send_json({"name": self.account["name"], "email": self.account["email"],
                                "role": self.account["role"],
                                "must_change_password": bool(self.account["must_change_password"])})
            elif parsed.path == "/api/health":
                self.send_json({"ok": True, "database": "turso" if USE_TURSO else "sqlite", "date": today(), "version": APP_VERSION})
            elif parsed.path == "/api/export":
                self.export_data(db)
            elif parsed.path == "/api/dashboard":
                self.send_json(dashboard_payload(db, self.user_id))
            elif parsed.path.startswith("/api/captura/"):
                token = parsed.path.rsplit("/", 1)[-1]
                sesion = find_capture_session(db, token)
                if not sesion:
                    self.send_json({"error": "Este enlace no existe o fue dado de baja."}, HTTPStatus.NOT_FOUND)
                elif not sesion["active"]:
                    self.send_json({"error": "Este registro ya está cerrado. Pide el enlace vigente a quien te invitó."}, HTTPStatus.GONE)
                else:
                    self.send_json({"title": sesion["title"], "interests": CAPTURE_INTERESTS})
            elif parsed.path == "/api/capture-sessions":
                self.send_json(rows(db.execute(
                    """SELECT s.*, (SELECT COUNT(*) FROM contacts c WHERE c.capture_session_id=s.id) registros
                       FROM capture_sessions s WHERE s.user_id=? ORDER BY s.active DESC, s.id DESC""", (self.user_id,))))
            elif parsed.path.startswith("/api/capture-sessions/") and parsed.path.endswith("/qr.svg"):
                self.send_capture_qr(db, parsed)
            elif parsed.path == "/api/compensation":
                self.send_json({**compensation_snapshot(db, self.user_id), "ranks": RANKS})
            elif parsed.path == "/api/tasks":
                query = parse_qs(parsed.query)
                due = query.get("date", [today()])[0]
                self.send_json(rows(db.execute(
                    "SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE t.user_id=? AND t.due_date=? ORDER BY t.completed, t.due_time",
                    (self.user_id, due))))
            elif parsed.path == "/api/contacts":
                query = parse_qs(parsed.query)
                kind = query.get("kind", [""])[0]
                source = query.get("source", [""])[0]
                search = query.get("q", [""])[0]
                sql = "SELECT * FROM contacts WHERE user_id=?"
                values = [self.user_id]
                if kind:
                    sql += " AND kind=?"
                    values.append(kind)
                if source == "Sin fuente":
                    sql += " AND COALESCE(TRIM(source),'')=''"
                elif source:
                    sql += " AND TRIM(COALESCE(source,''))=?"
                    values.append(source)
                if search:
                    sql += " AND (name LIKE ? OR notes LIKE ? OR stage LIKE ?)"
                    values.extend([f"%{search}%"] * 3)
                sql += " ORDER BY CASE interest WHEN 'Alto' THEN 1 WHEN 'Medio' THEN 2 ELSE 3 END, COALESCE(next_action_date,'9999')"
                self.send_json(rows(db.execute(sql, values)))
            elif parsed.path == "/api/contact-sources":
                self.send_json(rows(db.execute(
                    """SELECT COALESCE(NULLIF(TRIM(source),''),'Sin fuente') source, COUNT(*) count
                       FROM contacts WHERE user_id=? GROUP BY 1 ORDER BY count DESC, source""", (self.user_id,))))
            elif parsed.path == "/api/metrics":
                self.send_json(rows(db.execute("SELECT * FROM daily_metrics WHERE user_id=? ORDER BY metric_date DESC LIMIT 14", (self.user_id,))))
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
            "volume_points": clean_number(data.get("volume_points"), "Los puntos de volumen", 0, 1_000_000),
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
                f"INSERT INTO contacts (user_id,{','.join(columns)}) VALUES (?,{','.join('?' for _ in columns)})",
                [self.user_id] + [values[column] for column in columns],
            )
            db.execute("UPDATE users SET xp=xp+25 WHERE id=?", (self.user_id,))
            contact = fetch_one(db, "SELECT * FROM contacts WHERE id=?", (cursor.lastrowid,))
            unlocked = evaluate_achievements(db, self.user_id)
        self.send_json({**contact, "new_achievements": unlocked}, HTTPStatus.CREATED)

    def update_contact(self, contact_id: int | None) -> None:
        if contact_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        with connect() as db:
            actual = fetch_one(db, "SELECT * FROM contacts WHERE id=? AND user_id=?", (contact_id, self.user_id))
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
            db.execute(f"UPDATE contacts SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=? AND user_id=?", [value for _, value in updates] + [contact_id, self.user_id])
            record = fetch_one(db, "SELECT * FROM contacts WHERE id=? AND user_id=?", (contact_id, self.user_id))
        self.send_json(record if record else {"error": "No encontrado"}, HTTPStatus.OK if record else HTTPStatus.NOT_FOUND)

    def delete_record(self, table: str, record_id: int | None, message: str) -> None:
        if record_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            existing = fetch_one(db, f"SELECT id FROM {table} WHERE id=? AND user_id=?", (record_id, self.user_id))
            if not existing:
                self.send_json({"error": "No encontrado"}, HTTPStatus.NOT_FOUND)
                return
            db.execute(f"DELETE FROM {table} WHERE id=? AND user_id=?", (record_id, self.user_id))
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
                "INSERT INTO tasks (user_id,title,detail,category,profile_tag,points,due_date,due_time,contact_id) VALUES (?,?,?,?,?,?,?,?,?)",
                (self.user_id,) + values,
            )
            task = fetch_one(db, "SELECT * FROM tasks WHERE id=?", (cursor.lastrowid,))
        self.send_json(task, HTTPStatus.CREATED)

    def update_task(self, task_id: int | None) -> None:
        if task_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        with connect() as db:
            task = fetch_one(db, "SELECT * FROM tasks WHERE id=? AND user_id=?", (task_id, self.user_id))
            if not task:
                self.send_json({"error": "Misión no encontrada"}, HTTPStatus.NOT_FOUND)
                return
            limpio = self.task_fields({**task, **data})
            updates = [(key, limpio[key]) for key in data if key in limpio]
            if updates:
                db.execute(f"UPDATE tasks SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=? AND user_id=?",
                           [value for _, value in updates] + [task_id, self.user_id])
            unlocked = []
            if "completed" in data:
                completed = 1 if data.get("completed") else 0
                was_completed = task["completed"]
                db.execute("UPDATE tasks SET completed=? WHERE id=? AND user_id=?", (completed, task_id, self.user_id))
                if completed and not was_completed:
                    db.execute("UPDATE users SET xp=xp+? WHERE id=?", (task["points"], self.user_id))
                elif not completed and was_completed:
                    db.execute("UPDATE users SET xp=MAX(0,xp-?) WHERE id=?", (task["points"], self.user_id))
                unlocked = evaluate_achievements(db, self.user_id)
            elif not updates:
                self.send_json({"error": "No hay cambios válidos"}, HTTPStatus.BAD_REQUEST)
                return
            user = fetch_one(db, "SELECT * FROM users WHERE id=?", (self.user_id,))
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
            db.execute(f"UPDATE goals SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=? AND user_id=?",
                       [value for _, value in updates] + [goal_id, self.user_id])
            record = fetch_one(db, "SELECT * FROM goals WHERE id=? AND user_id=?", (goal_id, self.user_id))
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
            record = fetch_one(db, "SELECT * FROM development_items WHERE id=? AND user_id=?", (item_id, self.user_id))
            if not record:
                self.send_json({"error": "No encontrada"}, HTTPStatus.NOT_FOUND)
                return
            db.execute("UPDATE development_items SET progress=? WHERE id=? AND user_id=?", (progress, item_id, self.user_id))
            record = fetch_one(db, "SELECT * FROM development_items WHERE id=? AND user_id=?", (item_id, self.user_id))
        self.send_json(record)

    def public_base_url(self) -> str:
        host = self.headers.get("Host", f"127.0.0.1:{self.server.server_address[1]}")
        # Render/Cloudflare terminan TLS antes de llegar aquí.
        scheme = self.headers.get("X-Forwarded-Proto", "https" if USE_TURSO else "http")
        return f"{scheme}://{host}"

    def create_capture_session(self) -> None:
        data = self.read_json()
        titulo = clean_text(data.get("title"), 120, "El nombre de la sesión", required=True)
        token = new_capture_token()
        with connect() as db:
            cursor = db.execute("INSERT INTO capture_sessions (user_id,title,token,active) VALUES (?,?,?,1)", (self.user_id, titulo, token))
            sesion = fetch_one(db, "SELECT * FROM capture_sessions WHERE id=?", (cursor.lastrowid,))
        self.send_json({**sesion, "registros": 0, "url": f"{self.public_base_url()}/captura/{token}"}, HTTPStatus.CREATED)

    def update_capture_session(self, session_id: int | None) -> None:
        if session_id is None:
            self.send_json({"error": "Identificador inválido"}, HTTPStatus.BAD_REQUEST)
            return
        data = self.read_json()
        updates = []
        if "title" in data:
            updates.append(("title", clean_text(data.get("title"), 120, "El nombre de la sesión", required=True)))
        if "active" in data:
            updates.append(("active", 1 if data.get("active") else 0))
        if "regenerate" in data and data.get("regenerate"):
            updates.append(("token", new_capture_token()))
        if not updates:
            self.send_json({"error": "No hay cambios válidos"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            db.execute(f"UPDATE capture_sessions SET {','.join(f'{k}=?' for k, _ in updates)} WHERE id=? AND user_id=?",
                       [v for _, v in updates] + [session_id, self.user_id])
            sesion = fetch_one(db, "SELECT * FROM capture_sessions WHERE id=? AND user_id=?", (session_id, self.user_id))
        if not sesion:
            self.send_json({"error": "No encontrada"}, HTTPStatus.NOT_FOUND)
            return
        self.send_json({**sesion, "url": f"{self.public_base_url()}/captura/{sesion['token']}"})

    def send_capture_qr(self, db, parsed) -> None:
        session_id = self.parse_id(parsed.path.split("/")[3])
        sesion = fetch_one(db, "SELECT * FROM capture_sessions WHERE id=? AND user_id=?", (session_id, self.user_id)) if session_id else None
        if not sesion:
            self.send_json({"error": "No encontrada"}, HTTPStatus.NOT_FOUND)
            return
        try:
            svg = capture_qr_svg(f"{self.public_base_url()}/captura/{sesion['token']}")
        except ImportError:
            self.send_json({"error": "Falta la librería segno para generar el código QR"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(svg)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(svg)

    def submit_capture(self, token: str) -> None:
        """Registro que la propia persona llena desde el QR. Endpoint público."""
        cliente = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        if not capture_rate_ok(cliente):
            self.send_json({"error": "Recibimos demasiados registros desde este dispositivo. Espera unos minutos."},
                           HTTPStatus.TOO_MANY_REQUESTS)
            return
        data = self.read_json()
        with connect() as db:
            sesion = find_capture_session(db, token)
            if not sesion:
                self.send_json({"error": "Este enlace no existe o fue dado de baja."}, HTTPStatus.NOT_FOUND)
                return
            if not sesion["active"]:
                self.send_json({"error": "Este registro ya está cerrado."}, HTTPStatus.GONE)
                return
            interes = clean_choice(data.get("interest"), set(CAPTURE_INTERESTS), "El interés", "Sin definir")
            objetivo = {"Cliente": "Cliente", "Consultor": "Asociado", "Ambos": "Cliente / Asociado", "Sin definir": ""}[interes]
            valores = {
                "name": clean_text(data.get("name"), 120, "Tu nombre", required=True),
                "kind": "Prospecto",
                "interest": "Alto" if interes in ("Cliente", "Consultor", "Ambos") else "Medio",
                "stage": "Nuevo",
                "source": "Registro por QR",
                "phone": clean_text(data.get("phone"), 40, "Tu teléfono"),
                "email": clean_email(data.get("email"), "Tu correo"),
                "health_profile": clean_text(data.get("health_profile"), 600, "Lo que quieres mejorar"),
                "estimated_objective": objetivo,
                "next_action": "Dar seguimiento al registro de la plática",
                "next_action_date": day_offset(1),
                "last_contact": today(),
                "notes": clean_text(data.get("notes"), 600, "Tus comentarios"),
                "capture_session_id": sesion["id"],
                "user_id": sesion["user_id"],
            }
            columnas = list(valores)
            db.execute(
                f"INSERT INTO contacts ({','.join(columnas)}) VALUES ({','.join('?' for _ in columnas)})",
                [valores[c] for c in columnas],
            )
            db.execute("UPDATE users SET xp=xp+25 WHERE id=?", (sesion["user_id"],))
            evaluate_achievements(db, sesion["user_id"])
        self.send_json({"ok": True, "message": "¡Gracias! Tus datos quedaron registrados."}, HTTPStatus.CREATED)

    def export_data(self, db) -> None:
        # El respaldo solo puede contener los datos de quien lo pide.
        payload = {"exported_at": datetime.now().isoformat(timespec="seconds"),
                   "account": self.account["email"], "data": {}}
        payload["data"]["users"] = rows(db.execute("SELECT * FROM users WHERE id=?", (self.user_id,)))
        for table in ("profile_scores", "contacts", "tasks", "daily_metrics", "goals", "achievements",
                      "development_items", "capture_sessions"):
            payload["data"][table] = rows(db.execute(f"SELECT * FROM {table} WHERE user_id=?", (self.user_id,)))
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="brujula-respaldo-{today()}.json"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def save_metrics(self) -> None:
        data = self.read_json()
        metric_date = clean_date(data.get("metric_date"), "La fecha del registro") or today()
        etiquetas = {
            "new_prospects": "Los prospectos nuevos", "presentations": "Las presentaciones",
            "new_clients": "Los clientes nuevos", "new_associates": "Los asociados nuevos",
            "sales": "Las ventas", "volume_points": "Los puntos de volumen", "client_orders": "Los pedidos de clientes",
        }
        values = [clean_number(data.get(field), etiquetas[field], 0, 10_000_000) for field in etiquetas]
        values.append(clean_text(data.get("products_sold"), 300, "Los productos vendidos"))
        with connect() as db:
            db.execute(
                """INSERT INTO daily_metrics (user_id,metric_date,new_prospects,presentations,new_clients,new_associates,sales,volume_points,client_orders,products_sold)
                VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,metric_date) DO UPDATE SET
                new_prospects=excluded.new_prospects,presentations=excluded.presentations,new_clients=excluded.new_clients,
                new_associates=excluded.new_associates,sales=excluded.sales,volume_points=excluded.volume_points,
                client_orders=excluded.client_orders,products_sold=excluded.products_sold""",
                [self.user_id, metric_date] + values,
            )
            db.execute("UPDATE users SET xp=xp+15 WHERE id=?", (self.user_id,))
            unlocked = sync_progress(db, self.user_id)
            streak = fetch_one(db, "SELECT streak FROM users WHERE id=?", (self.user_id,))["streak"]
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
                db.execute("UPDATE profile_scores SET score=? WHERE user_id=? AND profile_key=?", (int(score), self.user_id, key))
            winner = db.execute("SELECT label FROM profile_scores WHERE user_id=? ORDER BY score DESC LIMIT 1", (self.user_id,)).fetchone()[0]
            db.execute("UPDATE users SET dominant_profile=?, xp=xp+75 WHERE id=?", (winner, self.user_id))
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
            clean_choice(data.get("rank"), set(RANK_KEYS), "El rango", "Empresario"),
        )
        with connect() as db:
            db.execute(
                """UPDATE users SET name=?,gender=?,email=?,phone=?,city=?,
                purpose=?,target_income=?,goal_date=?,rank=? WHERE id=?""",
                values + (self.user_id,),
            )
            user = fetch_one(db, "SELECT * FROM users WHERE id=?", (self.user_id,))
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
            # Cloudflare (delante de Render) debilita el ETag a W/"...": comparar sin el prefijo.
            recibido = (self.headers.get("If-None-Match") or "").strip()
            if recibido.startswith("W/"):
                recibido = recibido[2:]
            if recibido == etag:
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
    parser.add_argument("--add-account", nargs=2, metavar=("CORREO", "NOMBRE"),
                        help="Crea una cuenta con su propio CRM y muestra la contraseña una sola vez")
    parser.add_argument("--gender", default="neutral", choices=sorted(VALID_GENDERS))
    parser.add_argument("--role", default="admin", choices=sorted(VALID_ROLES))
    parser.add_argument("--list-accounts", action="store_true")
    args = parser.parse_args()
    global APP_VERSION
    APP_VERSION = app_version()
    initialize_database()
    if args.add_account:
        correo, nombre = args.add_account
        cuenta = create_account(correo, nombre, gender=args.gender, role=args.role)
        print(f"\n  Cuenta creada: {cuenta['name']} <{cuenta['email']}>  ({cuenta['role']})")
        print(f"  Contraseña temporal: {cuenta['password']}")
        print("  Guárdala ahora: no se vuelve a mostrar, en la base solo queda su hash.\n")
        return
    if args.list_accounts:
        with connect() as db:
            for c in rows(db.execute("SELECT name,email,role,active,last_login FROM accounts ORDER BY id")):
                estado = "activa" if c["active"] else "desactivada"
                print(f"  {c['email']:<34} {c['name']:<32} {c['role']:<10} {estado:<12} último acceso: {c['last_login'] or 'nunca'}")
        return
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
