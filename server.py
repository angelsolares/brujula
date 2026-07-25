#!/usr/bin/env python3
"""BRUJULA CRM - servidor local sin dependencias externas."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sqlite3
from datetime import date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "brujula.db"
WEB_DIR = ROOT / "web"
PUBLIC_DIR = ROOT / "public"

TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")
USE_TURSO = bool(TURSO_DATABASE_URL)

if USE_TURSO:
    import libsql


def today() -> str:
    return date.today().isoformat()


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
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            return

        db.execute(
            "INSERT INTO users (id,name,purpose,dominant_profile,xp,streak,target_income,goal_date) VALUES (1,?,?,?,?,?,?,?)",
            (
                "Mariana Torres",
                "Construyo mi negocio para cuidar mi salud, alcanzar libertad financiera y ayudar a otras personas a crecer.",
                "Liderazgo",
                1480,
                9,
                35000,
                "2026-12-15",
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
                ("Ana Robles", "Prospecto", "Alto", "Presentación", "Café virtual", "656 555 0148", "Problemas de circulación; busca más energía", "Cliente / Asociada", "", 0, "Contarle una historia de éxito e invitarla a café", "2026-07-22", "2026-07-20", "1988-08-12", "No llamar durante el horario laboral."),
                ("Pedro Sosa", "Prospecto", "Medio", "Contactado", "Referido", "656 555 0192", "Interés en rendimiento físico", "Cliente", "", 0, "Enviar video de testimonio", "2026-07-22", "2026-07-18", None, "Prefiere mensajes de WhatsApp."),
                ("Carlos Vega", "Prospecto", "Alto", "Seguimiento", "Facebook", "656 555 0174", "Investiga antioxidantes", "Cliente", "", 0, "Enviar video científico", "2026-07-23", "2026-07-21", None, "Le interesan datos y estudios."),
                ("Luisa Mendoza", "Cliente", "Alto", "Recompra", "En persona", "656 555 0107", "Bienestar general", "Cliente frecuente", "Immunocal Platinum", 3200, "Confirmar recompra mensual", "2026-07-24", "2026-07-16", "1979-09-03", "Compartió un testimonio positivo."),
                ("Karina López", "Cliente", "Medio", "Testimonio", "Instagram", "656 555 0119", "Recuperación deportiva", "Referidos", "Immunocal Sport", 2100, "Solicitar testimonio y dos referidos", "2026-07-25", "2026-07-15", None, "Participa en carreras locales."),
                ("Claudia Ruiz", "Asociado", "Alto", "Capacitación", "Evento", "656 555 0133", "", "Líder de equipo", "", 4500, "Revisar plan semanal de cinco contactos", "2026-07-22", "2026-07-19", "1985-11-28", "Perfil Conexión-Constancia."),
                ("Luis Ortega", "Asociado", "Medio", "Activación", "Referido", "656 555 0166", "", "Productor", "", 1800, "Agendar capacitación técnica", "2026-07-26", "2026-07-12", None, "Necesita acompañamiento para crear rutina."),
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
                ("2026-07-18", 3, 2, 1, 0, 4200, "Platinum x1, Sport x1"),
                ("2026-07-19", 2, 1, 0, 1, 3100, "Classic x1"),
                ("2026-07-20", 5, 3, 2, 0, 7800, "Platinum x2, Sport x1"),
                ("2026-07-21", 4, 2, 1, 1, 6400, "Platinum x1, Classic x2"),
                (today(), 2, 1, 1, 0, 3200, "Platinum x1"),
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
            "INSERT INTO achievements (slug,title,description,icon,unlocked_at) VALUES (?,?,?,?,?)",
            [
                ("first-steps", "Primeros pasos", "Completaste tu propósito y tu primera meta.", "🧭", "2026-07-02"),
                ("connector", "Gran conectora", "Registraste 25 conversaciones significativas.", "🤝", "2026-07-14"),
                ("streak-7", "Racha imparable", "Trabajaste tu plan durante siete días.", "🔥", "2026-07-20"),
                ("mentor", "Mentora en camino", "Acompañaste a tu primer asociado.", "🏅", None),
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


def dashboard_payload(db) -> dict:
    user = fetch_one(db, "SELECT * FROM users WHERE id=1")
    profile_scores = rows(db.execute("SELECT * FROM profile_scores WHERE user_id=1 ORDER BY score DESC"))
    task_list = rows(db.execute("SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE due_date=? ORDER BY completed, due_time", (today(),)))
    contact_counts = {item["kind"]: item["count"] for item in rows(db.execute("SELECT kind,COUNT(*) count FROM contacts GROUP BY kind"))}
    metrics = fetch_one(db, "SELECT * FROM daily_metrics WHERE metric_date=?", (today(),)) or {}
    sales_month = db.execute("SELECT COALESCE(SUM(sales),0) FROM daily_metrics WHERE metric_date LIKE ?", (f"{today()[:7]}-%",)).fetchone()[0]
    user["level"] = user["xp"] // 250 + 1
    user["level_progress"] = user["xp"] % 250
    return {
        "user": user,
        "profile_scores": profile_scores,
        "tasks": task_list,
        "contact_counts": contact_counts,
        "metrics": metrics,
        "sales_month": sales_month,
        "goals": rows(db.execute("SELECT * FROM goals ORDER BY id")),
        "achievements": rows(db.execute("SELECT * FROM achievements ORDER BY unlocked_at IS NULL, unlocked_at DESC")),
        "recent_contacts": rows(db.execute("SELECT * FROM contacts ORDER BY COALESCE(last_contact,created_at) DESC LIMIT 5")),
        "development": rows(db.execute("SELECT * FROM development_items ORDER BY id")),
    }


class AppHandler(BaseHTTPRequestHandler):
    server_version = "BrujulaCRM/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")

    def send_json(self, payload, status=HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/contacts":
            self.create_contact()
        elif parsed.path == "/api/metrics":
            self.save_metrics()
        elif parsed.path == "/api/profile/scores":
            self.save_profile_scores()
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if parsed.path == "/api/profile":
            self.update_profile()
        elif len(parts) == 3 and parts[:2] == ["api", "tasks"]:
            self.toggle_task(int(parts[2]))
        elif len(parts) == 3 and parts[:2] == ["api", "contacts"]:
            self.update_contact(int(parts[2]))
        else:
            self.send_json({"error": "Ruta no encontrada"}, HTTPStatus.NOT_FOUND)

    def handle_api_get(self, parsed) -> None:
        with connect() as db:
            if parsed.path == "/api/dashboard":
                self.send_json(dashboard_payload(db))
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

    def create_contact(self) -> None:
        data = self.read_json()
        if not data.get("name"):
            self.send_json({"error": "El nombre es obligatorio"}, HTTPStatus.BAD_REQUEST)
            return
        fields = ["name", "kind", "interest", "stage", "source", "phone", "email", "health_profile", "estimated_objective", "products", "monthly_consumption", "next_action", "next_action_date", "last_contact", "birthday", "notes"]
        defaults = {"kind": "Prospecto", "interest": "Medio", "stage": "Nuevo", "source": "En persona", "monthly_consumption": 0}
        values = [data.get(field, defaults.get(field, "")) or None for field in fields]
        values[10] = data.get("monthly_consumption") or 0
        with connect() as db:
            cursor = db.execute(f"INSERT INTO contacts ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})", values)
            db.execute("UPDATE users SET xp=xp+25 WHERE id=1")
            contact = fetch_one(db, "SELECT * FROM contacts WHERE id=?", (cursor.lastrowid,))
        self.send_json(contact, HTTPStatus.CREATED)

    def update_contact(self, contact_id: int) -> None:
        data = self.read_json()
        allowed = {"interest", "stage", "next_action", "next_action_date", "last_contact", "notes", "products", "monthly_consumption"}
        updates = [(key, value) for key, value in data.items() if key in allowed]
        if not updates:
            self.send_json({"error": "No hay cambios válidos"}, HTTPStatus.BAD_REQUEST)
            return
        with connect() as db:
            db.execute(f"UPDATE contacts SET {','.join(f'{key}=?' for key, _ in updates)} WHERE id=?", [value for _, value in updates] + [contact_id])
            record = fetch_one(db, "SELECT * FROM contacts WHERE id=?", (contact_id,))
        self.send_json(record if record else {"error": "No encontrado"}, HTTPStatus.OK if record else HTTPStatus.NOT_FOUND)

    def toggle_task(self, task_id: int) -> None:
        data = self.read_json()
        completed = 1 if data.get("completed") else 0
        with connect() as db:
            task = fetch_one(db, "SELECT * FROM tasks WHERE id=?", (task_id,))
            if not task:
                self.send_json({"error": "Misión no encontrada"}, HTTPStatus.NOT_FOUND)
                return
            was_completed = task["completed"]
            db.execute("UPDATE tasks SET completed=? WHERE id=?", (completed, task_id))
            if completed and not was_completed:
                db.execute("UPDATE users SET xp=xp+? WHERE id=1", (task["points"],))
            elif not completed and was_completed:
                db.execute("UPDATE users SET xp=MAX(0,xp-?) WHERE id=1", (task["points"],))
            user = fetch_one(db, "SELECT * FROM users WHERE id=1")
        self.send_json({"ok": True, "xp": user["xp"], "level": user["xp"] // 250 + 1})

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
        self.send_json({"ok": True, "message": "Avance guardado +15 XP"})

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
        name = str(data.get("name", "")).strip()
        gender = str(data.get("gender", "female")).strip()
        if not name:
            self.send_json({"error": "Escribe tu nombre para guardar el perfil"}, HTTPStatus.BAD_REQUEST)
            return
        if gender not in {"female", "male", "neutral"}:
            self.send_json({"error": "Selecciona una opción de género válida"}, HTTPStatus.BAD_REQUEST)
            return
        try:
            target_income = max(0, float(data.get("target_income") or 0))
        except (TypeError, ValueError):
            self.send_json({"error": "La meta de ingresos debe ser un número"}, HTTPStatus.BAD_REQUEST)
            return
        values = (
            name[:120],
            gender,
            str(data.get("email", "")).strip()[:160],
            str(data.get("phone", "")).strip()[:40],
            str(data.get("city", "")).strip()[:100],
            str(data.get("purpose", "")).strip()[:800],
            target_income,
            str(data.get("goal_date", "")).strip() or None,
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
            self.send_response(HTTPStatus.OK)
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
