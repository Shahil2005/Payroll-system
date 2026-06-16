from sqlalchemy.orm import DeclarativeBase


# Modern approach (SQLAlchemy 2.0+)
class Base(DeclarativeBase):
    pass


# Register the models for Migration
from . import (
    company,  # noqa: F401
    employee,  # noqa: F401
    payroll,  # noqa: F401
    user,  # noqa: F401
)
