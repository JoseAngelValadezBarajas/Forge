"""Application-level error types independent of transport concerns."""


class ServiceError(Exception):
    pass


class EntityNotFound(ServiceError):
    pass


class DuplicateName(ServiceError):
    pass


class InvalidInput(ServiceError):
    pass


class RevisionConflict(ServiceError):
    pass
