"""
backend/utils/merger.py
────────────────────────
Merges field boundary, soil lab, and drone spectral files by field_id.
"""

import logging

logger = logging.getLogger(__name__)

def merge_file_map(file_map: dict[str, list[dict]], terrain_features: dict | None = None) -> list[dict]:
    """
    Merges different file types (field_master, drone, soil, weather) by field_id.
    Broadcasts terrain_features to all merged field rows.
    """
    merged_dict = {}

    # 1. Start with field master boundaries
    field_masters = file_map.get("field_master", [])
    for row in field_masters:
        fid = str(row.get("field_id", "")).strip()
        if fid:
            merged_dict[fid] = dict(row)

    # 2. Gather field_ids from other files if they are not in field_master
    for ftype in ["drone", "soil", "weather"]:
        for row in file_map.get(ftype, []):
            fid = str(row.get("field_id", "")).strip()
            if fid and fid not in merged_dict:
                merged_dict[fid] = {"field_id": fid}

    # 3. Merge columns from drone, soil, and weather
    for ftype, rows in file_map.items():
        if ftype == "field_master":
            continue
        for row in rows:
            fid = str(row.get("field_id", "")).strip()
            if fid:
                for k, v in row.items():
                    if v is not None:
                        merged_dict[fid][k] = v

    merged_list = list(merged_dict.values())

    # 4. Fallback to a single farm-level record if no field rows exist but we have terrain data
    if not merged_list and terrain_features:
        merged_list = [{
            "field_id": "FARM_LEVEL",
            "zone": "All Zones",
            "area_ha": 1.0,
            "crop_type": "Unspecified"
        }]

    # 5. Broadcast terrain metrics to every row
    if terrain_features:
        for row in merged_list:
            for k, v in terrain_features.items():
                if k not in row or row[k] is None:
                    row[k] = v

    return merged_list
