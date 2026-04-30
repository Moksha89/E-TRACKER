import phonenumbers


def normalize_phone(raw: str, default_region: str = "IN") -> str:
    """Parse and return the phone in E.164 form. Raises ValueError on invalid input."""
    try:
        parsed = phonenumbers.parse(raw, default_region)
    except phonenumbers.NumberParseException as exc:
        raise ValueError(f"invalid phone: {exc}") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise ValueError("invalid phone")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
