from enum import Enum

# ----- Default App Setup -----
LOG_PATH = "data/logs"


# ----- Payroll Statuses -----
class PayrollCycleStatus(str, Enum):
    DRAFT = "DRAFT"
    PROCESSING = "PROCESSING"
    APPROVED = "APPROVED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class PayslipStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
