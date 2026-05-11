from rest_framework.permissions import BasePermission

from .models import CommitteeMembership, User


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.role == User.Role.ADMIN))


class IsStudentRole(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == User.Role.STUDENT)


class IsStaffCommitteeRole(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.role in [User.Role.STAFF, User.Role.ADMIN] or user.is_superuser)
        )


def user_is_committee(user, event):
    return CommitteeMembership.objects.filter(user=user, event=event, is_active=True).exists()


class IsAdminOrCommitteeForEvent(BasePermission):
    """
    Expects event id in URL as `event_id` or `pk`.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == User.Role.ADMIN:
            return True
        event_id = view.kwargs.get("event_id") or view.kwargs.get("pk")
        if event_id is None:
            return False
        return CommitteeMembership.objects.filter(
            user=user,
            event_id=event_id,
            is_active=True,
        ).exists()
