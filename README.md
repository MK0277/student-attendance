# Attendly — Student Attendance Manager

A beginner-friendly student attendance app built with Python, Flask, and SQLite.

## Features
- Responsive dashboard with daily attendance counts.
- Add students with unique roll number, name, class/section, phone, and email.
- Edit and delete student records.
- Mark Present, Absent, or Late for any selected date.
- Quick action to mark everyone Present.
- Search by student name, roll number, or class.
- Download date-wise CSV attendance reports.
- First-time interactive guide; replay it using Quick guide.
- Local SQLite database persists records between app restarts.
- Footer watermark: Created by MK Dzines.

## Run locally
1. Install Python 3.10 or newer.
2. Open a terminal in this project folder.
3. Create a virtual environment: `py -m venv .venv` (Windows) or `python3 -m venv .venv` (macOS/Linux).
4. Activate it: `.venv\\Scripts\\activate` (Windows) or `source .venv/bin/activate` (macOS/Linux).
5. Install dependencies: `pip install -r requirements.txt`.
6. Start: `python app.py`.
7. Open http://127.0.0.1:5000.

The app creates `attendance.db` automatically. Keep this file safe because it contains student records.

Deleting a student also deletes their attendance history. This version is for local classroom use. Add authentication, backups, HTTPS, and role-based permissions before public or multi-user deployment.

Created by MK Dzines.
