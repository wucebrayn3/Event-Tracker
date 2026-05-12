import json

from django.contrib.auth import authenticate
from rest_framework import serializers

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


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "age", "year", "course", "sex"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "age",
            "year",
            "course",
            "sex",
        ]

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data, role=User.Role.STUDENT)
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs["username"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid username or password.")
        attrs["user"] = user
        return attrs


class EventSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    committee_count = serializers.IntegerField(read_only=True)
    attendance_count = serializers.IntegerField(read_only=True)
    approved_attendance_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "name",
            "description",
            "location",
            "start_time",
            "end_time",
            "status",
            "attendance_open",
            "created_by",
            "created_at",
            "updated_at",
            "committee_count",
            "attendance_count",
            "approved_attendance_count",
        ]


class EventCommitteeCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventCommitteeCode
        fields = ["id", "event", "code", "expires_at", "is_active", "created_at"]
        read_only_fields = ["id", "event", "is_active", "created_at"]


class CommitteeMembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), source="user", write_only=True)

    class Meta:
        model = CommitteeMembership
        fields = ["id", "event", "user", "user_id", "joined_at", "is_active"]
        read_only_fields = ["id", "joined_at", "event"]


class EventSelectionSerializer(serializers.ModelSerializer):
    student = UserSerializer(read_only=True)

    class Meta:
        model = EventSelection
        fields = ["id", "event", "student", "selected_at"]
        read_only_fields = ["id", "student", "selected_at"]


class AttendanceSerializer(serializers.ModelSerializer):
    student = UserSerializer(read_only=True)

    class Meta:
        model = Attendance
        fields = [
            "id",
            "event",
            "student",
            "image_proof",
            "status",
            "reviewed_by",
            "review_note",
            "submitted_at",
            "reviewed_at",
        ]
        read_only_fields = ["id", "student", "status", "reviewed_by", "submitted_at", "reviewed_at"]


class AttendanceReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Attendance.Status.APPROVED, Attendance.Status.REJECTED])
    review_note = serializers.CharField(required=False, allow_blank=True)


class CommitteeReportSerializer(serializers.ModelSerializer):
    committee = UserSerializer(read_only=True)

    class Meta:
        model = CommitteeReport
        fields = [
            "id",
            "event",
            "committee",
            "title",
            "content",
            "report_type",
            "admin_response",
            "is_resolved",
            "created_at",
            "responded_at",
        ]
        read_only_fields = ["id", "committee", "admin_response", "is_resolved", "created_at", "responded_at"]


class CommitteeReportRespondSerializer(serializers.Serializer):
    admin_response = serializers.CharField()
    is_resolved = serializers.BooleanField(default=True)


class AdminBroadcastSerializer(serializers.ModelSerializer):
    admin = UserSerializer(read_only=True)

    class Meta:
        model = AdminBroadcast
        fields = ["id", "event", "admin", "target_committee", "title", "message", "created_at"]
        read_only_fields = ["id", "admin", "created_at"]


class AccidentReportSerializer(serializers.ModelSerializer):
    reporter = UserSerializer(read_only=True)

    class Meta:
        model = AccidentReport
        fields = ["id", "event", "reporter", "accident_type", "description", "accident_time", "created_at"]
        read_only_fields = ["id", "reporter", "created_at"]


class ExperienceRatingSerializer(serializers.ModelSerializer):
    student = UserSerializer(read_only=True)

    class Meta:
        model = ExperienceRating
        fields = ["id", "event", "student", "rating", "comment", "created_at", "updated_at"]
        read_only_fields = ["id", "student", "created_at", "updated_at"]

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value


class ExpenditureSerializer(serializers.ModelSerializer):
    added_by = UserSerializer(read_only=True)

    class Meta:
        model = Expenditure
        fields = ["id", "event", "description", "quantity", "price_per_unit", "amount", "spent_on", "added_by", "created_at"]
        read_only_fields = ["id", "added_by", "created_at", "amount"]


class CommitteeJoinSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)


class AttendanceToggleSerializer(serializers.Serializer):
    attendance_open = serializers.BooleanField()


class JSONUploadSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value):
        try:
            content = value.read().decode("utf-8")
            parsed = json.loads(content)
        except Exception as exc:  # noqa: BLE001
            raise serializers.ValidationError(f"Invalid JSON file: {exc}") from exc
        finally:
            value.seek(0)
        if not isinstance(parsed, (list, dict)):
            raise serializers.ValidationError("JSON payload must be a list or an object.")
        return value
