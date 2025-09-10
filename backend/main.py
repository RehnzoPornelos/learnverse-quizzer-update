import os
import uuid
import json
import re
import requests
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from utils import extract_text_from_file
from dotenv import load_dotenv

# --- Socket.IO (minimal) ---
import socketio

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# Default to a supported model; allow override via .env.  This new default
# uses the Llama 3.3 70B model, as Groq has deprecated the old llama3-70b-8192
# in favour of 3.3
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Check your .env file.")

# Fallback models to try if the primary model is decommissioned or not found.
# We'll try the primary first, then these.
FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# expose socket_app for uvicorn main:socket_app
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# In-memory room registry
room_participants: dict[str, list[dict]] = {}

@sio.event
async def student_join(sid, data):
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
        {"room": room_code, "quiz_id": quiz_id, "title": title, "participants": [p["name"] for p in room_participants[room_code]]},
        to=sid,
    )

@sio.event
async def host_start(sid, data):
    room_code = data.get("room")
    if not room_code: return
    await sio.emit("server:quiz-start", data, room=room_code)

@sio.event
async def host_end(sid, data):
    room_code = data.get("room")
    if not room_code: return
    await sio.emit("server:quiz-end", data, room=room_code)

@sio.event
async def student_answer(sid, data):
    room_code = data.get("room")
    if not room_code: return
    session = await sio.get_session(sid)
    if session:
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

def generate_prompt(text: str, mcq_count: int, sa_count: int, tf_count: int) -> str:
    return f"""
From the following learning material, generate a quiz with a total of {mcq_count + sa_count + tf_count} questions.

- {mcq_count} Multiple Choice Questions (with 4 choices and a correct answer).
- {sa_count} Short Answer Questions.
- {tf_count} True/False Questions.

Respond ONLY with a JSON array in this format, without adding any explanation or preamble:
[
  {{
    \"type\": \"mcq\",
    \"question\": \"...\",
    \"choices\": [\"A\", \"B\", \"C\", \"D\"],
    \"answer\": \"B\"
  }},
  {{
    \"type\": \"short_answer\",
    \"question\": \"...\",
    \"answer\": \"...\"
  }},
  {{
    \"type\": \"true_false\",
    \"question\": \"...\",
    \"answer\": \"True\"
  }}
]

Learning Material:
\"\"\"
{text}
\"\"\"
"""

def truncate_text(text: str, max_chars: int = 20000) -> str:
    return text[:max_chars]

# ---- Groq helpers ----
def _post_to_groq(model: str, prompt: str) -> requests.Response:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 2048,
        "stop": ["```", "<think>"]
    }
    return requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers=headers, json=data, timeout=60
    )

def call_groq(prompt: str) -> str:
    r = _post_to_groq(GROQ_MODEL, prompt)
    if r.status_code == 200:
        j = r.json()
        return j["choices"][0]["message"]["content"]
    # try fallbacks on decommissioned or not found
    try:
        err = r.json()
    except Exception:
        err = {"error": r.text}
    code = str(err.get("error", {}).get("code", "")).lower()
    msg = str(err.get("error", {}).get("message", "")).lower()
    if r.status_code in (400, 404) and (
        "model_decommissioned" in code or
        "model_not_found" in code or
        "decommissioned" in msg
    ):
        for alt in FALLBACK_MODELS:
            if alt == GROQ_MODEL:
                continue
            r2 = _post_to_groq(alt, prompt)
            if r2.status_code == 200:
                j2 = r2.json()
                return j2["choices"][0]["message"]["content"]
        raise RuntimeError(f"Groq {r.status_code}: {err}")
    raise RuntimeError(f"Groq {r.status_code}: {err}")

# Output sanitization and parsing
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE_RE = re.compile(r"```(?:json)?(.*?)```", re.DOTALL | re.IGNORECASE)

def _clean_model_output(text: str) -> str:
    text = _THINK_RE.sub("", text).strip()
    m = _FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()
    text = text.replace("\ufeff", "")
    return text.strip("` \n\r\t")

def extract_json_array(text: str):
    text = _clean_model_output(text)
    start = text.find('[')
    end = text.rfind(']')
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No valid JSON array found in output.")
    json_str = text[start:end + 1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON array: {e}")

@app.post("/generate-quiz/")
async def generate_quiz(
    file: UploadFile = File(...),
    mcq_count: int = Form(3),
    sa_count: int = Form(3),
    tf_count: int = Form(4)
):
    ext = Path(file.filename).suffix or ".pdf"
    temp_path = f"temp_{uuid.uuid4()}{ext}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())

    try:
        text = extract_text_from_file(temp_path)
        safe_text = truncate_text(text)
        prompt = generate_prompt(safe_text, mcq_count, sa_count, tf_count)
        try:
            raw_output = call_groq(prompt)
        except Exception as e:
            return JSONResponse(content={"error": f"{e}"}, status_code=502)

        if len(text) > 12000:
            print("Warning: Text was truncated to fit model limits.")

        try:
            quiz_data = extract_json_array(raw_output)
        except Exception as e:
            print("JSON parsing failed. Raw output was:\n", raw_output)
            print("Error:", str(e))
            return JSONResponse(content={"error": "Failed to parse JSON from model output."}, status_code=500)

        return JSONResponse(content=quiz_data)
    finally:
        try:
            os.remove(temp_path)
        except Exception:
            pass
