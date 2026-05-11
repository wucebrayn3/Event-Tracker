from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

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


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Profile",
            {"fields": ("role", "age", "year", "course", "sex")},
        ),
    )


admin.site.register(Event)
admin.site.register(EventCommitteeCode)
admin.site.register(CommitteeMembership)
admin.site.register(EventSelection)
admin.site.register(Attendance)
admin.site.register(CommitteeReport)
admin.site.register(AdminBroadcast)
admin.site.register(AccidentReport)
admin.site.register(ExperienceRating)
admin.site.register(Expenditure)
