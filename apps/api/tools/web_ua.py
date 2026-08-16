"""Shared User-Agent strings. Wikimedia and Nominatim both reject requests
without a descriptive UA (403) — see:
https://meta.wikimedia.org/wiki/User-Agent_policy
https://operations.osmfoundation.org/policies/nominatim/
"""
CONTACT = "samuelshine112003@gmail.com"
WIKIMEDIA_UA = f"NewsroomJournalismAssistant/0.1 (educational demo; contact: {CONTACT})"
NOMINATIM_UA = f"NewsroomJournalismAssistant/0.1 (educational demo; contact: {CONTACT})"
GENERIC_UA = "NewsroomJournalismAssistant/0.1 (+educational demo)"
