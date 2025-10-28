// StudentProgressChart.tsx
// - True 3D chart via Plotly (rotate/zoom)
// - k = 5 K-Means on [Avg Score %, Avg Time per Q (s), Total Quizzes] with z‑score scaling
// - Semantic labels defined by score bands and cohort median pacing:
//     High Achiever         = score ≥ 90% and time < median
//     Slow High Achiever    = score ≥ 90% and time ≥ median
//     Guesser               = score < 75% and time < median
//     Struggler             = score < 75% and time ≥ median
//     On Track              = otherwise (moderate)
// - Section filter + details table kept

import { useCallback, useMemo, useState } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Download } from "lucide-react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronUp, ChevronDown } from "lucide-react";

const Plot = createPlotlyComponent(Plotly);

type AnyRow = Record<string, any>;

type StudentFeature = {
  studentKey: string;
  studentName: string;
  sectionId: string | null;
  avgScorePct: number;
  totalQuizzes: number; // Z axis
  avgTimePerQuestion: number; // seconds
};

// Extend DisplayLabel to include five semantic categories.  We now have
// a distinct label for students who achieve high scores but take longer
// than the cohort median to complete questions (“Slow High Achiever”).
// Existing labels remain: High Achiever, Guesser, Struggler, and
// On‑Track.  These correspond to performance quadrants and are used
// throughout the component for colouring and filtering.
type DisplayLabel =
  | "High Achiever"
  | "Slow High Achiever"
  | "Guesser"
  | "Struggler"
  | "On Track";

type ClusteredStudent = StudentFeature & {
  cluster: number; // numeric K-Means cluster (not shown)
  displayLabel: DisplayLabel; // your 4-quadrant label (shown)
};

type Props = { selectedSection?: string | null };

// ----- Colours for your 5 semantic labels -----
// We assign a distinct colour to each label to aid visual separation
// in both the table and the 3D scatter plot.  Feel free to tweak
// colours to better fit your branding or accessibility guidelines.
const LABEL_COLORS: Record<DisplayLabel, string> = {
  "High Achiever": "#00A86B", // green
  "Slow High Achiever": "#1E90FF", // blue
  Guesser: "#A855F7", // purple
  Struggler: "#EF4444", // red
  "On Track": "#F59E0B", // amber
};

// ---------- helpers ----------
const toNum = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

// ---------- Standardization (z-score) ----------
type Std = { mean: number[]; std: number[] };
function fitStd(X: number[][]): Std {
  const d = X[0].length,
    n = X.length;
  const mean = Array(d).fill(0),
    std = Array(d).fill(0);
  for (let j = 0; j < d; j++) mean[j] = X.reduce((s, r) => s + r[j], 0) / n;
  for (let j = 0; j < d; j++) {
    const v = X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n;
    std[j] = Math.sqrt(v) || 1;
  }
  return { mean, std };
}
const transformStd = (X: number[][], s: Std) =>
  X.map((r) => r.map((v, j) => (v - s.mean[j]) / s.std[j]));

// ---------- K-Means (ND) ----------
function euclidND(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
function kmeansND(X: number[][], k: number, maxIter = 120) {
  const n = X.length;
  if (!n) return { labels: [], centroids: [] as number[][] };
  const d = X[0].length;
  const idxs = Array.from({ length: n }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const centroids = idxs.slice(0, Math.min(k, n)).map((i) => X[i].slice(0, d));
  const labels = Array(n).fill(0);
  let changed = true,
    iter = 0;
  while (changed && iter < maxIter) {
    changed = false;
    iter++;
    for (let i = 0; i < n; i++) {
      let best = 0,
        bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dd = euclidND(X[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    const sums = centroids.map(() => Array(d).fill(0));
    const counts = centroids.map(() => 0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      for (let j = 0; j < d; j++) sums[c][j] += X[i][j];
      counts[c]++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < d; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
  }
  return { labels, centroids };
}

// ---------- CSV helpers ----------
function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows || rows.length === 0) return "";

  // Determine columns explicitly (avoid reduce generic weirdness)
  let keys: string[];
  if (columns && columns.length) {
    keys = columns;
  } else {
    const keySet = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) keySet.add(k);
    }
    keys = Array.from(keySet);
  }

  const header = keys.map(csvEscape).join(",");
  const body = rows
    .map((r) => keys.map((k) => csvEscape(r[k])).join(","))
    .join("\n");
  return header + "\n" + body;
}

function quantile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, r) => p - r);
  const idx = (a.length - 1) * q;
  const lo = Math.floor(idx),
    hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const h = idx - lo;
  return a[lo] * (1 - h) + a[hi] * h;
}

// ----- Label assignment based on score and pacing -----
// Assigns a semantic label to a student given their average score (in %),
// average time per question (in seconds) and the cohort’s median time.
// High achievers score at least 90%.  Those scoring >=90% but taking
// longer than the median are “Slow High Achievers”.  Students scoring
// below 75% are divided into “Guessers” (fast but low accuracy) and
// “Strugglers” (slow and low accuracy).  Everyone else is “On Track”.
function semanticLabel(
  scorePct: number,
  timePerQ: number,
  medianTime: number
): DisplayLabel {
  if (scorePct >= 90) {
    return timePerQ < medianTime ? "High Achiever" : "Slow High Achiever";
  }
  if (scorePct < 75) {
    return timePerQ < medianTime ? "Guesser" : "Struggler";
  }
  return "On Track";
}

const ColumnSorter = ({
  onAsc,
  onDesc,
  activeAsc,
  activeDesc,
}: {
  onAsc: () => void;
  onDesc: () => void;
  activeAsc?: boolean;
  activeDesc?: boolean;
}) => (
  <div className="flex items-center gap-0.5">
    <button
      className={`p-1 rounded hover:bg-muted transition ${
        activeAsc ? "text-primary" : "text-muted-foreground"
      }`}
      onClick={onAsc}
      aria-label="Sort ascending"
      type="button"
    >
      <ChevronUp className="h-3.5 w-3.5" />
    </button>
    <button
      className={`p-1 rounded hover:bg-muted transition ${
        activeDesc ? "text-primary" : "text-muted-foreground"
      }`}
      onClick={onDesc}
      aria-label="Sort descending"
      type="button"
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  </div>
);

export default function StudentProgressChart({
  selectedSection = "all",
}: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [rows, setRows] = useState<ClusteredStudent[]>([]);
  const [kUsed, setKUsed] = useState<number | null>(null);
  const [centroids, setCentroids] = useState<number[][]>([]);
  const [counts, setCounts] = useState({ students: 0, quizzes: 0 });
  const [sectionCodeMap, setSectionCodeMap] = useState<Map<string, string>>(
    new Map()
  );
  const [labelFilter, setLabelFilter] = useState<"ALL" | DisplayLabel>("ALL");
  const { user } = useAuth();
  // state (put with your other useState hooks)
  type SortKey =
    | "displayLabel"
    | "studentName"
    | "sectionCode"
    | "totalQuizzes"
    | "avgTimePerQuestion"
    | "avgScorePct";

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "avgScorePct",
    dir: "desc",
  });
  const [nameQuery, setNameQuery] = useState("");

  const exportResults = useCallback(async () => {
    if (!user?.id || rows.length === 0) return;

    try {
      // 1) Professor's published quizzes
      const { data: quizRows, error: quizErr } = await supabase
        .from("quizzes")
        .select(
          "id, title, description, quiz_duration_seconds, question_no, published, user_id, created_at, updated_at"
        )
        .eq("published", true)
        .eq("user_id", user.id);
      if (quizErr) throw quizErr;

      const quizIds = (quizRows ?? []).map((r) => String(r.id));
      if (!quizIds.length)
        throw new Error("No published quizzes for this professor.");

      // 2) Determine which student keys (student_name_norm|section_id) were clustered
      const clusteredKeys = new Set(rows.map((r) => r.studentKey));
      const clusteredStudentNorms = new Set(
        rows.map((r) => r.studentKey.split("|")[0])
      );
      const clusteredSectionIds = new Set(
        rows.map((r) => r.sectionId).filter(Boolean) as string[]
      );

      // ---- analytics_student_performance (paged) ----
      const aspAll: any[] = [];
      {
        const pageSize = 1000;
        let from = 0,
          to = pageSize - 1;
        while (true) {
          let q = supabase
            .from("analytics_student_performance")
            .select("*")
            .in("quiz_id", quizIds)
            .range(from, to);
          if (selectedSection && selectedSection !== "all")
            q = q.eq("section_id", selectedSection);
          const { data, error } = await q;
          if (error) throw error;
          const batch = data ?? [];
          aspAll.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
          to += pageSize;
        }
      }

      const aspIncluded = aspAll.filter((r) => {
        const norm = String(r.student_name_norm ?? "").trim();
        const sid = String(r.section_id ?? "");
        const key = `${norm}|${sid || "null"}`;
        return clusteredKeys.has(key);
      });

      // collect sectionIds/quizIds actually included
      const sectionIdsSet = new Set<string>();
      const quizIdsSet = new Set<string>();
      aspIncluded.forEach((r) => {
        if (r.section_id) sectionIdsSet.add(String(r.section_id));
        if (r.quiz_id) quizIdsSet.add(String(r.quiz_id));
      });

      // ---- quiz_responses (paged) ----
      const qrAll: any[] = [];
      {
        const pageSize = 1000;
        let from = 0,
          to = pageSize - 1;
        while (true) {
          let q = supabase
            .from("quiz_responses")
            .select("*")
            .in("quiz_id", Array.from(quizIdsSet))
            .range(from, to);
          if (selectedSection && selectedSection !== "all")
            q = q.eq("section_id", selectedSection);
          const { data, error } = await q;
          if (error) throw error;
          const batch = data ?? [];
          qrAll.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
          to += pageSize;
        }
      }

      const qrIncluded = qrAll.filter((r) => {
        const norm = String(r.student_name_norm ?? "").trim();
        const sid = String(r.section_id ?? "");
        const key = `${norm}|${sid || "null"}`;
        return clusteredKeys.has(key);
      });

      // 5) class_sections for the sections in ASP
      let sectionsRows: any[] = [];
      if (sectionIdsSet.size > 0) {
        const { data: secRows, error: secErr } = await supabase
          .from("class_sections")
          .select("*")
          .in("id", Array.from(sectionIdsSet));
        if (secErr) throw secErr;
        sectionsRows = secRows ?? [];
      }

      // 6) quizzes for the quizzes in ASP (re-use quizRows filtered)
      const quizzesIncluded =
        quizRows?.filter((q) => quizIdsSet.has(String(q.id))) ?? [];

      // 7) quiz_questions for the responses’ question_ids
      const qIdsSet = new Set<string>();
      qrIncluded.forEach((r) => {
        if (r.question_id) qIdsSet.add(String(r.question_id));
      });

      let questionRows: any[] = [];
      if (qIdsSet.size > 0) {
        const { data: qqRows, error: qqErr } = await supabase
          .from("quiz_questions")
          .select("*")
          .in("id", Array.from(qIdsSet));
        if (qqErr) throw qqErr;
        questionRows = qqRows ?? [];
      }

      // ---- Per-question summary from qrIncluded ----
      // average time spent (seconds) and accuracy (% correct)
      type QAgg = {
        quiz_id: string;
        n: number;
        timeSum: number;
        correct: number;
      };
      const aggByQ = new Map<string, QAgg>();

      for (const r of qrIncluded) {
        const qid = String(r.question_id);
        const quizId = String(r.quiz_id);
        const time = Number(r.time_spent_seconds ?? 0);
        const isCorrect = !!r.is_correct;

        const cur = aggByQ.get(qid) || {
          quiz_id: quizId,
          n: 0,
          timeSum: 0,
          correct: 0,
        };
        cur.n += 1;
        cur.timeSum += time;
        if (isCorrect) cur.correct += 1;
        aggByQ.set(qid, cur);
      }

      // Lookups to attach question text/type
      const questionById = new Map<string, any>();
      (questionRows ?? []).forEach((qq: any) =>
        questionById.set(String(qq.id), qq)
      );

      const qrSummary = Array.from(aggByQ.entries()).map(([question_id, a]) => {
        const qq = questionById.get(question_id);
        const avgTime = a.n ? a.timeSum / a.n : 0;
        const accuracy = a.n ? (a.correct / a.n) * 100 : 0;
        return {
          question_id,
          quiz_id: a.quiz_id,
          type: qq?.type ?? "",
          text: qq?.text ?? "",
          attempts: a.n,
          correct: a.correct,
          wrong: a.n - a.correct,
          avg_time_spent_seconds: Number(avgTime.toFixed(2)),
          accuracy_percent: Number(accuracy.toFixed(2)),
        };
      });
      // Sort hardest first (lowest accuracy)
      qrSummary.sort((p, r) => p.accuracy_percent - r.accuracy_percent);

      // 8) clustering_results table rows from our 'rows' state (all students, not filtered by UI search)
      const clusteringResults = rows.map((r) => ({
        Cluster: r.displayLabel,
        Student: r.studentName,
        Section: r.sectionId
          ? sectionCodeMap.get(r.sectionId) ?? r.sectionId
          : "—",
        "Quizzes Taken": r.totalQuizzes,
        "Avg Pace (s/Q)": Number(r.avgTimePerQuestion.toFixed(2)),
        "Avg Score (%)": Number(r.avgScorePct.toFixed(2)),
      }));

      // ---------- Write XLSX with one sheet per table ----------
      const wb = XLSX.utils.book_new();

      const safeSheet = (name: string, rows: any[], columns?: string[]) => {
        const data = rows && rows.length ? rows : [{}]; // avoid empty-sheet errors
        const ws =
          columns && columns.length
            ? XLSX.utils.json_to_sheet(rows, { header: columns })
            : XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel name limit
      };

      // Sheets in a stable order
      safeSheet("clustering_results", clusteringResults, [
        "Cluster",
        "Student",
        "Section",
        "Quizzes Taken",
        "Avg Pace (s/Q)",
        "Avg Score (%)",
      ]);
      safeSheet("analytics_student_performance", aspIncluded);

      // quiz_responses may be huge, so only include if < 1000 rows
      if (qrIncluded.length <= 1000) {
        safeSheet("quiz_responses", qrIncluded);
      } else {
        safeSheet("quiz_responses_SKIPPED", [
          {
            note: `quiz_responses are omitted as it is too many. Totaling (${qrIncluded.length} rows).`,
          },
        ]);
      }

      safeSheet("class_sections", sectionsRows);
      safeSheet("quizzes", quizzesIncluded);
      safeSheet("quiz_questions", questionRows);
      safeSheet("quiz_responses_summary", qrSummary, [
        "question_id",
        "quiz_id",
        "type",
        "text",
        "attempts",
        "correct",
        "wrong",
        "avg_time_spent_seconds",
        "accuracy_percent",
      ]);

      /* Optional: a tiny README sheet with schema notes / version
      safeSheet("README", [
        { note: "Dataset generated by StudentProgressChart → Export Results" },
        {
          note: "One sheet per table. Use 'clustering_results' as entrypoint for recommendations.",
        },
        { note: "Version: 1.0" },
      ]); */

      const stamp = dayjs().format("YYYYMMDD_HHmmss"); // or your Date() fallback
      XLSX.writeFile(wb, `Student_Cluster_Data_${stamp}.xlsx`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Check console for details.");
    }
  }, [user?.id, rows, selectedSection, sectionCodeMap]);

  // helpers for sorting
  const getSectionCode = (sectionId?: string | null) =>
    sectionId ? sectionCodeMap.get(sectionId) ?? "" : "";

  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  const sortRows = (rows: ClusteredStudent[]) => {
    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((ra, rb) => {
      switch (key) {
        case "displayLabel":
          return factor * cmp(ra.displayLabel, rb.displayLabel);
        case "studentName":
          return (
            factor *
            cmp(ra.studentName.toLowerCase(), rb.studentName.toLowerCase())
          );
        case "sectionCode":
          return (
            factor *
            cmp(
              getSectionCode(ra.sectionId).toLowerCase(),
              getSectionCode(rb.sectionId).toLowerCase()
            )
          );
        case "totalQuizzes":
          return factor * cmp(ra.totalQuizzes, rb.totalQuizzes);
        case "avgTimePerQuestion":
          return factor * cmp(ra.avgTimePerQuestion, rb.avgTimePerQuestion);
        case "avgScorePct":
        default:
          return factor * cmp(ra.avgScorePct, rb.avgScorePct);
      }
    });
  };

  const run = useCallback(async () => {
    setIsRunning(true);
    setRows([]);
    setKUsed(null);
    setCentroids([]);
    setCounts({ students: 0, quizzes: 0 });

    try {
      if (!user?.id) return;

      // A) quizzes of this professor
      const { data: quizRows, error: quizErr } = await supabase
        .from("quizzes")
        .select("id, question_no")
        .eq("published", true)
        .eq("user_id", user.id);
      if (quizErr) throw quizErr;

      const quizIds = (quizRows ?? []).map((r) => String(r.id));
      const qNoByQuiz = new Map<string, number>();
      for (const r of quizRows ?? [])
        qNoByQuiz.set(String(r.id), Number(r.question_no ?? 0));

      if (!quizIds.length) return;

      // B) section codes
      const { data: qsRows } = await supabase
        .from("quiz_sections")
        .select("section_id")
        .in("quiz_id", quizIds);
      const sectionIds = Array.from(
        new Set((qsRows ?? []).map((r) => String(r.section_id)))
      ).filter(Boolean);
      const { data: sectionRows } = await supabase
        .from("class_sections")
        .select("id, code")
        .in(
          "id",
          sectionIds.length
            ? sectionIds
            : ["00000000-0000-0000-0000-000000000000"]
        );
      const sMap = new Map<string, string>();
      for (const r of sectionRows ?? []) sMap.set(String(r.id), String(r.code));
      setSectionCodeMap(sMap);

      // C) analytics (paged)
      const perf: AnyRow[] = [];
      const pageSize = 1000;
      let from = 0,
        to = pageSize - 1;
      while (true) {
        let q = supabase
          .from("analytics_student_performance")
          .select("*")
          .in("quiz_id", quizIds)
          .range(from, to);
        if (selectedSection && selectedSection !== "all")
          q = q.eq("section_id", selectedSection);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data as AnyRow[]) ?? [];
        perf.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        to += pageSize;
      }

      // aggregate per student (per section)
      type Agg = {
        studentName: string;
        sectionId: string | null;
        pctScores: number[];
        timeSum: number;
        questionSum: number;
        quizIds: Set<string>;
      };
      const perStudent: Record<string, Agg> = {};

      for (const r of perf) {
        const sid = (r.section_id ?? null) as string | null;
        const name = String(r.student_name ?? "");
        const key = `${String(r.student_name_norm ?? "").trim()}|${
          sid ?? "null"
        }`;
        const qid = String(r.quiz_id ?? "");
        const rawScore = toNum(r.score);
        const secs = toNum(r.completion_time_seconds);
        const qno = qNoByQuiz.get(qid) ?? 0;

        if (!perStudent[key]) {
          perStudent[key] = {
            studentName: name,
            sectionId: sid,
            pctScores: [],
            timeSum: 0,
            questionSum: 0,
            quizIds: new Set(),
          };
        }
        const pct = qno > 0 ? (rawScore / qno) * 100 : 0;
        perStudent[key].pctScores.push(pct);
        perStudent[key].timeSum += secs;
        perStudent[key].questionSum += qno;
        if (qid) perStudent[key].quizIds.add(qid);
      }

      const feats: StudentFeature[] = Object.entries(perStudent).map(
        ([key, a]) => ({
          studentKey: key,
          studentName: a.studentName || key.split("|")[0],
          sectionId: a.sectionId,
          avgScorePct: round(avg(a.pctScores), 2),
          totalQuizzes: a.quizIds.size || a.pctScores.length,
          avgTimePerQuestion: round(
            a.questionSum > 0 ? a.timeSum / a.questionSum : 0,
            2
          ),
        })
      );

      if (feats.length < 2) {
        setCounts({ students: feats.length, quizzes: quizIds.length });
        return;
      }

      // ----- Cohort quartiles for pacing -----
      const times = feats
        .map((f) => f.avgTimePerQuestion)
        .filter((n) => Number.isFinite(n));

      // Compute the cohort’s median (Q2) of the raw average times.  This
      // median defines the boundary between “fast” and “slow” pacing in
      // the semanticLabel() function.  We only compute Q2 since Q1 and
      // Q3 are not currently used for labelling.
      const q2Time = quantile(times, 0.5);

      // ===== 3D K-Means on standardized [score, time, quizzes] =====
      const Xraw = feats.map((f) => [
        f.avgScorePct,
        f.avgTimePerQuestion,
        f.totalQuizzes,
      ]);
      const std = fitStd(Xraw);
      const X = transformStd(Xraw, std);

      // We set k to 5 to capture more nuanced clusters.  When the number
      // of data points is too small, k is clamped to ensure sensible
      // behaviour (at least two clusters and at most n-1).  See below.
      const kDesired = 5;
      const k = Math.min(kDesired, Math.max(2, feats.length - 1));
      const { labels, centroids } = kmeansND(X, k);
      setKUsed(k);
      setCentroids(centroids);
      setCounts({ students: feats.length, quizzes: quizIds.length });

      // Assign semantic labels based on median pacing and absolute score bands.
      // See semanticLabel() for rules.  Note that labeling is independent of
      // the K-Means clustering; clusters partition the data in feature space
      // but do not determine the final label.
      const labeled: ClusteredStudent[] = feats.map((f, i) => {
        const displayLabel = semanticLabel(
          f.avgScorePct,
          f.avgTimePerQuestion,
          q2Time
        );
        return { ...f, cluster: labels[i], displayLabel };
      });

      setRows(labeled);
    } catch (e) {
      console.error(e);
      setRows([]);
      setKUsed(null);
      setCentroids([]);
      setCounts({ students: 0, quizzes: 0 });
    } finally {
      setIsRunning(false);
    }
  }, [selectedSection, user?.id]);

  const rowsToShow = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const filtered =
      labelFilter === "ALL"
        ? rows
        : rows.filter((r) => r.displayLabel === labelFilter);

    const byName = q
      ? filtered.filter((r) => r.studentName.toLowerCase().includes(q))
      : filtered;

    return sortRows(byName);
  }, [rows, labelFilter, nameQuery, sort]);

  // ----- Plotly 3D data traces by label -----
  const traces = useMemo(() => {
    const byLabel: Record<DisplayLabel, ClusteredStudent[]> = {
      "High Achiever": [],
      "Slow High Achiever": [],
      Guesser: [],
      Struggler: [],
      "On Track": [],
    };
    for (const r of rows) byLabel[r.displayLabel].push(r);

    // Define an ordering for the legend.  This array controls the
    // sequencing of traces in the plot and can be adjusted to suit
    // pedagogical priorities.
    const labelsOrder: DisplayLabel[] = [
      "High Achiever",
      "Slow High Achiever",
      "On Track",
      "Guesser",
      "Struggler",
    ];
    return labelsOrder
      .filter((l) => byLabel[l].length > 0)
      .map((label) => ({
        type: "scatter3d" as const,
        mode: "markers" as const,
        name: label,
        x: byLabel[label].map((r) => r.avgScorePct),
        y: byLabel[label].map((r) => r.avgTimePerQuestion),
        z: byLabel[label].map((r) => r.totalQuizzes),
        text: byLabel[label].map((r) => `${r.studentName}`),
        marker: {
          size: byLabel[label].map((r) =>
            Math.max(6, Math.min(18, 6 + r.totalQuizzes * 1.5))
          ),
          color: LABEL_COLORS[label],
          opacity: 0.9,
          line: { width: 0.5, color: "#111" },
        },
        hovertemplate:
          "<b>%{text}</b><br>" +
          "Avg Score: %{x:.2f}%<br>" +
          "Avg Time/Q: %{y:.2f}s<br>" +
          "Quizzes: %{z}<extra></extra>",
      }));
  }, [rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            K-Means Student Performance
          </CardTitle>
          <CardDescription>
            X-Axis = Avg Score (%)  |  Y-Axis = Avg Time per Question (s)  |  Z-Axis = Quizzes Taken.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              Section:{" "}
              {selectedSection && selectedSection !== "all"
                ? sectionCodeMap.get(selectedSection) ?? selectedSection
                : "All"}
            </Badge>
            {kUsed != null && <Badge>k = {kUsed}</Badge>}
            <Badge variant="outline">Students: {counts.students}</Badge>
            <Badge variant="outline">Quizzes: {counts.quizzes}</Badge>

            <Button onClick={run} disabled={isRunning}>
              {isRunning ? "Clustering…" : "Run Clustering"}
            </Button>

            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={exportResults}
              disabled={isRunning || rows.length === 0}
              title={rows.length === 0 ? "Run clustering first" : "Export CSV"}
            >
              <Download className="h-4 w-4" />
              Export Results
            </Button>
          </div>

          <div className="w-full h-[520px] rounded-xl overflow-hidden ring-1 ring-border">
            <Plot
              data={traces as any}
              layout={
                (() => {
                  const isDark =
                    typeof document !== "undefined" &&
                    document.documentElement.classList.contains("dark");

                  const colors = {
                    grid: isDark ? "#2A2F3A" : "#D6DEE8",
                    axis: isDark ? "#C9D1E0" : "#334155",
                    zero: isDark ? "#94A3B8" : "#64748B",
                    sceneBg: isDark ? "#0B1220" : "#FFFFFF",
                    plane: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                  };

                  return {
                    autosize: true,
                    margin: { l: 10, r: 10, t: 10, b: 10 },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    uirevision: "grid-theme",
                    font: { color: colors.axis },

                    scene: {
                      bgcolor: colors.sceneBg,

                      xaxis: {
                        title: { text: "AVG Score (%)" }, // <-- important
                        showbackground: true,
                        backgroundcolor: colors.plane,
                        gridcolor: colors.grid,
                        gridwidth: 2,
                        zeroline: true,
                        zerolinecolor: colors.zero,
                        linecolor: colors.axis,
                        linewidth: 3,
                        tickcolor: colors.axis,
                        tickfont: { color: colors.axis },
                        color: colors.axis,
                        mirror: true,
                      },
                      yaxis: {
                        title: { text: "AVG Time per Question (s)" }, // <-- important
                        showbackground: true,
                        backgroundcolor: colors.plane,
                        gridcolor: colors.grid,
                        gridwidth: 2,
                        zeroline: true,
                        zerolinecolor: colors.zero,
                        linecolor: colors.axis,
                        linewidth: 3,
                        tickcolor: colors.axis,
                        tickfont: { color: colors.axis },
                        color: colors.axis,
                        mirror: true,
                      },
                      zaxis: {
                        title: { text: "Quizzes Taken" }, // <-- important
                        showbackground: true,
                        backgroundcolor: colors.plane,
                        gridcolor: colors.grid,
                        gridwidth: 2,
                        zeroline: true,
                        zerolinecolor: colors.zero,
                        linecolor: colors.axis,
                        linewidth: 3,
                        tickcolor: colors.axis,
                        tickfont: { color: colors.axis },
                        color: colors.axis,
                        mirror: true,
                      },

                      camera: { eye: { x: 1.6, y: 1.4, z: 0.9 } },
                    },

                    legend: {
                      orientation: "h",
                      x: 0.5,
                      xanchor: "center",
                      y: 1.05,
                      bgcolor: "rgba(0,0,0,0)",
                      bordercolor: isDark ? colors.grid : "rgba(0,0,0,0)",
                      borderwidth: isDark ? 1 : 0,
                      font: { color: colors.axis, size: 13 },
                    },
                  };
                })() as any
              }
              style={{ width: "100%", height: "100%" }}
              config={{ displaylogo: false, responsive: true } as any}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Cluster Details</CardTitle>
            <CardDescription>Grouped by your five labels</CardDescription>
          </div>

          <div className="flex w-full md:w-auto items-center gap-3">
            <Input
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Search student…"
              className="md:w-[260px]"
            />

            <Select
              value={labelFilter}
              onValueChange={(v: any) => setLabelFilter(v)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All labels</SelectItem>
                <SelectItem value="High Achiever">High Achiever</SelectItem>
                <SelectItem value="Slow High Achiever">Slow High Achiever</SelectItem>
                <SelectItem value="Guesser">Guesser</SelectItem>
                <SelectItem value="Struggler">Struggler</SelectItem>
                <SelectItem value="On Track">On Track</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Click <b>Run Clustering</b> to load data and compute clusters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Cluster */}
                    <TableHead>
                      <div className="flex items-center gap-2">
                        Cluster
                        <ColumnSorter
                          onAsc={() =>
                            setSort({ key: "displayLabel", dir: "asc" })
                          }
                          onDesc={() =>
                            setSort({ key: "displayLabel", dir: "desc" })
                          }
                          activeAsc={
                            sort.key === "displayLabel" && sort.dir === "asc"
                          }
                          activeDesc={
                            sort.key === "displayLabel" && sort.dir === "desc"
                          }
                        />
                      </div>
                    </TableHead>

                    {/* Student */}
                    <TableHead>
                      <div className="flex items-center gap-2">
                        Student
                        <ColumnSorter
                          onAsc={() =>
                            setSort({ key: "studentName", dir: "asc" })
                          }
                          onDesc={() =>
                            setSort({ key: "studentName", dir: "desc" })
                          }
                          activeAsc={
                            sort.key === "studentName" && sort.dir === "asc"
                          }
                          activeDesc={
                            sort.key === "studentName" && sort.dir === "desc"
                          }
                        />
                      </div>
                    </TableHead>

                    {/* Section */}
                    <TableHead>
                      <div className="flex items-center gap-2">
                        Section
                        <ColumnSorter
                          onAsc={() =>
                            setSort({ key: "sectionCode", dir: "asc" })
                          }
                          onDesc={() =>
                            setSort({ key: "sectionCode", dir: "desc" })
                          }
                          activeAsc={
                            sort.key === "sectionCode" && sort.dir === "asc"
                          }
                          activeDesc={
                            sort.key === "sectionCode" && sort.dir === "desc"
                          }
                        />
                      </div>
                    </TableHead>

                    {/* Quizzes Taken */}
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        Quizzes Taken
                        <ColumnSorter
                          onAsc={() =>
                            setSort({ key: "totalQuizzes", dir: "asc" })
                          }
                          onDesc={() =>
                            setSort({ key: "totalQuizzes", dir: "desc" })
                          }
                          activeAsc={
                            sort.key === "totalQuizzes" && sort.dir === "asc"
                          }
                          activeDesc={
                            sort.key === "totalQuizzes" && sort.dir === "desc"
                          }
                        />
                      </div>
                    </TableHead>

                    {/* Avg Pace */}
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        Avg Pace (s/Q)
                        <ColumnSorter
                          onAsc={() =>
                            setSort({ key: "avgTimePerQuestion", dir: "asc" })
                          }
                          onDesc={() =>
                            setSort({ key: "avgTimePerQuestion", dir: "desc" })
                          }
                          activeAsc={
                            sort.key === "avgTimePerQuestion" &&
                            sort.dir === "asc"
                          }
                          activeDesc={
                            sort.key === "avgTimePerQuestion" &&
                            sort.dir === "desc"
                          }
                        />
                      </div>
                    </TableHead>

                    {/* Avg Score */}
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        Avg Score (%)
                        <ColumnSorter
                          onAsc={() =>
                            setSort({ key: "avgScorePct", dir: "asc" })
                          }
                          onDesc={() =>
                            setSort({ key: "avgScorePct", dir: "desc" })
                          }
                          activeAsc={
                            sort.key === "avgScorePct" && sort.dir === "asc"
                          }
                          activeDesc={
                            sort.key === "avgScorePct" && sort.dir === "desc"
                          }
                        />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rowsToShow.map((s) => (
                    <TableRow key={`${s.studentKey}-${s.cluster}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ background: LABEL_COLORS[s.displayLabel] }}
                          />
                          <span>{s.displayLabel}</span>
                        </div>
                      </TableCell>

                      <TableCell className="font-medium">
                        {s.studentName}
                      </TableCell>

                      <TableCell>
                        {s.sectionId
                          ? sectionCodeMap.get(s.sectionId) ?? "—"
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {s.totalQuizzes}
                      </TableCell>

                      <TableCell className="text-right">
                        {s.avgTimePerQuestion.toFixed(2)}
                      </TableCell>

                      <TableCell className="text-right">
                        {s.avgScorePct.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                <TableCaption className="text-left">
                  Centroids (z-space):{" "}
                  {centroids.length
                    ? centroids
                        .map(
                          (c, idx) =>
                            `[${idx + 1}] score_z=${c[0].toFixed(
                              2
                            )}, time_z=${c[1].toFixed(
                              2
                            )}, quizzes_z=${c[2].toFixed(2)}`
                        )
                        .join("  |  ")
                    : "—"}
                </TableCaption>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}