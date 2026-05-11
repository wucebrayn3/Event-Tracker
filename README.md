# Event Tracker (Django + React)

Event Tracker for student events with:

- Role-based accounts (`student`, `admin`, `staff`)
- Event preparation/start/end lifecycle control
- Committee onboarding via admin-generated code
- Attendance with image proof
- Accident reporting and committee reports
- Admin broadcasts to all committees or specific committee members
- Analytics summary + chart-ready API (bar, pie, line, event summary)
- JSON file upload endpoint for external/mock-data analysis
- Sortable event dashboard and near real-time polling metrics

## Project Structure

- `backend/` Django REST API
- `frontend/` React + Vite client

## Backend Setup

1. Create virtual environment and install dependencies:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Apply migrations and create superadmin:

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

3. Run backend server:

```bash
python manage.py runserver
```

API base URL: `http://127.0.0.1:8000/api`

## Frontend Setup

1. Install and run:

```bash
cd frontend
npm install
npm run dev
```

2. Open Vite URL (default): `http://127.0.0.1:5173`

If needed, set custom API URL:

```bash
set VITE_API_URL=http://127.0.0.1:8000/api
```

## Core API Endpoints

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `GET /api/auth/me/`
- `POST /api/auth/create-admin/` (superadmin only)
- `GET|POST /api/events/`
- `POST /api/events/{id}/prepare/`
- `POST /api/events/{id}/join-committee/`
- `POST /api/events/{id}/start/`
- `POST /api/events/{id}/end/`
- `POST /api/events/{id}/attendance-toggle/`
- `POST /api/events/{id}/pick/`
- `POST /api/attendance/`
- `GET /api/attendance/review/{event_id}/`
- `POST /api/attendance/{attendance_id}/review/`
- `POST /api/committee-reports/create/`
- `GET /api/committee-reports/`
- `POST /api/committee-reports/{report_id}/respond/`
- `GET|POST /api/broadcasts/`
- `GET|POST /api/accidents/`
- `POST /api/ratings/`
- `GET|POST /api/expenditures/`
- `GET /api/analytics/event/{event_id}/summary/`
- `GET /api/analytics/event/{event_id}/charts/`
- `GET /api/analytics/live/`
- `POST /api/analytics/upload-json/`
- `GET /api/events/{event_id}/report.csv`

## Behavior Mapping to Your Requirements

- Default registered users are students.
- Only superadmin can create admins via `/api/auth/create-admin/`.
- Admin can initiate preparation, issue committee code, and start/end events.
- Only admin can end events and control attendance availability.
- Students can pick events, submit attendance image proof, and send accident reports.
- Committees can send internal reports to admins.
- Admin can respond to committee reports and send broadcasts.
- Analytics endpoints aggregate attendance, demographics, duration, rating, accidents, and expenditure.
- JSON upload supports mock-data analysis and chart payload generation.
