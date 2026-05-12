from datetime import date, timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"

    class Sex(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        PREFER_NOT = "prefer_not", "Prefer not to say"
        OTHER = "other", "Other"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    age = models.PositiveIntegerField(null=True, blank=True)
    year = models.CharField(max_length=30, blank=True)
    course = models.CharField(max_length=120, blank=True)
    sex = models.CharField(max_length=20, choices=Sex.choices, default=Sex.PREFER_NOT)

    def __str__(self):
        return f"{self.username} ({self.role})"


class Event(models.Model):
    class Status(models.TextChoices):
        PREPARATION = "preparation", "Preparation"
        ACTIVE = "active", "Active"
        ENDED = "ended", "Ended"

    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=180, blank=True)
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PREPARATION)
    attendance_open = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_events")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    @property
    def duration(self) -> timedelta | None:
        if not self.start_time:
            return None
        end_time = self.end_time or timezone.now()
        return end_time - self.start_time


class EventCommitteeCode(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="committee_codes")
    code = models.CharField(max_length=32)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="issued_codes")
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        if not self.is_active:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True


class CommitteeMembership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="committee_memberships")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="committee_memberships")
    joined_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="committee_members_added",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "event")


class EventSelection(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="event_selections")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="selected_students")
    selected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("student", "event")


class Attendance(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="attendances")
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="attendances")
    image_proof = models.ImageField(upload_to="attendance_proofs/")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="attendance_reviews",
    )
    review_note = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("event", "student")


class CommitteeReport(models.Model):
    class ReportType(models.TextChoices):
        REQUEST = "request", "Request"
        UPDATE = "update", "Update"
        ISSUE = "issue", "Issue"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="committee_reports")
    committee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="committee_reports")
    title = models.CharField(max_length=180)
    content = models.TextField()
    report_type = models.CharField(max_length=20, choices=ReportType.choices, default=ReportType.UPDATE)
    admin_response = models.TextField(blank=True)
    responded_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="responded_reports",
    )
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)


class AdminBroadcast(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="broadcasts")
    admin = models.ForeignKey(User, on_delete=models.CASCADE, related_name="broadcasts_sent")
    target_committee = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="broadcasts_received",
    )
    title = models.CharField(max_length=180)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class AccidentReport(models.Model):
    class AccidentType(models.TextChoices):
        INJURY = "injury", "Injury"
        MEDICAL = "medical", "Medical"
        PROPERTY = "property", "Property Damage"
        SECURITY = "security", "Security"
        OTHER = "other", "Other"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="accident_reports")
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="accident_reports")
    accident_type = models.CharField(max_length=20, choices=AccidentType.choices)
    description = models.TextField(blank=True)
    accident_time = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)


class ExperienceRating(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="ratings")
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ratings")
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("event", "student")


class Expenditure(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="expenditures")
    description = models.CharField(max_length=180)
    quantity = models.PositiveIntegerField(default=1)
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    spent_on = models.DateField(default=date.today)
    added_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="expenditures_added")
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.amount = self.quantity * self.price_per_unit
        super().save(*args, **kwargs)
