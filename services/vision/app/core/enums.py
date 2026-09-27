"""Vision-domain enums, mirrored from web/prisma/schema.prisma.

Kept as plain strings (not a Python enum dependency on Prisma) so the service can describe its
own transitions without importing generated code. Values MUST stay in sync with the Prisma enums;
a mismatch is a bug, and B1's integration test asserts the lifecycle against the real schema.
"""


class VisionAnalysisRunStatus:
    """Mirrors Prisma enum VisionAnalysisRunStatus (schema.prisma:4080)."""

    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# Terminal statuses; a run in one of these is never advanced again.
TERMINAL_RUN_STATUSES = {
    VisionAnalysisRunStatus.COMPLETED,
    VisionAnalysisRunStatus.FAILED,
    VisionAnalysisRunStatus.CANCELLED,
}


class VideoIngestStatus:
    """Mirrors Prisma enum VideoIngestStatus (schema.prisma:4481).

    The app enum has no "UPLOADED" value; the analysis-ready state is READY_FOR_ANALYSIS, which is
    what the worker queue polls for (the brief's "status UPLOADED" maps here).
    """

    REGISTERED = "REGISTERED"
    PROBING = "PROBING"
    PROBE_FAILED = "PROBE_FAILED"
    PROXY_GENERATING = "PROXY_GENERATING"
    PROXY_FAILED = "PROXY_FAILED"
    READY_FOR_ALIGNMENT = "READY_FOR_ALIGNMENT"
    READY_FOR_ANALYSIS = "READY_FOR_ANALYSIS"


class VisionObservationStatus:
    """Mirrors Prisma enum VisionObservationStatus (schema.prisma:4103)."""

    PENDING = "PENDING"
    MATCHED = "MATCHED"
    REJECTED = "REJECTED"
    CONFIRMED = "CONFIRMED"
    AMBIGUOUS = "AMBIGUOUS"
