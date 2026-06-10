"""
backend/api/routes/fields.py
------------------------------
Paginated, filtered, sorted field list + single field detail.

GET /api/fields/{sid}?page=1&page_size=50&sort_by=wl_prob&sort_dir=desc
GET /api/fields/{sid}/{field_id}
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from api.routes.upload import require_session

router = APIRouter()


@router.get("/{sid}")
async def list_fields(
    sid:        str,
    page:       int           = Query(1,      ge=1),
    page_size:  int           = Query(50,     ge=1, le=500),
    sort_by:    str           = Query("wl_prob"),
    sort_dir:   str           = Query("desc"),
    zone:       Optional[str] = Query(None),
    crop_type:  Optional[str] = Query(None),
    severity:   Optional[str] = Query(None),
    search:     Optional[str] = Query(None),
):
    session = require_session(sid)
    fields: list[dict] = list(session["fields"])

    # Filter
    if zone:
        fields = [f for f in fields if str(f.get("zone","")).lower() == zone.lower()]
    if crop_type:
        fields = [f for f in fields if str(f.get("crop_type","")).lower() == crop_type.lower()]
    if severity:
        fields = [f for f in fields if str(f.get("wl_severity","")).lower() == severity.lower()]
    if search:
        q = search.lower()
        fields = [
            f for f in fields
            if q in str(f.get("field_id","")).lower()
            or q in str(f.get("zone","")).lower()
            or q in str(f.get("crop_type","")).lower()
        ]

    # Sort
    reverse = sort_dir == "desc"
    try:
        fields = sorted(fields, key=lambda f: f.get(sort_by) or 0, reverse=reverse)
    except TypeError:
        pass

    total = len(fields)
    start = (page - 1) * page_size
    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     (total + page_size - 1) // page_size,
        "fields":    fields[start: start + page_size],
    }


@router.get("/{sid}/{field_id}")
async def get_field(sid: str, field_id: str):
    session = require_session(sid)
    match = next(
        (f for f in session["fields"]
         if str(f.get("field_id","")).upper() == field_id.upper()),
        None,
    )
    if not match:
        raise HTTPException(404, f"Field '{field_id}' not found.")
    return match