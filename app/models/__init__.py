from sqlalchemy.orm import DeclarativeBase


# Modern approach (SQLAlchemy 2.0+)
class Base(DeclarativeBase):
    pass


# Register the models for Migration
from . import company  # noqa: E402, F401
from . import user  # noqa: E402, F401
from . import employee  # noqa: E402, F401
from . import payroll  # noqa: E402, F401
