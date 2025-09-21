# backend/main.py
import os
import uuid
import json
import re
import requests
import logging
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

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

# Soft local budgets (so we can proactively switch)
GROQ_RPM = int(os.getenv("GROQ_RPM", "30"))        # requests per minute
GROQ_RPD = int(os.getenv("GROQ_RPD", "1000"))      # requests per day
GROQ_TPM = int(os.getenv("GROQ_TPM", "12000"))     # tokens per minute (in+out)
GROQ_TPD = int(os.getenv("GROQ_TPD", "100000"))    # tokens per day (in+out)

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Check backend/.env.")

FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",                         # primary (kept first)
    "meta-llama/llama-4-scout-17b-16e-instruct",       # strong instruction-following
    "gemma2-9b-it",                                    # reliable JSON
    "llama-3.1-8b-instant",                            # fast/cheap
    "deepseek-r1-distill-llama-70b",                   # powerful; emits <think>
    # "openai/gpt-oss-20b",                            # optional extra backup
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
- Do NOT focus on just one topic inside the learning material, broaden the range and make sure each topic is used.
- Make questions clear and informative, about 10-15 words (avoid telegraphic phrasing).
- MCQ choices must be *informative statements*, each 4-7 words, mutually exclusive and plausible.
- NEVER use generic choices like "All of the above", "None of the above", or "Both A and B".
- The MCQ "answer" must be the full text of the correct choice (not a letter).
- Short-answer "answer" should be 1–2 sentences (5-10 words), specific and faithful to the material.
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

# ---------- Simple in-memory rate limiter ----------
class RateLimiter:
    """
    Tracks per-minute and per-day budgets for requests and tokens.
    Not perfect (process memory only), but good enough to proactively avoid 429s.
    """
    def __init__(self, rpm:int, rpd:int, tpm:int, tpd:int):
        self.rpm_limit = rpm
        self.rpd_limit = rpd
        self.tpm_limit = tpm
        self.tpd_limit = tpd

        self._minute_epoch = self._now_minute()
        self._day_epoch = self._now_day()

        self.rpm_used = 0
        self.tpm_used = 0
        self.rpd_used = 0
        self.tpd_used = 0

    def _now_minute(self) -> int:
        return int(time.time() // 60)

    def _now_day(self) -> int:
        # days since epoch
        return int(time.time() // 86400)

    def _maybe_roll_windows(self):
        cur_min = self._now_minute()
        if cur_min != self._minute_epoch:
            self._minute_epoch = cur_min
            self.rpm_used = 0
            self.tpm_used = 0
        cur_day = self._now_day()
        if cur_day != self._day_epoch:
            self._day_epoch = cur_day
            self.rpd_used = 0
            self.tpd_used = 0

    def can_afford(self, req_tokens_est:int = 0) -> Tuple[bool, str]:
        """
        Returns (ok, reason_if_not_ok)
        """
        self._maybe_roll_windows()
        if self.rpm_used + 1 > self.rpm_limit:
            return False, "rpm_exhausted"
        if self.rpd_used + 1 > self.rpd_limit:
            return False, "rpd_exhausted"
        if self.tpm_used + req_tokens_est > self.tpm_limit:
            return False, "tpm_exhausted"
        if self.tpd_used + req_tokens_est > self.tpd_limit:
            return False, "tpd_exhausted"
        return True, ""

    def reserve(self, req_tokens_est:int = 0):
        self._maybe_roll_windows()
        self.rpm_used += 1
        self.rpd_used += 1
        # Reserve estimated tokens up front (conservative), then adjust after response
        self.tpm_used += req_tokens_est
        self.tpd_used += req_tokens_est

    def adjust_after_response(self, est_reserved:int, actual_total_tokens:int):
        """
        Adjust token counters to the actual usage.
        """
        self._maybe_roll_windows()
        delta = actual_total_tokens - est_reserved
        self.tpm_used += max(0, delta)
        self.tpd_used += max(0, delta)

limiter = RateLimiter(GROQ_RPM, GROQ_RPD, GROQ_TPM, GROQ_TPD)

def _estimate_tokens_for_request(prompt:str, max_tokens:int) -> int:
    # very rough: ~4 chars per token
    in_tokens = max(1, len(prompt) // 4)
    # pessimistic: assume we might use up to 70% of max_tokens
    out_tokens = max(1, int(max_tokens * 0.7))
    return in_tokens + out_tokens

def _parse_usage_total_tokens(resp_json: Dict[str, Any]) -> Optional[int]:
    # OpenAI-style usage object. Groq generally returns this too.
    try:
        usage = resp_json.get("usage") or {}
        total = usage.get("total_tokens")
        if isinstance(total, int) and total > 0:
            return total
    except Exception:
        pass
    return None

def _model_list_preference() -> List[str]:
    # Ensure the primary model is first, then the rest (without duplicates)
    ordered = []
    seen = set()
    for m in [GROQ_MODEL] + FALLBACK_MODELS:
        if m not in seen:
            ordered.append(m)
            seen.add(m)
    return ordered

def choose_model(prompt: str, max_tokens: int) -> str:
    """
    Pick the first model we can afford under our local budgets.
    If the primary would exceed RPM/TPM/RPD/TPD, try fallbacks.
    """
    est = _estimate_tokens_for_request(prompt, max_tokens)
    for model in _model_list_preference():
        ok, reason = limiter.can_afford(est)
        if ok:
            return model
        # If we can't afford with this estimate, try next model (same budgets, but we still switch
        # so we can distribute load and maybe different responses are shorter).
        # (If we want per-model budgets later, we can extend this.)
        log.warning("Local budget near/over limit (%s); trying fallback model.", reason)
    # If nothing affordable, just return primary; the server may 429 and we'll handle it.
    return GROQ_MODEL

def call_groq(prompt: str) -> str:
    """
    Calls Groq with proactive local budgeting, failover on 429/503, and
    fallbacks for decommissioned/not-found models (400/404).
    """
    max_tokens = GROQ_MAX_TOKENS
    estimate = _estimate_tokens_for_request(prompt, max_tokens)

    # candidates to try in order (respecting budgets)
    models_to_try = []
    tried = set()
    # first pick an affordable one
    first = choose_model(prompt, max_tokens)
    models_to_try.append(first)
    tried.add(first)
    # then other fallbacks
    for m in _model_list_preference():
        if m not in tried:
            models_to_try.append(m)
            tried.add(m)

    def parse_err(resp):
        try:
            return resp.json()
        except Exception:
            return {"error": resp.text}

    backoffs = [0.4, 0.8]  # quick retries on 429/503

    last_error = None

    for model in models_to_try:
        # Reserve locally (to avoid stampeding). We’ll adjust after the response.
        can, reason = limiter.can_afford(estimate)
        if not can:
            log.warning("Skipping %s due to local budgets: %s", model, reason)
            continue

        limiter.reserve(estimate)
        log.info("Calling Groq model=%s (reserved est=%d tokens)", model, estimate)
        r = _post_to_groq(model, prompt, max_tokens=max_tokens)
        if r.status_code == 200:
            j = r.json()
            used = _parse_usage_total_tokens(j) or estimate  # adjust if we have real usage
            limiter.adjust_after_response(estimate, used)
            out = j["choices"][0]["message"]["content"]
            log.info("Groq OK model=%s tokens_used=%s", model, used)
            return out

        # Not 200 -> inspect
        err = parse_err(r)
        last_error = (r.status_code, err)
        log.error("[GROQ ERROR] model=%s %s %s", model, r.status_code, err)

        code = str(err.get("error", {}).get("code", "")).lower()
        msg  = str(err.get("error", {}).get("message", "")).lower()

        # CASE A: model gone / wrong -> try next model immediately
        if r.status_code in (400, 404) and (
            "model_decommissioned" in code
            or "model_not_found" in code
            or "decommissioned" in msg
        ):
            log.warning("Model %s not available; trying next fallback.", model)
            continue

        # CASE B: rate/quota/transient -> try quick retries, then next model
        if r.status_code in (429, 503) or any(k in (code + " " + msg) for k in ["rate", "quota", "tpm", "tpd", "rpm", "rpd"]):
            for b in backoffs:
                log.warning("Transient %s; retrying model=%s after %.1fs", r.status_code, model, b)
                time.sleep(b)
                r2 = _post_to_groq(model, prompt, max_tokens=max_tokens)
                if r2.status_code == 200:
                    j2 = r2.json()
                    used2 = _parse_usage_total_tokens(j2) or estimate
                    limiter.adjust_after_response(estimate, used2)
                    out2 = j2["choices"][0]["message"]["content"]
                    log.info("Groq OK (retry) model=%s tokens_used=%s", model, used2)
                    return out2
                else:
                    err2 = parse_err(r2)
                    log.error("[GROQ RETRY ERROR] model=%s %s %s", model, r2.status_code, err2)
            # move to next model
            log.warning("Switching model after rate/quota/transient issue.")
            continue

        # Other error: try next model; if none succeed we’ll surface last error
        log.warning("Unhandled error for model=%s; trying next model.", model)

    # If we get here, all attempts failed
    status, err = last_error if last_error else (500, {"error": "Unknown Groq failure"})
    raise RuntimeError(f"Groq {status}: {err}")

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