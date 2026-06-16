from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from app.models.payroll import SalaryStructure


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    username: Mapped[str] = mapped_column(index=True, unique=True)
    slug: Mapped[str] = mapped_column(index=True, unique=True)
    email: Mapped[str] = mapped_column(index=True, unique=True)
    first_name: Mapped[str]
    last_name: Mapped[str]
    password: Mapped[str]

    salary_structures: Mapped[list["SalaryStructure"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )

