"""
backend/api/routes/analysis.py
--------------------------------
Natural language question answering.

POST /api/analysis/ask   { session_id, question }
GET  /api/analysis/summary/{sid}
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from engine.question_engine import answer_question
from api.routes.upload import require_session

logger = logging.getLogger(__name__)
router = APIRouter()


class AskIn(BaseModel):
    session_id: str
    question:   str


class AskOut(BaseModel):
    answer:     str
    question:   str
    session_id: str


@router.post("/ask", response_model=AskOut)
async def ask(body: AskIn):
    """
    Ask any natural language question about your farm data.

    Examples:
      "Which fields are at highest waterlogging risk?"
      "Give me a full farm report"
      "What is the yield forecast for Northwest zone?"
      "Tell me about field F012"
      "Priority action list for this week"
    """
    if not body.question.strip():
        raise HTTPException(400, "Question cannot be empty.")

    session = require_session(body.session_id)
    try:
        ans = answer_question(body.question, session["fields"], session["stats"])
    except Exception as e:
        logger.exception("Question engine error: %s", e)
        raise HTTPException(500, f"Analysis error: {e}")

    return AskOut(answer=ans, question=body.question, session_id=body.session_id)


@router.get("/summary/{sid}")
async def summary(sid: str):
    """Returns farm stats + weather summary for the dashboard Overview tab."""
    session = require_session(sid)
    return {
        "stats":   session["stats"],
        "weather": session.get("weather", {}),
        "files":   session.get("files",   []),
    }