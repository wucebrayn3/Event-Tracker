from collections import Counter
from datetime import timedelta

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import AccidentReport, Attendance, Event, ExperienceRating, Expenditure, User


def duration_to_hours(duration: timedelta | None) -> float:
    if not duration:
        return 0.0
    return round(duration.total_seconds() / 3600, 2)


def build_event_summary(event: Event) -> dict:
    attendances = Attendance.objects.filter(event=event)
    approved_attendances = attendances.filter(status=Attendance.Status.APPROVED)
    rating_data = ExperienceRating.objects.filter(event=event).aggregate(avg=Avg("rating"), count=Count("id"))
    accident_by_type = (
        AccidentReport.objects.filter(event=event).values("accident_type").annotate(count=Count("id")).order_by("-count")
    )
    total_expenditure = Expenditure.objects.filter(event=event).aggregate(total=Sum("amount")).get("total") or 0

    demographic_users = User.objects.filter(attendances__event=event).distinct()
    sex_distribution = Counter(demographic_users.values_list("sex", flat=True))
    course_distribution = Counter(demographic_users.values_list("course", flat=True))
    year_distribution = Counter(demographic_users.values_list("year", flat=True))

    return {
        "event": {
            "id": event.id,
            "name": event.name,
            "location": event.location,
            "status": event.status,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "duration_hours": duration_to_hours(event.duration),
        },
        "attendance_population": attendances.count(),
        "approved_attendance_population": approved_attendances.count(),
        "committee_population": event.committee_memberships.filter(is_active=True).count(),
        "avg_experience_rating": round(rating_data.get("avg") or 0, 2),
        "rating_submissions": rating_data.get("count") or 0,
        "accident_count": AccidentReport.objects.filter(event=event).count(),
        "accident_by_type": list(accident_by_type),
        "event_expenditure_total": float(total_expenditure),
        "demographics": {
            "sex": dict(sex_distribution),
            "course": dict(course_distribution),
            "year": dict(year_distribution),
        },
    }


def build_chart_payload(event: Event) -> dict:
    summary = build_event_summary(event)

    ratings = ExperienceRating.objects.filter(event=event).values("rating").annotate(count=Count("id")).order_by("rating")
    accidents_timeline = (
        AccidentReport.objects.filter(event=event)
        .annotate(day=TruncDate("accident_time"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )
    expenditures_timeline = (
        Expenditure.objects.filter(event=event)
        .annotate(day=TruncDate("spent_on"))
        .values("day")
        .annotate(total=Sum("amount"))
        .order_by("day")
    )

    return {
        "summary": summary,
        "bar": {
            "labels": ["Attendance", "Approved", "Committees", "Accidents"],
            "values": [
                summary["attendance_population"],
                summary["approved_attendance_population"],
                summary["committee_population"],
                summary["accident_count"],
            ],
        },
        "pie": {
            "labels": list(summary["demographics"]["sex"].keys()),
            "values": list(summary["demographics"]["sex"].values()),
        },
        "line": {
            "accidents": {
                "labels": [str(row["day"]) for row in accidents_timeline],
                "values": [row["count"] for row in accidents_timeline],
            },
            "expenditures": {
                "labels": [str(row["day"]) for row in expenditures_timeline],
                "values": [float(row["total"] or 0) for row in expenditures_timeline],
            },
        },
        "ratings": {
            "labels": [str(row["rating"]) for row in ratings],
            "values": [row["count"] for row in ratings],
        },
    }


def live_metrics(event: Event | None = None) -> dict:
    now = timezone.now()
    events = Event.objects.all() if event is None else Event.objects.filter(id=event.id)
    payload = []
    for item in events:
        summary = build_event_summary(item)
        payload.append(
            {
                "event_id": item.id,
                "event_name": item.name,
                "status": item.status,
                "attendance_open": item.attendance_open,
                "attendance_population": summary["attendance_population"],
                "approved_attendance_population": summary["approved_attendance_population"],
                "accident_count": summary["accident_count"],
                "avg_experience_rating": summary["avg_experience_rating"],
                "updated_at": now,
            }
        )
    return {"timestamp": now, "events": payload}


def analyze_json_payload(payload) -> dict:
    """
    Accepts list/dict JSON and tries to build chart-friendly outputs.
    Expects object fields like: name, date, attendance, rating, expenditure, accident_count.
    """
    if isinstance(payload, dict):
        records = payload.get("records", [])
    else:
        records = payload

    if not isinstance(records, list):
        raise ValueError("JSON must be a list or an object containing a `records` list.")

    attendance_total = 0
    expenditure_total = 0.0
    rating_values = []
    accident_total = 0
    event_names = []
    attendance_points = []
    expenditure_points = []

    for record in records:
        if not isinstance(record, dict):
            continue
        event_name = str(record.get("name") or record.get("event") or f"Event {len(event_names) + 1}")
        attendance = int(record.get("attendance", 0) or 0)
        rating = float(record.get("rating", 0) or 0)
        expenditure = float(record.get("expenditure", 0) or 0)
        accident_count = int(record.get("accident_count", 0) or 0)

        attendance_total += attendance
        expenditure_total += expenditure
        rating_values.append(rating)
        accident_total += accident_count

        event_names.append(event_name)
        attendance_points.append(attendance)
        expenditure_points.append(expenditure)

    avg_rating = round(sum(rating_values) / len(rating_values), 2) if rating_values else 0

    return {
        "summary": {
            "record_count": len(records),
            "attendance_total": attendance_total,
            "expenditure_total": round(expenditure_total, 2),
            "average_rating": avg_rating,
            "accident_total": accident_total,
        },
        "bar": {"labels": event_names, "values": attendance_points},
        "line": {"labels": event_names, "values": expenditure_points},
        "pie": {
            "labels": ["Attendance", "Accidents"],
            "values": [attendance_total, accident_total],
        },
    }
