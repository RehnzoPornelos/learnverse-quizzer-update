import { supabase } from "@/integrations/supabase/client";

type PerfInsert = {
  quiz_id: string;
  score: number;
  completion_time_seconds: number | null;
  student_name: string;   // NOT NULL
  section_id: string;
};

type ResponseRow = {
  quiz_id: string;
  question_id: string;
  section_id: string;
  student_name?: string | null;
  answered_at: string;
  time_spent_seconds: number;
  is_correct: boolean;
  selected_option: any;
  text_answer: string;
};

type PendingSubmission = {
  id: string; // unique queue id
  kind: "quiz_submission_v1";
  quizId: string;
  perfInsert: PerfInsert;
  responsesTemplate: ResponseRow[];
};

const KEY = "lv.pendingSubmissions.v1";

function loadQueue(): PendingSubmission[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveQueue(items: PendingSubmission[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

// basic dedupe signature so we don't pile up obvious duplicates
const sigOf = (s: Omit<PendingSubmission, "id">) =>
  `${s.perfInsert.quiz_id}|${s.perfInsert.section_id}|${s.perfInsert.student_name}|${s.perfInsert.score}|${s.responsesTemplate.length}`;

export function enqueueSubmission(item: Omit<PendingSubmission, "id">) {
  const q = loadQueue();
  const sig = sigOf(item);
  if (!q.some(x => sigOf(x) === sig)) {
    q.push({ id: `${Date.now()}-${Math.random()}`, ...item });
    saveQueue(q);
  }
}

function isAuthError(err: any) {
  const s = err?.status ?? err?.code;
  const msg = String(err?.message || "").toLowerCase();
  return s === 401 || s === 403 || msg.includes("invalid refresh token");
}
function isOfflineLike(err: any) {
  const msg = String(err?.message || err || "").toLowerCase();
  return !navigator.onLine || msg.includes("failed to fetch") || msg.includes("network");
}
function isConflict(err: any) {
  const s = err?.status ?? err?.code;
  const msg = String(err?.message || "").toLowerCase();
  return s === 409 || msg.includes("duplicate key value") || msg.includes("conflict");
}

export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  let q = loadQueue();
  let sent = 0;

  for (const item of [...q]) {
    if (!navigator.onLine) break;

    const tryOnce = async () => {
      // perf insert (no SELECT; respects RLS)
      const { error: perfErr } = await supabase
        .from("analytics_student_performance")
        .insert(item.perfInsert);
      if (perfErr) throw perfErr;

      // responses insert (no FK)
      const { error: respErr } = await supabase
        .from("quiz_responses")
        .insert(item.responsesTemplate);
      if (respErr) throw respErr;
    };

    try {
      await tryOnce();
      q = q.filter(s => s.id !== item.id);   // remove by id
      sent++;
      saveQueue(q);
      continue;
    } catch (errFirst) {
      if (isConflict(errFirst)) {
        // already in DB -> drop from queue
        q = q.filter(s => s.id !== item.id);
        saveQueue(q);
        continue;
      }
      if (isAuthError(errFirst)) {
        try { await supabase.auth.signOut(); } catch {}
        try {
          await tryOnce();
          q = q.filter(s => s.id !== item.id);
          sent++;
          saveQueue(q);
          continue;
        } catch (errSecond) {
          if (isConflict(errSecond)) {
            q = q.filter(s => s.id !== item.id);
            saveQueue(q);
            continue;
          }
          if (isOfflineLike(errSecond)) break; // wait till later
        }
      } else if (isOfflineLike(errFirst)) {
        break; // wait till later
      }
      // keep in queue for next time
    }
  }

  return { sent, remaining: q.length };
}

export function installOnlineFlush() {
  const run = () => { flushQueue().catch(() => {}); };
  window.addEventListener("online", run);
  window.addEventListener("focus", run);
  run();
}