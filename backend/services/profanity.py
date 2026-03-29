"""Simple nickname profanity filter for kiosk mode."""

from __future__ import annotations

import re

# Words blocked as an exact full-nickname match (case-insensitive)
_BLOCKED_EXACT: set[str] = {
    "ass", "asshole", "bastard", "bitch", "bollocks", "cock", "crap", "cunt",
    "damn", "dick", "dildo", "douche", "fag", "faggot", "fuck", "goddamn",
    "homo", "jerk", "kike", "nazi", "nigga", "nigger",
    "penis", "piss", "pussy", "retard", "shit", "slut", "tits", "twat",
    "vagina", "whore", "wanker",
}

# Substrings so offensive they should never appear anywhere in a nickname
_BLOCKED_SUBSTRINGS: tuple[str, ...] = (
    "fuck", "shit", "cunt", "nigg", "fagg",
)

# Compiled regex: matches any blocked substring (case-insensitive)
_SUBSTRING_RE = re.compile("|".join(re.escape(s) for s in _BLOCKED_SUBSTRINGS), re.IGNORECASE)


def is_nickname_clean(nickname: str) -> bool:
    """Return True if the nickname passes the profanity filter."""
    stripped = nickname.strip().lower()

    # Exact match
    if stripped in _BLOCKED_EXACT:
        return False

    # Substring match for the most offensive terms
    if _SUBSTRING_RE.search(stripped):
        return False

    return True
