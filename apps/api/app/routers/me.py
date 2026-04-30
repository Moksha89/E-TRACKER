from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/v1/me", tags=["me"])


@router.get("", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user
