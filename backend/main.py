# backend/main.py
import os
import uuid
import json
import re
import requests
import logging
import time
import difflib
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body

from dotenv import load_dotenv
from utils import extract_text_from_file

# --- Socket.IO (minimal) ---
import socketio

# Load .env early (before creating any clients)
load_dotenv()

# ---- Groq ----
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# You set this default; fallbacks are below.
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "6000"))

# Soft local budgets (so we can proactively switch)
GROQ_RPM = int(os.getenv("GROQ_RPM", "30"))        # requests per minute
GROQ_RPD = int(os.getenv("GROQ_RPD", "1000"))      # requests per day
GROQ_TPM = int(os.getenv("GROQ_TPM", "12000"))     # tokens per minute (in+out)
GROQ_TPD = int(os.getenv("GROQ_TPD", "100000"))    # tokens per day (in+out)

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Check backend/.env.")

FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",                         # strong generalist
    "meta-llama/llama-4-scout-17b-16e-instruct",       # instruction-following
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

from supabase import create_client, Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def db_health():
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
def generate_prompt(
    text: str, 
    mcq_count: int, 
    sa_count: int, 
    tf_count: int, 
    idf_count: int, 
    ess_count: int,
    difficulty: str
) -> str:
    total = mcq_count + sa_count + tf_count + idf_count + ess_count
    
    # Difficulty instructions
    diff_instructions = {
        "Easy": "Questions should be straightforward, testing basic recall and understanding. Use simple language.",
        "Intermediate": "Questions should require moderate understanding and application of concepts.",
        "Difficult": "Questions should be challenging, requiring deep analysis, critical thinking, and synthesis of multiple concepts."
    }
    diff_guide = diff_instructions.get(difficulty, diff_instructions["Intermediate"])
    
    return f"""
You are generating a quiz STRICTLY from the supplied learning material.

DIFFICULTY LEVEL: {difficulty}
{diff_guide}

Return ONLY a JSON ARRAY (no code fences, no keys outside the array, no comments), with EXACTLY {total} items:
- First, {mcq_count} objects with "type":"mcq"
- Then, {sa_count} objects with "type":"short_answer"
- Then, {tf_count} objects with "type":"true_false"
- Then, {idf_count} objects with "type":"identification"
- Then, {ess_count} objects with "type":"essay"

Schema per item:
- type: "mcq" | "short_answer" | "true_false" | "identification" | "essay"
- question: string (10–25 words, clear and grounded in the material)
- For "mcq": choices: array of EXACTLY 4 strings (each 3-5 words, mutually exclusive, no "All/None of the above"); answer: string that EXACTLY matches one of the 4 choices.
- For "short_answer": answer: string (1–2 sentences, 5–15 words)
- For "true_false": answer: boolean true or false (must be a JSON boolean, not a string)
- For "identification": answer: string (1–2 words, a specific term, name, concept, or phrase)
- For "essay": answer: string (2–4 sentences, 20–40 words, a comprehensive model answer)

Hard rules:
- Use ONLY information present in the provided material.
- Do NOT include any text before or after the JSON array.
- Do NOT include code fences like ``` or any <think> tags.
- Ensure EXACT counts. If you produce more than {total}, only the first {total} will be used; if fewer, your response will be rejected.
- Adjust question complexity according to the difficulty level: {difficulty}.

Learning Material:
\"\"\"{text}\"\"\"
""".strip()

def truncate_text(text: str, max_chars: int = 12000) -> str:
    return text[:max_chars] if len(text) > max_chars else text

# ---- Groq helpers ----
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TIMEOUT_S = 75

def _post_to_groq(model: str, prompt: str, max_tokens: int) -> requests.Response:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "top_p": 1.0,
        "max_tokens": max_tokens,
        "stop": ["```", "<think>", "</think>"],
    }
    return requests.post(GROQ_ENDPOINT, headers=headers, json=data, timeout=GROQ_TIMEOUT_S)

# ---------- Simple in-memory rate limiter + model cooldowns ----------
class RateLimiter:
    """
    Global soft budgets to avoid hammering the API.
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
        # Model cooldowns: model -> unix timestamp
        self.model_cooldown_until: Dict[str, float] = {}

    def _now_minute(self) -> int:
        return int(time.time() // 60)

    def _now_day(self) -> int:
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

    def is_model_on_cooldown(self, model: str) -> bool:
        until = self.model_cooldown_until.get(model, 0)
        return until and time.time() < until

    def set_cooldown(self, model: str, seconds: float):
        self.model_cooldown_until[model] = max(self.model_cooldown_until.get(model, 0), time.time() + seconds)

    def can_afford(self, req_tokens_est:int = 0) -> Tuple[bool, str]:
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
        self.tpm_used += req_tokens_est
        self.tpd_used += req_tokens_est

    def adjust_after_response(self, est_reserved:int, actual_total_tokens:int):
        """
        Adjust token counters to the actual usage; allow negative delta.
        """
        self._maybe_roll_windows()
        delta = actual_total_tokens - est_reserved
        # allow reducing the reservation if actual < estimate
        self.tpm_used = max(0, self.tpm_used + delta)
        self.tpd_used = max(0, self.tpd_used + delta)

limiter = RateLimiter(GROQ_RPM, GROQ_RPD, GROQ_TPM, GROQ_TPD)

def _estimate_tokens_for_request(prompt:str, out_tokens_cap:int) -> int:
    # ~4 chars/token; be less pessimistic (50% of cap) to reduce over-reserving
    in_tokens = max(1, len(prompt) // 4)
    out_tokens = max(1, int(out_tokens_cap * 0.5))
    return in_tokens + out_tokens

def _parse_usage_total_tokens(resp_json: Dict[str, Any]) -> Optional[int]:
    try:
        usage = resp_json.get("usage") or {}
        total = usage.get("total_tokens")
        if isinstance(total, int) and total > 0:
            return total
    except Exception:
        pass
    return None

def _model_list_preference() -> List[str]:
    ordered, seen = [], set()
    for m in [GROQ_MODEL] + FALLBACK_MODELS:
        if m not in seen:
            ordered.append(m); seen.add(m)
    return ordered

def choose_model(prompt: str, out_tokens_cap: int) -> Optional[str]:
    """
    Pick the first model we can afford and that's not on cooldown.
    """
    est = _estimate_tokens_for_request(prompt, out_tokens_cap)
    for model in _model_list_preference():
        if limiter.is_model_on_cooldown(model):
            log.warning("Model %s is on cooldown; skipping.", model)
            continue
        ok, reason = limiter.can_afford(est)
        if ok:
            return model
        log.warning("Local budget near/over limit (%s); trying fallback model.", reason)
    return None  # none affordable right now

# Provider error helpers
_QUOTA_HINTS = ("quota", "daily", "exceed", "exceeded", "limit", "insufficient", "tpm", "rpm", "tpd", "rpd", "rate")
def _looks_like_quota_or_rate(err_json: Dict[str, Any]) -> Tuple[bool, str]:
    msg = ""
    try:
        e = err_json.get("error") or {}
        msg = (e.get("message") or "") + " " + (e.get("code") or "")
        msg = msg.lower()
    except Exception:
        pass
    hit = any(k in msg for k in _QUOTA_HINTS)
    return hit, msg

def call_groq(prompt: str, max_tokens_override: Optional[int] = None) -> str:
    """
    Budget-aware call with optional small max_tokens for top-up.
    - Releases unused reservations (fixes false TPM exhaustion).
    - Skips models on cooldown and sets cooldowns on provider quota/rate errors.
    """
    out_cap = max_tokens_override if max_tokens_override is not None else GROQ_MAX_TOKENS
    estimate = _estimate_tokens_for_request(prompt, out_cap)

    models_to_try, tried = [], set()
    first = choose_model(prompt, out_cap)
    if first:
        models_to_try.append(first); tried.add(first)
    for m in _model_list_preference():
        if m not in tried:
            models_to_try.append(m); tried.add(m)

    if not models_to_try:
        # Nothing affordable now; surface a clear error
        raise RuntimeError("Local budgets exhausted; please retry shortly.")

    def parse_err(resp):
        try: return resp.json()
        except Exception: return {"error": {"message": resp.text, "code": str(resp.status_code)}}

    backoffs = [0.3, 0.6]
    last_error = None

    for model in models_to_try:
        if limiter.is_model_on_cooldown(model):
            log.warning("Model %s still on cooldown; skipping.", model)
            continue

        can, reason = limiter.can_afford(estimate)
        if not can:
            log.warning("Skipping %s due to local budgets: %s", model, reason)
            continue

        limiter.reserve(estimate)
        log.info("Calling Groq model=%s (reserved est=%d tokens)", model, estimate)
        r = _post_to_groq(model, prompt, max_tokens=out_cap)
        if r.status_code == 200:
            j = r.json()
            used = _parse_usage_total_tokens(j) or estimate
            limiter.adjust_after_response(estimate, used)
            out = j["choices"][0]["message"]["content"]
            log.info("Groq OK model=%s tokens_used=%s", model, used)
            return out

        # Not 200 -> inspect
        err = parse_err(r)
        last_error = (r.status_code, err)
        log.error("[GROQ ERROR] model=%s %s %s", model, r.status_code, err)

        # Always release reservation with a small usage (assume request tokens only) to avoid overhang
        limiter.adjust_after_response(estimate, actual_total_tokens=max(1, len(prompt)//4))

        code_lower = ""
        try:
            code_lower = str(err.get("error", {}).get("code", "")).lower()
        except Exception:
            pass
        msg_hit, msg_text = _looks_like_quota_or_rate(err)

        # If the provider hints quota/rate, cooldown this model so next attempts try fallbacks.
        if r.status_code in (429, 403) or msg_hit or any(k in code_lower for k in _QUOTA_HINTS):
            # TPM/RPM -> short cooldown; Daily quota -> longer cooldown
            if any(k in msg_text for k in ("tpm", "rpm", "rate")):
                limiter.set_cooldown(model, seconds=60)        # 1 minute
                log.warning("Cooldown set: %s for 60s due to rate/TPM.", model)
            elif any(k in msg_text for k in ("daily", "tpd", "rpd", "quota", "insufficient", "exceed", "exceeded", "limit")):
                limiter.set_cooldown(model, seconds=6*3600)    # 6 hours
                log.warning("Cooldown set: %s for 6h due to daily/quota.", model)
            # Try next model immediately
            continue

        # Transient 5xx -> quick retries with same model, then next
        if r.status_code in (500, 502, 503):
            for b in backoffs:
                log.warning("Transient %s; retrying model=%s after %.1fs", r.status_code, model, b)
                time.sleep(b)
                r2 = _post_to_groq(model, prompt, max_tokens=out_cap)
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
            log.warning("Switching model after transient issue.")
            continue

        # Other client errors: try next model
        log.warning("Unhandled error for model=%s; trying next model.", model)

    status, err = last_error if last_error else (500, {"error": "Unknown Groq failure"})
    raise RuntimeError(f"Groq {status}: {err}")

# -------- Output sanitization & parsing --------
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
    start = text.find("["); end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No valid JSON array found in output.")
    json_str = text[start : end + 1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON array: {e}")

# -------- Normalization, repair & validation --------
def _ascii_quotes(s: str) -> str:
    return s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")

def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", _ascii_quotes(s or "")).strip()

def _normalize_item(item: Dict[str, Any]) -> Dict[str, Any]:
    t = item.get("type")
    if "question" in item and isinstance(item["question"], str):
        item["question"] = _norm_text(item["question"])
    if t == "mcq":
        if isinstance(item.get("choices"), list):
            item["choices"] = [_norm_text(c) if isinstance(c, str) else c for c in item["choices"]]
        if isinstance(item.get("answer"), str):
            item["answer"] = _norm_text(item["answer"])
    elif t == "short_answer":
        if isinstance(item.get("answer"), str):
            item["answer"] = _norm_text(item["answer"])
    elif t == "true_false":
        ans = item.get("answer")
        if isinstance(ans, str):
            s = ans.strip().lower()
            if s == "true": item["answer"] = True
            elif s == "false": item["answer"] = False
    return item

def _normalize_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for it in items:
        if isinstance(it, dict):
            out.append(_normalize_item(it))
    return out

def _answers_match(ans: str, choices: List[str]) -> bool:
    a = _norm_text(ans)
    for c in choices:
        if _norm_text(c) == a:
            return True
    return False

def _repair_mcq(item: Dict[str, Any]) -> Dict[str, Any]:
    if item.get("type") != "mcq": return item
    choices = item.get("choices")
    ans = item.get("answer")
    if not isinstance(choices, list):
        return item
    # Trim >4 choices preserving the correct answer
    if len(choices) > 4:
        norm_ans = _norm_text(ans) if isinstance(ans, str) else ans
        new = []
        for c in choices:
            if isinstance(c, str) and _norm_text(c) == norm_ans:
                new.append(c); break
        for c in choices:
            if len(new) >= 4: break
            if c not in new and isinstance(c, str):
                new.append(c)
        item["choices"] = new[:4]
    # Fuzzy-map answer to closest choice if not exact
    if isinstance(item.get("answer"), str) and isinstance(item.get("choices"), list):
        if not _answers_match(item["answer"], item["choices"]):
            norm_ans = _norm_text(item["answer"])
            norm_choices = [_norm_text(c) for c in item["choices"] if isinstance(c, str)]
            if norm_choices:
                match = difflib.get_close_matches(norm_ans, norm_choices, n=1, cutoff=0.6)
                if match:
                    for c in item["choices"]:
                        if isinstance(c, str) and _norm_text(c) == match[0]:
                            item["answer"] = c
                            break
    return item

def _repair_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    fixed = []
    for it in items:
        if isinstance(it, dict) and it.get("type") == "mcq":
            fixed.append(_repair_mcq(it))
        else:
            fixed.append(it)
    return fixed

def _is_valid_mcq(item: Dict[str, Any]) -> bool:
    if item.get("type") != "mcq":
        return False
    q = item.get("question")
    choices = item.get("choices")
    ans = item.get("answer")
    if not isinstance(q, str) or not isinstance(choices, list) or len(choices) != 4 or not isinstance(ans, str):
        return False
    if any(not isinstance(c, str) or len(_norm_text(c)) < 3 for c in choices):
        return False
    if not _answers_match(ans, choices):
        return False
    return True

def _is_valid_short(item: Dict[str, Any]) -> bool:
    return (
        item.get("type") == "short_answer"
        and isinstance(item.get("question"), str)
        and isinstance(item.get("answer"), str)
        and len(_norm_text(item.get("answer"))) > 0
    )

def _is_valid_tf(item: Dict[str, Any]) -> bool:
    return (
        item.get("type") == "true_false"
        and isinstance(item.get("question"), str)
        and isinstance(item.get("answer"), bool)
    )
    
def _is_valid_identification(item: Dict[str, Any]) -> bool:
    return (
        item.get("type") == "identification"
        and isinstance(item.get("question"), str)
        and isinstance(item.get("answer"), str)
        and len(_norm_text(item.get("answer"))) > 0
    )

def _is_valid_essay(item: Dict[str, Any]) -> bool:
    return (
        item.get("type") == "essay"
        and isinstance(item.get("question"), str)
        and isinstance(item.get("answer"), str)
        and len(_norm_text(item.get("answer"))) > 0
    )

def _filter_and_partition(items: List[Dict[str, Any]]):
    items = _normalize_items(items)
    items = _repair_items(items)
    mcq, sa, tf, idf, ess = [], [], [], [], []
    for it in items:
        try:
            t = it.get("type")
            if t == "mcq" and _is_valid_mcq(it):
                mcq.append(it)
            elif t == "short_answer" and _is_valid_short(it):
                sa.append(it)
            elif t == "true_false" and _is_valid_tf(it):
                tf.append(it)
            elif t == "identification" and _is_valid_identification(it):
                idf.append(it)
            elif t == "essay" and _is_valid_essay(it):
                ess.append(it)
        except Exception:
            continue
    return mcq, sa, tf, idf, ess

def _merge_trim_to_counts(
    mcq: List[Dict[str, Any]],
    sa: List[Dict[str, Any]],
    tf: List[Dict[str, Any]],
    idf: List[Dict[str, Any]],
    ess: List[Dict[str, Any]],
    need_mcq: int, 
    need_sa: int, 
    need_tf: int,
    need_idf: int,
    need_ess: int
) -> List[Dict[str, Any]]:
    return mcq[:need_mcq] + sa[:need_sa] + tf[:need_tf] + idf[:need_idf] + ess[:need_ess]

def _counts_satisfied(mcq, sa, tf, idf, ess, need_mcq, need_sa, need_tf, need_idf, need_ess) -> bool:
    return (len(mcq) >= need_mcq and len(sa) >= need_sa and len(tf) >= need_tf 
            and len(idf) >= need_idf and len(ess) >= need_ess)

def _estimate_topup_tokens(missing_mcq: int, missing_sa: int, missing_tf: int, missing_idf: int, missing_ess: int) -> int:
    return max(300, missing_mcq * 220 + missing_sa * 120 + missing_tf * 40 + missing_idf * 100 + missing_ess * 180)

def _top_up_generation(
    base_text: str,
    have_mcq: int, have_sa: int, have_tf: int, have_idf: int, have_ess: int,
    need_mcq: int, need_sa: int, need_tf: int, need_idf: int, need_ess: int,
    difficulty: str
) -> List[Dict[str, Any]]:
    missing_mcq = max(0, need_mcq - have_mcq)
    missing_sa  = max(0, need_sa  - have_sa)
    missing_tf  = max(0, need_tf  - have_tf)
    missing_idf = max(0, need_idf - have_idf)
    missing_ess = max(0, need_ess - have_ess)
    
    if (missing_mcq + missing_sa + missing_tf + missing_idf + missing_ess) == 0:
        return []
    
    prompt2 = generate_prompt(base_text, missing_mcq, missing_sa, missing_tf, missing_idf, missing_ess, difficulty)
    small_cap = min(1200, _estimate_topup_tokens(missing_mcq, missing_sa, missing_tf, missing_idf, missing_ess))
    raw2 = call_groq(prompt2, max_tokens_override=small_cap)
    arr2 = extract_json_array(raw2)
    mcq2, sa2, tf2, idf2, ess2 = _filter_and_partition(arr2)
    return _merge_trim_to_counts(mcq2, sa2, tf2, idf2, ess2, missing_mcq, missing_sa, missing_tf, missing_idf, missing_ess)

def _bool_from_text(txt: str) -> bool | None:
    t = _clean_model_output((txt or "")).strip().lower()
    # be robust if model emits anything else
    if "true" in t and "false" not in t:
        return True
    if "false" in t and "true" not in t:
        return False
    if t.startswith("true"):  # just in case
        return True
    if t.startswith("false"):
        return False
    return None

def _lexical_backup(student: str, reference: str) -> bool:
    # very cheap fallback if model fails: token overlap OR fuzzy ratio
    sa = _norm_text(student).lower()
    ra = _norm_text(reference).lower()
    if not sa or not ra:
        return False
    wa = set(re.findall(r"[a-z0-9]+", sa))
    wb = set(re.findall(r"[a-z0-9]+", ra))
    inter = len(wa & wb)
    if inter >= 3 or (wb and inter >= max(2, int(0.5 * len(wb)))):
        return True
    return difflib.SequenceMatcher(None, sa, ra).ratio() >= 0.80

# ---------- Routes ----------
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/generate-quiz")
@app.post("/generate-quiz/", include_in_schema=False)
async def generate_quiz(
    file: UploadFile = File(...),
    mcq_count: int = Form(3),
    sa_count: int = Form(3),
    tf_count: int = Form(4),
    idf_count: int = Form(0),
    ess_count: int = Form(0),
    difficulty: str = Form("Intermediate"),
):
    # Save temp upload
    suffix = Path(file.filename).suffix or ".pdf"
    temp_path = Path(f"temp_{uuid.uuid4()}{suffix}")
    with temp_path.open("wb") as f:
        f.write(await file.read())

    try:
        # Extract & prepare prompt/input
        text = extract_text_from_file(str(temp_path))
        safe_text = truncate_text(text)
        prompt = generate_prompt(safe_text, mcq_count, sa_count, tf_count, idf_count, ess_count, difficulty)
        requested_total = mcq_count + sa_count + tf_count + idf_count + ess_count

        # 1) Primary generation
        try:
            raw_output = call_groq(prompt, max_tokens_override=GROQ_MAX_TOKENS)
        except Exception as e:
            log.error("Groq call failed: %s", e)
            return JSONResponse(content={"error": f"{e}"}, status_code=502)

        # 2) Strict parse
        try:
            arr = extract_json_array(raw_output)
            if not isinstance(arr, list):
                raise ValueError("Model did not return a JSON array.")
        except Exception as e:
            log.error("JSON parsing failed: %s\nRaw output:\n%s", e, raw_output)
            return JSONResponse(content={"error": "Failed to parse JSON from model output."}, status_code=500)

        # 3) Normalize/Repair/Validate and partition
        mcq, sa, tf, idf, ess = _filter_and_partition(arr)

        # 4) If under-produced, try ONE small top-up call for missing counts
        if not _counts_satisfied(mcq, sa, tf, idf, ess, mcq_count, sa_count, tf_count, idf_count, ess_count):
            try:
                extras = _top_up_generation(
                    base_text=safe_text,
                    have_mcq=len(mcq), have_sa=len(sa), have_tf=len(tf), have_idf=len(idf), have_ess=len(ess),
                    need_mcq=mcq_count, need_sa=sa_count, need_tf=tf_count, need_idf=idf_count, need_ess=ess_count,
                    difficulty=difficulty
                )
                if extras:
                    ex_mcq, ex_sa, ex_tf, ex_idf, ex_ess = _filter_and_partition(extras)
                    mcq += ex_mcq; sa += ex_sa; tf += ex_tf; idf += ex_idf; ess += ex_ess
            except Exception as e:
                log.warning("Top-up generation failed: %s", e)

        # 5) Final enforcement: trim to EXACT requested counts
        final_items = _merge_trim_to_counts(mcq, sa, tf, idf, ess, mcq_count, sa_count, tf_count, idf_count, ess_count)

        # 6) If STILL short, fail loudly so the UI can retry or adjust counts
        if len(final_items) != requested_total:
            log.error(
                "Final count mismatch. Have: %d (mcq=%d sa=%d tf=%d idf=%d ess=%d); need: %d",
                len(final_items), len(mcq), len(sa), len(tf), len(idf), len(ess), requested_total
            )
            return JSONResponse(
                content={"error": "Model returned fewer valid items than requested. Please retry or reduce counts."},
                status_code=502
            )

        # ✅ Success – return ONLY the array
        return JSONResponse(content=final_items)

    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass

@app.post("/grade-short-answer")
def grade_short_answer(payload: dict = Body(...)):
    """
    Body: { "question_id": "<uuid>", "student_answer": "<text>" }
    Returns: { "is_correct": true|false }
    Handles: short_answer, identification, and essay types
    """
    qid = (payload or {}).get("question_id")
    student = (payload or {}).get("student_answer") or ""
    if not qid or not isinstance(student, str):
        return JSONResponse({"is_correct": False, "error": "bad_request"}, status_code=400)

    # 1) get reference answer (+ optional question text) from DB
    try:
        res = supabase.table("quiz_questions") \
            .select("id,type,text,correct_answer") \
            .eq("id", qid).maybe_single().execute()
        row = (res.data if hasattr(res, "data") else res.get("data"))
        row = row or {}
    except Exception as e:
        log.error("DB fetch failed: %s", e)
        return JSONResponse({"is_correct": False, "error": "db_error"}, status_code=500)

    question_type = row.get("type", "")
    ref = (row.get("correct_answer") or "").strip()
    question_text = (row.get("text") or "").strip()

    if not ref:
        return {"is_correct": False}

    # 2) Handle identification with exact normalized matching
    if question_type == "identification":
        def normalize_id(s: str) -> str:
            """Remove all non-alphanumeric chars and lowercase"""
            return re.sub(r'[^a-z0-9]', '', s.lower())
        
        student_norm = normalize_id(student)
        ref_norm = normalize_id(ref)
        
        return {"is_correct": bool(student_norm and ref_norm and student_norm == ref_norm)}

    # 3) Build grading prompt for essay/short_answer
    if question_type == "essay":
        prompt = f"""
You are a grader for essay questions.

Evaluate if the student's essay covers the main points of the reference.
If the student's essay addresses 40% or more of the key aspects of the reference, mark it correct.

Output **ONLY** the word TRUE or FALSE. No punctuation. No explanation.

QUESTION: {question_text}
REFERENCE: {ref}
STUDENT ESSAY: {student}

Answer (ONLY TRUE or FALSE):
""".strip()
    else:  # short_answer
        prompt = f"""
You are a strict grader for short-answer quizzes.

Evaluate if the student's answer covers the main points of the reference.
If the student's answer addresses 40% or more of the key aspects of the reference, mark it correct.

Output **ONLY** the word TRUE or FALSE. No punctuation. No explanation.

QUESTION: {question_text}
REFERENCE: {ref}
STUDENT: {student}

Answer (ONLY TRUE or FALSE):
""".strip()

    # 3) Call Groq for grading
    try:
        raw = call_groq(prompt, max_tokens_override=3)
        val = _bool_from_text(raw)
        if val is None:
            # model replied weirdly – fall back to a cheap lexical check
            val = _lexical_backup(student, ref)
        return {"is_correct": bool(val)}
    except Exception as e:
        log.error("Groq grading failed: %s", e)
        # last-ditch lexical fallback so grading still works
        return {"is_correct": _lexical_backup(student, ref)}