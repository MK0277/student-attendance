from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import csv
import io
from pathlib import Path
from datetime import date, datetime

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "attendance.db"
app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roll_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
            name TEXT NOT NULL,
            class_name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            attendance_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late')),
            note TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(student_id, attendance_date)
        );
        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
        """)

def error(message, code=400):
    return jsonify({"ok": False, "message": message}), code

@app.get("/")
def home():
    return render_template("index.html", today=date.today().isoformat())

@app.get("/api/dashboard")
def dashboard():
    selected = request.args.get("date", date.today().isoformat())
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]
        rows = conn.execute("""
            SELECT status, COUNT(*) AS total FROM attendance
            WHERE attendance_date = ? GROUP BY status
        """, (selected,)).fetchall()
    counts = {row["status"]: row["total"] for row in rows}
    present, absent, late = counts.get("Present", 0), counts.get("Absent", 0), counts.get("Late", 0)
    marked = present + absent + late
    return jsonify({"ok": True, "total": total, "present": present, "absent": absent,
                    "late": late, "unmarked": max(total-marked, 0), "date": selected})

@app.route("/api/students", methods=["GET", "POST"])
def students():
    if request.method == "GET":
        q = request.args.get("q", "").strip()
        with db() as conn:
            rows = conn.execute("""
                SELECT s.id, s.roll_no, s.name, s.class_name, s.email, s.phone,
                       a.status, a.note
                FROM students s
                LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=?
                WHERE s.name LIKE ? OR s.roll_no LIKE ? OR s.class_name LIKE ?
                ORDER BY s.roll_no COLLATE NOCASE
            """, (request.args.get("date", date.today().isoformat()), f"%{q}%", f"%{q}%", f"%{q}%")).fetchall()
        return jsonify({"ok": True, "students": [dict(r) for r in rows]})

    data = request.get_json(silent=True) or {}
    roll = str(data.get("roll_no", "")).strip()
    name = str(data.get("name", "")).strip()
    if not roll or not name:
        return error("Please enter both the student's name and roll number.")
    try:
        with db() as conn:
            cur = conn.execute("INSERT INTO students (roll_no,name,class_name,email,phone) VALUES (?,?,?,?,?)",
                (roll, name, str(data.get("class_name","")).strip(), str(data.get("email","")).strip(), str(data.get("phone","")).strip()))
            student_id = cur.lastrowid
        return jsonify({"ok": True, "message": "Student added successfully.", "id": student_id}), 201
    except sqlite3.IntegrityError:
        return error("That roll number is already in use. Please choose a unique roll number.", 409)

@app.route("/api/students/<int:student_id>", methods=["PUT", "DELETE"])
def student_detail(student_id):
    with db() as conn:
        exists = conn.execute("SELECT id FROM students WHERE id=?", (student_id,)).fetchone()
        if not exists:
            return error("Student not found.", 404)
        if request.method == "DELETE":
            conn.execute("DELETE FROM students WHERE id=?", (student_id,))
            return jsonify({"ok": True, "message": "Student and their attendance history deleted."})
        data = request.get_json(silent=True) or {}
        roll = str(data.get("roll_no", "")).strip()
        name = str(data.get("name", "")).strip()
        if not roll or not name:
            return error("Name and roll number are required.")
        try:
            conn.execute("""UPDATE students SET roll_no=?, name=?, class_name=?, email=?, phone=? WHERE id=?""",
                (roll, name, str(data.get("class_name","")).strip(), str(data.get("email","")).strip(),
                 str(data.get("phone","")).strip(), student_id))
        except sqlite3.IntegrityError:
            return error("That roll number is already assigned to another student.", 409)
    return jsonify({"ok": True, "message": "Student details updated."})

@app.post("/api/attendance")
def save_attendance():
    data = request.get_json(silent=True) or {}
    selected = str(data.get("date", ""))
    try:
        datetime.strptime(selected, "%Y-%m-%d")
    except ValueError:
        return error("Please choose a valid attendance date.")
    entries = data.get("entries", [])
    if not isinstance(entries, list):
        return error("Attendance data is not valid.")
    with db() as conn:
        for item in entries:
            try:
                sid = int(item.get("student_id"))
            except (TypeError, ValueError):
                return error("An attendance entry has an invalid student.")
            status = item.get("status")
            if status not in ("Present", "Absent", "Late"):
                return error("Choose Present, Absent, or Late for each marked student.")
            conn.execute("""
                INSERT INTO attendance(student_id,attendance_date,status,note,updated_at)
                VALUES(?,?,?,?,CURRENT_TIMESTAMP)
                ON CONFLICT(student_id,attendance_date) DO UPDATE SET
                status=excluded.status, note=excluded.note, updated_at=CURRENT_TIMESTAMP
            """, (sid, selected, status, str(item.get("note","")).strip()))
    return jsonify({"ok": True, "message": f"Attendance saved for {len(entries)} student(s)."})

@app.get("/export.csv")
def export_csv():
    selected = request.args.get("date", date.today().isoformat())
    with db() as conn:
        rows = conn.execute("""
            SELECT s.roll_no, s.name, s.class_name, COALESCE(a.status,'Not marked') AS status, COALESCE(a.note,'') AS note
            FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=?
            ORDER BY s.roll_no COLLATE NOCASE
        """, (selected,)).fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Roll No", "Student Name", "Class", "Attendance Date", "Status", "Note"])
    for row in rows:
        writer.writerow([row["roll_no"], row["name"], row["class_name"], selected, row["status"], row["note"]])
    return Response("\ufeff" + output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=attendance-{selected}.csv"})

@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "Student Attendance Manager"})

init_db()

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
