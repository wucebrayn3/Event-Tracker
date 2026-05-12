import csv
import json
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AccidentReport,
    AdminBroadcast,
    Attendance,
    CommitteeMembership,
    CommitteeReport,
    Event,
    EventCommitteeCode,
    EventSelection,
    ExperienceRating,
    Expenditure,
    User,
)
from .permissions import IsAdminOrCommitteeForEvent, IsAdminRole, IsStudentRole, user_is_committee
from .serializers import (
    AccidentReportSerializer,
    AdminBroadcastSerializer,
    AttendanceReviewSerializer,
    AttendanceSerializer,
    AttendanceToggleSerializer,
    CommitteeJoinSerializer,
    CommitteeMembershipSerializer,
    CommitteeReportRespondSerializer,
    CommitteeReportSerializer,
    EventCommitteeCodeSerializer,
    EventSelectionSerializer,
    EventSerializer,
    ExperienceRatingSerializer,
    ExpenditureSerializer,
    JSONUploadSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .services import (
    analyze_json_payload,
    build_all_events_pdf,
    build_chart_payload,
    build_event_pdf,
    build_event_summary,
    live_metrics,
)

UserModel = get_user_model()


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class EventListCreateView(APIView):
    def get(self, request):
        queryset = Event.objects.all().annotate(
            committee_count=Count("committee_memberships", filter=Q(committee_memberships__is_active=True), distinct=True),
            attendance_count=Count("attendances", distinct=True),
            approved_attendance_count=Count(
                "attendances",
                filter=Q(attendances__status=Attendance.Status.APPROVED),
                distinct=True,
            ),
        )

        sort_by = request.query_params.get("sort_by")
        if sort_by == "time":
            queryset = queryset.order_by("-start_time", "-created_at")
        elif sort_by == "attendance":
            queryset = queryset.order_by("-attendance_count", "name")
        elif sort_by == "alphabetical":
            queryset = queryset.order_by("name")
        else:
            queryset = queryset.order_by("-created_at")

        return Response(EventSerializer(queryset, many=True).data)

    def post(self, request):
        if not (request.user.is_superuser or request.user.role == User.Role.ADMIN):
            return Response({"detail": "Only admins can create events."}, status=status.HTTP_403_FORBIDDEN)
        serializer = EventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = serializer.save(created_by=request.user)
        return Response(EventSerializer(event).data, status=status.HTTP_201_CREATED)


class EventPrepareView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        expiry_hours = int(request.data.get("expiry_hours", 72))
        code_value = request.data.get("code") or secrets.token_hex(4).upper()
        code = EventCommitteeCode.objects.create(
            event=event,
            code=code_value,
            expires_at=timezone.now() + timedelta(hours=expiry_hours),
            created_by=request.user,
        )
        event.status = Event.Status.PREPARATION
        event.save(update_fields=["status", "updated_at"])
        return Response(EventCommitteeCodeSerializer(code).data, status=status.HTTP_201_CREATED)


class EventJoinCommitteeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, event_id):
        if request.user.is_superuser or request.user.role == User.Role.ADMIN:
            return Response({"detail": "Admins cannot join committees."}, status=status.HTTP_403_FORBIDDEN)
        event = get_object_or_404(Event, id=event_id)
        serializer = CommitteeJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        code_obj = EventCommitteeCode.objects.filter(event=event, code=code, is_active=True).order_by("-created_at").first()
        if not code_obj or not code_obj.is_valid():
            return Response({"detail": "Invalid or expired committee code."}, status=status.HTTP_400_BAD_REQUEST)

        membership, created = CommitteeMembership.objects.get_or_create(
            user=request.user,
            event=event,
            defaults={"added_by": request.user, "is_active": True},
        )
        if not created and not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active"])
        if request.user.role == User.Role.STUDENT:
            request.user.role = User.Role.STAFF
            request.user.save(update_fields=["role"])

        return Response(
            {
                "joined": True,
                "membership": CommitteeMembershipSerializer(membership).data,
            }
        )


class CommitteeMembershipManageView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, event_id):
        members = CommitteeMembership.objects.filter(event_id=event_id, is_active=True).order_by("-joined_at")
        return Response(CommitteeMembershipSerializer(members, many=True).data)

    def post(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        serializer = CommitteeMembershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member, created = CommitteeMembership.objects.get_or_create(
            event=event,
            user=serializer.validated_data["user"],
            defaults={"added_by": request.user, "is_active": True},
        )
        if not created:
            member.is_active = True
            member.added_by = request.user
            member.save(update_fields=["is_active", "added_by"])
        if member.user.role == User.Role.STUDENT:
            member.user.role = User.Role.STAFF
            member.user.save(update_fields=["role"])
        return Response(CommitteeMembershipSerializer(member).data, status=status.HTTP_201_CREATED)


class CommitteeMembershipRemoveView(APIView):
    permission_classes = [IsAdminRole]

    def delete(self, request, event_id, membership_id):
        membership = get_object_or_404(CommitteeMembership, id=membership_id, event_id=event_id)
        membership.is_active = False
        membership.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventStartView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        if not event.start_time:
            event.start_time = timezone.now()
        event.status = Event.Status.ACTIVE
        event.attendance_open = True
        event.save(update_fields=["status", "attendance_open", "start_time", "updated_at"])
        return Response(EventSerializer(event).data)


class EventEndView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        event.status = Event.Status.ENDED
        event.end_time = timezone.now()
        event.attendance_open = False
        event.save(update_fields=["status", "end_time", "attendance_open", "updated_at"])
        return Response(EventSerializer(event).data)


class EventAttendanceToggleView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        serializer = AttendanceToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event.attendance_open = serializer.validated_data["attendance_open"]
        event.save(update_fields=["attendance_open", "updated_at"])
        return Response({"attendance_open": event.attendance_open})


class EventDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        return Response(EventSerializer(event).data)


class MyCommitteeStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        if request.user.is_superuser or request.user.role == User.Role.ADMIN:
            return Response({"is_committee": False})
        is_committee = user_is_committee(request.user, event)
        return Response({"is_committee": is_committee})


class EventPickView(APIView):
    permission_classes = [IsStudentRole]

    def post(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        selection, _ = EventSelection.objects.get_or_create(student=request.user, event=event)
        return Response(EventSelectionSerializer(selection).data, status=status.HTTP_201_CREATED)


class AttendanceCreateView(generics.CreateAPIView):
    serializer_class = AttendanceSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsStudentRole]

    def perform_create(self, serializer):
        event = serializer.validated_data["event"]
        if event.status != Event.Status.ACTIVE or not event.attendance_open:
            raise ValueError("Attendance is currently closed for this event.")
        if Attendance.objects.filter(event=event, student=self.request.user).exists():
            raise ValueError("You already submitted attendance for this event.")
        if not EventSelection.objects.filter(event=event, student=self.request.user).exists():
            raise ValueError("Select this event first before submitting attendance.")
        serializer.save(student=self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class AttendanceReviewListView(APIView):
    permission_classes = [IsAdminOrCommitteeForEvent]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        if event.status != Event.Status.ENDED and not (request.user.is_superuser or request.user.role == User.Role.ADMIN):
            return Response(
                {"detail": "Attendance review is only available after the event has ended."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        attendances = Attendance.objects.filter(event=event).order_by("-submitted_at")
        return Response(AttendanceSerializer(attendances, many=True).data)


class AttendanceReviewActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, attendance_id):
        attendance = get_object_or_404(Attendance, id=attendance_id)
        if attendance.event.status != Event.Status.ENDED:
            return Response(
                {"detail": "Attendance review is only available after the event has ended."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (
            request.user.is_superuser
            or request.user.role == User.Role.ADMIN
            or user_is_committee(request.user, attendance.event)
        ):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = AttendanceReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attendance.status = serializer.validated_data["status"]
        attendance.review_note = serializer.validated_data.get("review_note", "")
        attendance.reviewed_by = request.user
        attendance.reviewed_at = timezone.now()
        attendance.save(update_fields=["status", "review_note", "reviewed_by", "reviewed_at"])
        return Response(AttendanceSerializer(attendance).data)


class CommitteeReportCreateView(generics.CreateAPIView):
    serializer_class = CommitteeReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        event = serializer.validated_data["event"]
        if self.request.user.is_superuser or self.request.user.role == User.Role.ADMIN:
            raise ValueError("Admins cannot submit committee reports.")
        if not user_is_committee(self.request.user, event):
            raise ValueError("Only committee members can submit committee reports.")
        serializer.save(committee=self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class CommitteeReportListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.is_superuser or request.user.role == User.Role.ADMIN:
            reports = CommitteeReport.objects.all()
            event_id = request.query_params.get("event_id")
            if event_id:
                reports = reports.filter(event_id=event_id)
                if not request.user.is_superuser:
                    reports = reports.filter(event__created_by=request.user)
            reports = reports.order_by("-created_at")
        else:
            reports = CommitteeReport.objects.filter(committee=request.user).order_by("-created_at")
        return Response(CommitteeReportSerializer(reports, many=True).data)


class CommitteeReportRespondView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, report_id):
        report = get_object_or_404(CommitteeReport, id=report_id)
        serializer = CommitteeReportRespondSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report.admin_response = serializer.validated_data["admin_response"]
        report.is_resolved = serializer.validated_data["is_resolved"]
        report.responded_by = request.user
        report.responded_at = timezone.now()
        report.save(update_fields=["admin_response", "is_resolved", "responded_by", "responded_at"])
        return Response(CommitteeReportSerializer(report).data)


class AdminBroadcastView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.is_superuser or request.user.role == User.Role.ADMIN:
            data = AdminBroadcast.objects.all().order_by("-created_at")
        else:
            data = AdminBroadcast.objects.filter(
                Q(target_committee=request.user) | Q(target_committee__isnull=True),
                event__committee_memberships__user=request.user,
                event__committee_memberships__is_active=True,
            ).distinct()
        return Response(AdminBroadcastSerializer(data, many=True).data)

    def post(self, request):
        if not (request.user.is_superuser or request.user.role == User.Role.ADMIN):
            return Response({"detail": "Only admins can send broadcasts."}, status=status.HTTP_403_FORBIDDEN)
        serializer = AdminBroadcastSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        broadcast = serializer.save(admin=request.user)
        return Response(AdminBroadcastSerializer(broadcast).data, status=status.HTTP_201_CREATED)


class AccidentReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not (request.user.is_superuser or request.user.role == User.Role.ADMIN):
            return Response({"detail": "Only admins can view accident reports."}, status=status.HTTP_403_FORBIDDEN)
        event_id = request.query_params.get("event_id")
        queryset = AccidentReport.objects.all().order_by("-created_at")
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        return Response(AccidentReportSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AccidentReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(reporter=request.user)
        return Response(AccidentReportSerializer(instance).data, status=status.HTTP_201_CREATED)


class ExperienceRatingView(APIView):
    permission_classes = [IsStudentRole]

    def post(self, request):
        serializer = ExperienceRatingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = serializer.validated_data["event"]
        rating, _ = ExperienceRating.objects.update_or_create(
            event=event,
            student=request.user,
            defaults={
                "rating": serializer.validated_data["rating"],
                "comment": serializer.validated_data.get("comment", ""),
            },
        )
        return Response(ExperienceRatingSerializer(rating).data, status=status.HTTP_201_CREATED)


class ExpenditureView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        event_id = request.query_params.get("event_id")
        queryset = Expenditure.objects.all().order_by("-spent_on")
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        return Response(ExpenditureSerializer(queryset, many=True).data)

    def post(self, request):
        if not (request.user.is_superuser or request.user.role == User.Role.ADMIN):
            return Response({"detail": "Only admins can add expenditures."}, status=status.HTTP_403_FORBIDDEN)
        event_id = request.data.get("event")
        if event_id:
            event = get_object_or_404(Event, id=event_id)
            if event.status != Event.Status.PREPARATION:
                return Response(
                    {"detail": "Expenditures can only be added during event preparation."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer = ExpenditureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expenditure = serializer.save(added_by=request.user)
        return Response(ExpenditureSerializer(expenditure).data, status=status.HTTP_201_CREATED)


class AnalyticsSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        return Response(build_event_summary(event))


class AnalyticsChartsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        return Response(build_chart_payload(event))


class LiveMetricsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        event_id = request.query_params.get("event_id")
        event = get_object_or_404(Event, id=event_id) if event_id else None
        return Response(live_metrics(event))


class AnalyticsPDFView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        buffer = build_event_pdf(event)
        response = HttpResponse(buffer, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="event_{event_id}_analytics.pdf"'
        return response


class AllEventsPDFView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        buffer = build_all_events_pdf()
        response = HttpResponse(buffer, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="all_events_analytics.pdf"'
        return response


class UserListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        users = UserModel.objects.all()
        role = request.query_params.get("role")
        if role:
            users = users.filter(role=role)
        return Response(UserSerializer(users.order_by("username"), many=True).data)


class JSONAnalyzeUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = JSONUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file_obj = serializer.validated_data["file"]
        parsed = json.loads(file_obj.read().decode("utf-8"))
        return Response(analyze_json_payload(parsed))


class EventCSVReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, event_id):
        event = get_object_or_404(Event, id=event_id)
        summary = build_event_summary(event)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="event_{event_id}_report.csv"'
        writer = csv.writer(response)
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Event Name", summary["event"]["name"]])
        writer.writerow(["Status", summary["event"]["status"]])
        writer.writerow(["Location", summary["event"]["location"]])
        writer.writerow(["Attendance Population", summary["attendance_population"]])
        writer.writerow(["Approved Attendance Population", summary["approved_attendance_population"]])
        writer.writerow(["Committee Population", summary["committee_population"]])
        writer.writerow(["Average Rating", summary["avg_experience_rating"]])
        writer.writerow(["Accident Count", summary["accident_count"]])
        writer.writerow(["Total Expenditure", summary["event_expenditure_total"]])
        return response


class CreateAdminUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response(
                {"detail": "Only superadmin can create admin users."},
                status=status.HTTP_403_FORBIDDEN,
            )

        username = request.data.get("username")
        password = request.data.get("password")
        if not username or not password:
            return Response({"detail": "username and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        if UserModel.objects.filter(username=username).exists():
            return Response({"detail": "username already exists."}, status=status.HTTP_400_BAD_REQUEST)

        admin_user = UserModel.objects.create_user(
            username=username,
            password=password,
            email=request.data.get("email", ""),
            first_name=request.data.get("first_name", ""),
            last_name=request.data.get("last_name", ""),
            role=User.Role.ADMIN,
            age=request.data.get("age") or None,
            year=request.data.get("year", ""),
            course=request.data.get("course", ""),
            sex=request.data.get("sex", User.Sex.PREFER_NOT),
        )
        token, _ = Token.objects.get_or_create(user=admin_user)
        return Response({"token": token.key, "user": UserSerializer(admin_user).data}, status=status.HTTP_201_CREATED)
