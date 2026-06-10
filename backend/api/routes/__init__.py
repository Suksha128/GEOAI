"""
backend/api/routes/__init__.py
──────────────────────────────
Exposes routers as submodules, aliasing field.py to fields.
"""

from . import health
from . import upload
from . import weather
from . import analysis
from . import field as fields
