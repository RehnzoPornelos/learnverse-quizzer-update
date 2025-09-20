# backend/main.py
import os
import uuid
import json
import re
import requests
import logging
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
from utils import extract_text_from_file

# --- Socket.IO (minimal) ---
import socketio

# Load .env early (before creating any clients)
load_dotenv()

# ---- Groq ----
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "4096"))

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Check backend/.env.")

FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]

# ---- Supabase (server) ----
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Supabase env missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env")

# Option A: supabase-py v2
from supabase import create_client, Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Example helper
def db_health():
    # light call just to verify creds/URL
    return supabase.table("pg_stat_activity").select("datname").limit(1).execute()

# ---------- App / CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("learnverse-backend")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    try:
        response = await call_next(request)
        log.info("%s %s -> %s", request.method, request.url.path, response.status_code)
        return response
    except Exception as e:
        log.exception("ERROR %s %s: %s", request.method, request.url.path, e)
        raise

# Explicit OPTIONS handler
@app.options("/generate-quiz")
async def options_generate_quiz():
    return JSONResponse(status_code=204, content=None)

# ---------- Socket.IO ----------
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

room_participants: Dict[str, List[Dict[str, Any]]] = {}

@sio.event
async def student_join(sid, data):
    data = data or {}
    room_code = data.get("room")
    name = data.get("name") or "Student"
    student_id = data.get("student_id")
    if not room_code:
        return
    await sio.save_session(sid, {"role": "student", "room": room_code, "student_id": student_id, "name": name})
    await sio.enter_room(sid, room_code)
    participants = room_participants.setdefault(room_code, [])
    if not any(p["sid"] == sid for p in participants):
        participants.append({"sid": sid, "name": name, "student_id": student_id})
    await sio.emit(
        "server:student-joined",
        {"name": name, "student_id": student_id, "participants": [p["name"] for p in participants]},
        room=room_code,
    )

@sio.event
async def host_open_quiz(sid, data):
    data = data or {}
    room_code = data.get("room")
    title = data.get("title")
    quiz_id = data.get("quiz_id")
    if not room_code:
        return
    await sio.save_session(sid, {"role": "host", "room": room_code, "quiz_id": quiz_id, "title": title})
    await sio.enter_room(sid, room_code)
    room_participants.setdefault(room_code, [])
    await sio.emit(
        "server:quiz-opened",
        {
            "room": room_code,
            "quiz_id": quiz_id,
            "title": title,
            "participants": [p["name"] for p in room_participants[room_code]],
        },
        to=sid,
    )

@sio.event
async def host_start(sid, data):
    room_code = (data or {}).get("room")
    if room_code:
        await sio.emit("server:quiz-start", data, room=room_code)

@sio.event
async def host_end(sid, data):
    room_code = (data or {}).get("room")
    if room_code:
        await sio.emit("server:quiz-end", data, room=room_code)

@sio.event
async def student_answer(sid, data):
    room_code = (data or {}).get("room")
    if not room_code:
        return
    session = await sio.get_session(sid)
    if session:
        data = data or {}
        data.setdefault("name", session.get("name"))
        data.setdefault("student_id", session.get("student_id"))
    await sio.emit("server:answer-received", data, room=room_code)

@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    if not session:
        return
    room_code = session.get("room")
    role = session.get("role")
    name = session.get("name")
    if room_code and room_code in room_participants:
        room_participants[room_code] = [p for p in room_participants[room_code] if p["sid"] != sid]
        await sio.emit(
            "server:client-left",
            {"sid": sid, "role": role, "name": name, "participants": [p["name"] for p in room_participants[room_code]]},
            room=room_code,
        )

# ---------- Quiz generation helpers ----------
def generate_prompt(text: str, mcq_count: int, sa_count: int, tf_count: int) -> str:
    """
    Richer wording for questions/answers; avoids one-word choices and 'All of the above'.
    """
    total = mcq_count + sa_count + tf_count
    return f"""
From the following learning material, generate a quiz with a total of {total} questions:

- {mcq_count} Multiple Choice Questions (exactly 4 choices and one correct).
- {sa_count} Short Answer Questions.
- {tf_count} True/False Questions.

WRITING REQUIREMENTS (important):
- Make questions clear and informative, about 12–25 words (avoid telegraphic phrasing).
- MCQ choices must be *informative statements*, each 8–16 words, mutually exclusive and plausible.
- NEVER use generic choices like "All of the above", "None of the above", or "Both A and B".
- The MCQ "answer" must be the full text of the correct choice (not a letter).
- Short-answer "answer" should be 1–2 sentences (12–35 words), specific and faithful to the material.
- True/False "answer" should be the JSON boolean true or false.
- Everything must be grounded in the supplied material; avoid hallucinations.

Return ONLY a JSON array in this exact schema (no explanations, no code fences):

[
  {{
    "type": "mcq",
    "question": "…",
    "choices": ["…", "…", "…", "…"],
    "answer": "…"   // must exactly match one of the choices
  }},
  {{
    "type": "short_answer",
    "question": "…",
    "answer": "…"   // 1–2 sentences
  }},
  {{
    "type": "true_false",
    "question": "…",
    "answer": true  // or false
  }}
]

Learning Material:
\"\"\"
{text}
\"\"\"
""".strip()

def truncate_text(text: str, max_chars: int = 20000) -> str:
    return text[:max_chars]

# ---- Groq helpers ----
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TIMEOUT_S = 75  # a bit higher to avoid slow-network timeouts

def _post_to_groq(model: str, prompt: str, max_tokens: int = GROQ_MAX_TOKENS) -> requests.Response:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        # slightly higher temperature for richer wording, still stable
        "temperature": 0.45,
        "max_tokens": max_tokens,
        "stop": ["```", "<think>"],
    }
    return requests.post(GROQ_ENDPOINT, headers=headers, json=data, timeout=GROQ_TIMEOUT_S)

def call_groq(prompt: str) -> str:
    r = _post_to_groq(GROQ_MODEL, prompt)
    if r.status_code == 200:
        j = r.json()
        return j["choices"][0]["message"]["content"]

    # log error body for visibility
    try:
        err = r.json()
    except Exception:
        err = {"error": r.text}
    log.error("[GROQ ERROR] %s %s", r.status_code, err)

    code = str(err.get("error", {}).get("code", "")).lower()
    msg = str(err.get("error", {}).get("message", "")).lower()

    # try fallbacks for decommissioned / not found models
    if r.status_code in (400, 404) and (
        "model_decommissioned" in code
        or "model_not_found" in code
        or "decommissioned" in msg
    ):
        for alt in FALLBACK_MODELS:
            if alt == GROQ_MODEL:
                continue
            r2 = _post_to_groq(alt, prompt)
            if r2.status_code == 200:
                j2 = r2.json()
                return j2["choices"][0]["message"]["content"]
            else:
                try:
                    err2 = r2.json()
                except Exception:
                    err2 = {"error": r2.text}
                log.error("[GROQ FALLBACK ERROR] %s %s", r2.status_code, err2)

    raise RuntimeError(f"Groq {r.status_code}: {err}")

# Output sanitization and parsing
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE_RE = re.compile(r"```(?:json)?(.*?)```", re.DOTALL | re.IGNORECASE)

def _clean_model_output(text: str) -> str:
    text = _THINK_RE.sub("", text).strip()
    m = _FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()
    return text.replace("\ufeff", "").strip("` \n\r\t")

def extract_json_array(text: str):
    text = _clean_model_output(text)
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No valid JSON array found in output.")
    json_str = text[start : end + 1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON array: {e}")

# ---------- Routes ----------
@app.get("/health")
def health():
    return {"ok": True}

# Support both with and without trailing slash
@app.post("/generate-quiz")
@app.post("/generate-quiz/", include_in_schema=False)
async def generate_quiz(
    file: UploadFile = File(...),
    mcq_count: int = Form(3),
    sa_count: int = Form(3),
    tf_count: int = Form(4),
):
    # Save temp upload
    suffix = Path(file.filename).suffix or ".pdf"
    temp_path = Path(f"temp_{uuid.uuid4()}{suffix}")
    with temp_path.open("wb") as f:
        f.write(await file.read())

    try:
        # Extract & prepare prompt
        text = extract_text_from_file(str(temp_path))
        safe_text = truncate_text(text)
        prompt = generate_prompt(safe_text, mcq_count, sa_count, tf_count)

        # Call Groq
        try:
            raw_output = call_groq(prompt)
        except Exception as e:
            log.error("Groq call failed: %s", e)
            return JSONResponse(content={"error": f"{e}"}, status_code=502)

        if len(text) > 12000:
            log.warning("Text was truncated to fit model limits.")

        # Parse JSON
        try:
            quiz_data = extract_json_array(raw_output)
        except Exception as e:
            log.error("JSON parsing failed: %s\nRaw output:\n%s", e, raw_output)
            return JSONResponse(content={"error": "Failed to parse JSON from model output."}, status_code=500)

        return JSONResponse(content=quiz_data)

    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass