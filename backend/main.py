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

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama3-70b-8192"
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Check your .env file.")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    "type": "mcq",
    "question": "...",
    "choices": ["A", "B", "C", "D"],
    "answer": "B"
  }},
  {{
    "type": "short_answer",
    "question": "...",
    "answer": "..."
  }},
  {{
    "type": "true_false",
    "question": "...",
    "answer": "True"
  }}
]

Learning Material:
\"\"\"
{text}
\"\"\"
"""

def truncate_text(text: str, max_chars: int = 20000) -> str:
    """
    Truncate text to fit within token limits (approx. 4 chars per token).
    """
    return text[:max_chars]

def call_groq(prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5,
        # Increase max_tokens to allow more question content
        "max_tokens": 4096
    }
    response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=data)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def extract_json_array(text: str):
    """
    Extract a JSON array from the model output. This function searches for the
    first '[' and last ']' in the text and attempts to parse the substring as
    JSON. This is more robust than the previous implementation, which only
    captured the first object due to a non-greedy regex.
    """
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
        safe_text = truncate_text(text)  # Truncate before generating prompt
        prompt = generate_prompt(safe_text, mcq_count, sa_count, tf_count)
        raw_output = call_groq(prompt)
        
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
        os.remove(temp_path)
