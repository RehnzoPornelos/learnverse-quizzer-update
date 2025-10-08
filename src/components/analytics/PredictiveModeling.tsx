import { useState, useEffect, useCallback } from "react";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Upload, FileSpreadsheet, LightbulbIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast"; // shadcn toast (if available)
import { useRef } from "react";

// ---- Types (superset) ----
interface StudentFeature {
  studentKey: string; // "<student_name_norm>|<section_label>"
  avgScorePct: number;
  avgTimePerQuestion: number;
  totalQuizzes: number;
}
interface ClusterStat {
  label: string;
  count: number;
  percent: number;
}
interface HardQuiz {
  title: string;
  avgScore: number;
  attempts: number;
}
interface HardQuestionRec {
  question: string;
  quizTitle: string;
  accuracy: number;
  avgTime: number;
}
interface RecommendationItem {
  title: string;
  description: string;
  actionItems: string[];
  priority: "high" | "medium" | "low";
}
type SectionId = string;
type QuizId = string;
type QuestionId = string;

type ImportedSheets = {
  // clustering_results
  clustering?: Array<{
    Cluster: string;
    Student: string;
    Section: string;
    "Quizzes Taken"?: number;
    "Avg Pace (s/Q)"?: number;
    "Avg Score (%)"?: number;
  }>;
  // analytics_student_performance
  perf?: Array<{
    id: string;
    quiz_id: QuizId;
    score: number;
    completion_time_seconds: number;
    created_at: string;
    student_name: string;
    student_name_norm: string;
    attempt_no: number;
    section_id: SectionId;
  }>;
  // quizzes
  quizzes?: Array<{
    id: QuizId;
    title: string;
    question_no: number;
    published?: any;
    user_id?: string;
  }>;
  // quiz_questions
  questions?: Array<{
    id: QuestionId;
    quiz_id: QuizId;
    text: string;
    type: string;
    correct_answer?: string;
    order_position?: number;
  }>;
  // quiz_responses_summary
  qsummary?: Array<{
    question_id: QuestionId;
    quiz_id: QuizId;
    type: string;
    text: string;
    attempts: number;
    correct: number;
    wrong: number;
    avg_time_spent_seconds: number;
    accuracy_percent: number;
  }>;
  // class_sections
  sections?: Array<{
    id: SectionId;
    code?: string;
    name?: string;
    title?: string;
  }>;
};

// ---------- Component ----------
const Recommendations = () => {
  const { toast } = useToast?.() ?? {
    toast: (opts: any) =>
      window.alert(opts?.description || opts?.title || "Error"),
  };
  // UI state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [clusterStats, setClusterStats] = useState<ClusterStat[]>([]);
  const [hardQuizzes, setHardQuizzes] = useState<HardQuiz[]>([]);
  const [hardQuestionsRec, setHardQuestionsRec] = useState<HardQuestionRec[]>(
    []
  );
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    []
  );
  const [scoreTrend, setScoreTrend] = useState<
    { month: string; avgScore: number }[]
  >([]);

  // Import state
  const [importMeta, setImportMeta] = useState<{
    filename?: string;
    rows?: number;
  } | null>(null);
  const [imported, setImported] = useState<ImportedSheets | null>(null);
  const [prescriptions, setPrescriptions] = useState<{
    perSection: Array<{
      section: string;
      worstQuizzes: Array<{ quiz: string; avgPct: number }>;
      commendations: Array<{ quiz: string; avgPct: number }>;
    }>;
    crossSectionFlags: Array<{
      quiz: string;
      worstSection: string;
      bestSection: string;
      gapPct: number;
      hint: string;
    }>;
    strugglers: Array<{
      section: string;
      student: string;
      avgScore?: number;
      avgPace?: number;
    }>;
    guessersOneTime: Array<{ section: string; student: string }>;
    guessersMulti: Array<{
      section: string;
      student: string;
      quizzesTaken?: number;
    }>;
  }>({
    perSection: [],
    crossSectionFlags: [],
    strugglers: [],
    guessersOneTime: [],
    guessersMulti: [],
  });

  const isExcelFile = (file: File) => {
    const okExt = /\.xlsx?$/.test(file.name.toLowerCase());
    const okMime = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ].includes(file.type);
    return okExt || okMime;
  };

  // --------- Import handler ----------
  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });

    const get = (name: string) => {
      const ws = wb.Sheets[name];
      return ws ? (XLSX.utils.sheet_to_json(ws) as any[]) : [];
    };

    const importedSheets: ImportedSheets = {
      clustering: get("clustering_results"),
      perf: get("analytics_student_performance"),
      quizzes: get("quizzes"),
      questions: get("quiz_questions"),
      qsummary: get("quiz_responses_summary"),
      sections: get("class_sections"),
    };

    setImported(importedSheets);
    const totalRows =
      (importedSheets.clustering?.length || 0) +
      (importedSheets.perf?.length || 0) +
      (importedSheets.quizzes?.length || 0) +
      (importedSheets.questions?.length || 0) +
      (importedSheets.qsummary?.length || 0);
    setImportMeta({ filename: file.name, rows: totalRows });
    setIsLoading(false);
  }, []);

  // --------- Shared helpers ----------
  const quantile = (arr: number[], q: number) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * q;
    const lo = Math.floor(idx),
      hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const h = idx - lo;
    return sorted[lo] * (1 - h) + sorted[hi] * h;
  };

  // --------- Imported-data pipeline ----------
  const runImportedPipeline = useCallback(() => {
    if (!imported || !imported.quizzes?.length) {
      // reset
      setClusterStats([]);
      setHardQuizzes([]);
      setHardQuestionsRec([]);
      setRecommendations([]);
      setScoreTrend([]);
      setPrescriptions({
        perSection: [],
        crossSectionFlags: [],
        strugglers: [],
        guessersOneTime: [],
        guessersMulti: [],
      });
      return;
    }

    const {
      clustering = [],
      perf = [],
      quizzes = [],
      qsummary = [],
      sections = [],
    } = imported;

    // section label mapping (prefer code -> name -> title)
    const secLabelById: Record<string, string> = {};
    sections.forEach((s) => {
      const label = (s.code || s.name || s.title || "").toString().trim();
      if (s.id && label) secLabelById[s.id] = label;
    });
    const showSection = (val: string) => secLabelById[val] || val;

    // quiz metadata
    const qTitle: Record<string, string> = {};
    const qQuestionCount: Record<string, number> = {};
    quizzes.forEach((q) => {
      qTitle[q.id] = q.title;
      qQuestionCount[q.id] = Number(q.question_no ?? 0);
    });
    const publishedIds = new Set(Object.keys(qTitle)); // treat all imported as available

    // aggregate per student
    type Agg = {
      scoreList: number[];
      timeSum: number;
      questionSum: number;
      quizSet: Set<string>;
    };
    const perStudent: Record<string, Agg> = {};
    (perf || []).forEach((r) => {
      if (!publishedIds.has(r.quiz_id)) return;
      const sec = showSection(r.section_id) || "Unknown";
      const key = `${(
        r.student_name_norm ??
        r.student_name ??
        ""
      ).trim()}|${sec}`;
      perStudent[key] = perStudent[key] || {
        scoreList: [],
        timeSum: 0,
        questionSum: 0,
        quizSet: new Set(),
      };
      const qn = qQuestionCount[r.quiz_id] ?? 0;
      const pct = qn > 0 ? (Number(r.score ?? 0) / qn) * 100 : 0;
      perStudent[key].scoreList.push(pct);
      perStudent[key].timeSum += Number(r.completion_time_seconds ?? 0);
      perStudent[key].questionSum += qn;
      perStudent[key].quizSet.add(r.quiz_id);
    });

    const features: StudentFeature[] = Object.entries(perStudent).map(
      ([key, agg]) => {
        const avgScore = agg.scoreList.length
          ? agg.scoreList.reduce((a, b) => a + b, 0) / agg.scoreList.length
          : 0;
        const avgPace = agg.questionSum > 0 ? agg.timeSum / agg.questionSum : 0;
        return {
          studentKey: key,
          avgScorePct: Math.round(avgScore * 100) / 100,
          avgTimePerQuestion: Math.round(avgPace * 100) / 100,
          totalQuizzes: agg.quizSet.size,
        };
      }
    );

    // thresholds (robust)
    const scores = features.map((f) => f.avgScorePct).filter(Number.isFinite);
    const times = features
      .map((f) => f.avgTimePerQuestion)
      .filter(Number.isFinite);
    let SCORE_HI = 75,
      TIME_FAST = 25;
    if (features.length >= 20) {
      SCORE_HI = quantile(scores, 0.6);
      TIME_FAST = quantile(times, 0.4);
    }
    const labelByThresholds = (score: number, time: number) => {
      const hi = score >= SCORE_HI,
        fast = time <= TIME_FAST;
      if (hi && fast) return "High Achiever";
      if (!hi && fast) return "Guesser";
      if (!hi && !fast) return "Struggler";
      return "On Track";
    };

    // cluster stats (prefer explicit clustering sheet if present)
    const clusteringRows = clustering.length
      ? clustering.map((row) => {
          const secPretty = showSection(row.Section || "Unknown");
          const key = `${(row.Student || "")
            .toString()
            .trim()
            .toLowerCase()}|${secPretty}`;
          return {
            key,
            label: row.Cluster,
            quizzesTaken: Number(row["Quizzes Taken"] || 0),
          };
        })
      : features.map((f) => ({
          key: f.studentKey,
          label: labelByThresholds(f.avgScorePct, f.avgTimePerQuestion),
          quizzesTaken: f.totalQuizzes,
        }));

    const counts: Record<string, number> = {
      "High Achiever": 0,
      Guesser: 0,
      Struggler: 0,
      "On Track": 0,
    };
    clusteringRows.forEach((r) => {
      counts[r.label] = (counts[r.label] || 0) + 1;
    });
    const totalStudents = clusteringRows.length || 1;
    const clusterArray: ClusterStat[] = Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        percent: Math.round((count / totalStudents) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
    setClusterStats(clusterArray);

    // hard quizzes from perf
    const perfAgg: Record<string, { scoreSum: number; count: number }> = {};
    (perf || []).forEach((r) => {
      if (!publishedIds.has(r.quiz_id)) return;
      perfAgg[r.quiz_id] = perfAgg[r.quiz_id] || { scoreSum: 0, count: 0 };
      perfAgg[r.quiz_id].scoreSum += Number(r.score ?? 0);
      perfAgg[r.quiz_id].count += 1;
    });
    const quizzesRank: HardQuiz[] = Object.keys(perfAgg)
      .map((qid) => {
        const agg = perfAgg[qid];
        const qn = qQuestionCount[qid] ?? 0;
        const attempts = agg.count;
        const avgScore =
          attempts > 0 && qn > 0 ? (agg.scoreSum / (attempts * qn)) * 100 : 0;
        return {
          title: qTitle[qid] || "Unknown",
          avgScore: Math.round(avgScore * 100) / 100,
          attempts,
        };
      })
      .sort((a, b) => a.avgScore - b.avgScore);
    setHardQuizzes(quizzesRank.slice(0, Math.min(3, quizzesRank.length)));

    // hard questions from summary
    const qStats: HardQuestionRec[] = (imported.qsummary || [])
      .filter((r) => r.attempts >= 3)
      .map((r) => ({
        question: r.text,
        quizTitle: qTitle[r.quiz_id] || "Unknown",
        accuracy: Math.round((Number(r.accuracy_percent) || 0) * 100) / 100,
        avgTime:
          Math.round((Number(r.avg_time_spent_seconds) || 0) * 100) / 100,
      }))
      .sort((a, b) =>
        a.accuracy === b.accuracy
          ? b.avgTime - a.avgTime
          : a.accuracy - b.accuracy
      );
    setHardQuestionsRec(qStats.slice(0, Math.min(5, qStats.length)));

    // trend (by month)
    const trendMap: Record<
      string,
      { scoreSum: number; count: number; denom: number }
    > = {};
    (perf || []).forEach((r) => {
      if (!publishedIds.has(r.quiz_id)) return;
      const d = new Date(r.created_at);
      if (isNaN(d.getTime())) return;
      const key =
        d.toLocaleString("default", { month: "short" }) +
        " " +
        (d.getFullYear() + "").slice(-2);
      trendMap[key] = trendMap[key] || { scoreSum: 0, count: 0, denom: 0 };
      trendMap[key].scoreSum += Number(r.score || 0);
      trendMap[key].count += 1;
      trendMap[key].denom += qQuestionCount[r.quiz_id] || 0;
    });
    const trendPoints = Object.entries(trendMap)
      .map(([month, agg]) => {
        const pct = agg.denom > 0 ? (agg.scoreSum / agg.denom) * 100 : 0;
        return { month, avgScore: Math.round(pct * 10) / 10 };
      })
      .sort((a, b) => {
        const parse = (k: string) => {
          const [m, yy] = k.split(" ");
          return {
            y: parseInt("20" + yy),
            m: new Date(m + " 1, 2000").getMonth(),
          };
        };
        const A = parse(a.month),
          B = parse(b.month);
        return A.y === B.y ? A.m - B.m : A.y - B.y;
      });
    setScoreTrend(trendPoints);

    // prescriptions
    const secQuiz: Record<
      string,
      Record<string, { sum: number; denom: number; cnt: number }>
    > = {};
    (perf || []).forEach((r) => {
      if (!publishedIds.has(r.quiz_id)) return;
      const secName = showSection(r.section_id) || "Unknown";
      const qn = qQuestionCount[r.quiz_id] || 0;
      if (!secQuiz[secName]) secQuiz[secName] = {};
      if (!secQuiz[secName][r.quiz_id])
        secQuiz[secName][r.quiz_id] = { sum: 0, denom: 0, cnt: 0 };
      secQuiz[secName][r.quiz_id].sum += Number(r.score || 0);
      secQuiz[secName][r.quiz_id].denom += qn;
      secQuiz[secName][r.quiz_id].cnt += 1;
    });

    const perSection = Object.entries(secQuiz).map(([section, byQuiz]) => {
      const rows = Object.entries(byQuiz)
        .map(([qid, agg]) => {
          const pct = agg.denom > 0 ? (agg.sum / agg.denom) * 100 : 0;
          return { quiz: qTitle[qid] || "Unknown", pct };
        })
        .sort((a, b) => a.pct - b.pct);
      const worst = rows
        .slice(0, Math.min(3, rows.length))
        .map((r) => ({ quiz: r.quiz, avgPct: Math.round(r.pct * 100) / 100 }));
      const best = rows
        .slice(-3)
        .reverse()
        .map((r) => ({ quiz: r.quiz, avgPct: Math.round(r.pct * 100) / 100 }));
      return {
        section,
        worstQuizzes: worst,
        commendations: best.filter((x) => x.avgPct >= 80),
      };
    });

    const quizBySectionPct: Record<
      string,
      Array<{ section: string; pct: number }>
    > = {};
    Object.entries(secQuiz).forEach(([sec, byQuiz]) => {
      Object.entries(byQuiz).forEach(([qid, agg]) => {
        const pct = agg.denom > 0 ? (agg.sum / agg.denom) * 100 : 0;
        (quizBySectionPct[qid] ||= []).push({ section: sec, pct });
      });
    });
    const crossSectionFlags: Array<{
      quiz: string;
      worstSection: string;
      bestSection: string;
      gapPct: number;
      hint: string;
    }> = [];
    Object.entries(quizBySectionPct).forEach(([qid, list]) => {
      if (list.length < 2) return;
      const sorted = [...list].sort((a, b) => a.pct - b.pct);
      const worst = sorted[0],
        best = sorted[sorted.length - 1];
      const gap = Math.round((best.pct - worst.pct) * 10) / 10;
      if (gap >= 10) {
        crossSectionFlags.push({
          quiz: qTitle[qid] || "Unknown",
          worstSection: worst.section,
          bestSection: best.section,
          gapPct: gap,
          hint: `Re-teach topics for ${worst.section}; borrow materials/approach that worked in ${best.section}.`,
        });
      }
    });

    const strugglers: Array<{
      section: string;
      student: string;
      avgScore?: number;
      avgPace?: number;
    }> = [];
    const guessersOneTime: Array<{ section: string; student: string }> = [];
    const guessersMulti: Array<{
      section: string;
      student: string;
      quizzesTaken?: number;
    }> = [];

    const clusteringIndex = new Map(clusteringRows.map((r) => [r.key, r]));
    features.forEach((f) => {
      const [student, section] = f.studentKey.split("|");
      const row = clusteringIndex.get(f.studentKey);
      const label =
        row?.label ?? labelByThresholds(f.avgScorePct, f.avgTimePerQuestion);
      if (label === "Struggler") {
        strugglers.push({
          section,
          student,
          avgScore: f.avgScorePct,
          avgPace: f.avgTimePerQuestion,
        });
      } else if (label === "Guesser") {
        const qt = row?.quizzesTaken ?? f.totalQuizzes ?? 0;
        if (qt <= 1) guessersOneTime.push({ section, student });
        else guessersMulti.push({ section, student, quizzesTaken: qt });
      }
    });

    const recs: RecommendationItem[] = [];
    perSection.forEach((sec) => {
      if (sec.worstQuizzes.length) {
        const list = sec.worstQuizzes
          .map((w) => `${w.quiz} (${w.avgPct.toFixed(1)}%)`)
          .join(", ");
        recs.push({
          title: `Re-teach weak topics in ${sec.section}`,
          description: `These quizzes show the lowest averages in ${sec.section}: ${list}. Compare with sections where the same quiz is stronger to adapt strategies.`,
          actionItems: [
            "Run a focused review session for the underlying topics.",
            "Share exemplars/solutions; check item clarity and distractors.",
            "Offer a short remedial practice set before retaking.",
          ],
          priority: "high",
        });
      }
      if (sec.commendations.length) {
        const list = sec.commendations
          .map((c) => `${c.quiz} (${c.avgPct.toFixed(1)}%)`)
          .join(", ");
        recs.push({
          title: `Commendation for ${sec.section}`,
          description: `Students excelled in: ${list}. Preserve the teaching approach/materials used here.`,
          actionItems: [
            "Document the lesson flow/resources used.",
            "Encourage students to mentor peers in weaker areas.",
          ],
          priority: "low",
        });
      }
    });
    crossSectionFlags.forEach((f) => {
      recs.push({
        title: `Cross-section gap on “${f.quiz}” (${f.gapPct}% gap)`,
        description: `${f.worstSection} lags behind ${f.bestSection} on this quiz. ${f.hint}`,
        actionItems: [
          "Compare lecture pacing and pre-quiz review routines.",
          "Audit the wording of ambiguous items; harmonize rubrics.",
          "Create a joint review worksheet for the weakest subtopics.",
        ],
        priority: "medium",
      });
    });
    if (!recs.length) {
      recs.push({
        title: "Collect more data",
        description:
          "Insights are limited by sample size. Encourage an additional quiz or two.",
        actionItems: [
          "Run a short diagnostic per topic cluster.",
          "Ensure all sections attempt the same core quizzes.",
        ],
        priority: "low",
      });
    }

    setRecommendations(recs);
    setPrescriptions({
      perSection,
      crossSectionFlags,
      strugglers,
      guessersOneTime,
      guessersMulti,
    });
  }, [imported]);

  useEffect(() => {
    runImportedPipeline();
  }, [imported, runImportedPipeline]);

  // ---- drag & drop ----
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!isExcelFile(f)) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: "Please drop an Excel file (.xlsx or .xls).",
      });
      return;
    }
    handleFile(f);
  };

  const hasData = !!(imported && imported.quizzes && imported.quizzes.length);

  return (
    <div className="space-y-6">
      {/* IMPORT DATA */}
      <Card>
        <CardHeader className="flex items-center justify-between md:flex-row gap-3">
          <div>
            <CardTitle>Import clustering workbook</CardTitle>
            <CardDescription>
              Drop your exported{" "}
              <span className="font-medium">Student_Cluster_Data_*.xlsx</span>{" "}
              here to generate analytics.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2
             bg-muted/40 border border-border
             hover:bg-violet-500 hover:text-white
             active:bg-violet-600
             transition-colors"
            title="Choose Excel file"
          >
            <Upload className="h-4 w-4" />
            <span>Choose file</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!isExcelFile(f)) {
                toast({
                  variant: "destructive",
                  title: "Invalid file",
                  description: "Please upload an Excel file (.xlsx or .xls).",
                });
                e.currentTarget.value = ""; // reset picker
                return;
              }
              handleFile(f);
            }}
          />
        </CardHeader>
        <CardContent>
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="border-2 border-dashed rounded-xl p-6 text-center hover:bg-muted/40"
          >
            <FileSpreadsheet className="h-6 w-6 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">
              Drag & drop the Student Cluster Data exported from Students Tab
              here.
            </div>
            {importMeta?.filename ? (
              <div className="mt-2 text-xs">
                Loaded{" "}
                <span className="font-medium">{importMeta.filename}</span> (
                {importMeta.rows} rows).
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                No dataset imported yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Show nothing else until a file is imported */}
      {!hasData ? null : (
        <>
          {/* Student cluster distribution + trend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Student Performance Segments</CardTitle>
                <CardDescription>
                  Distribution of learners by performance level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={clusterStats}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis yAxisId="left" allowDecimals={false} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(v: any, name: string) =>
                          name === "count"
                            ? [`${v}`, "Students"]
                            : name === "percent"
                            ? [`${v}%`, "Percent"]
                            : [v, name]
                        }
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="count"
                        name="Count"
                        fill="#60a5fa"
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="percent"
                        name="Percent"
                        fill="#fbbf24"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Quiz Score Trend</CardTitle>
                <CardDescription>
                  Historical average quiz scores across months
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={scoreTrend}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip formatter={(v: any) => [`${v}%`, "Avg Score"]} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        name="Average Score (%)"
                        dot={{ r: 4 }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hard quizzes & questions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Challenging Quizzes</CardTitle>
                <CardDescription>
                  Quizzes with the lowest average scores
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quiz</TableHead>
                        <TableHead className="text-right">
                          Avg Score (%)
                        </TableHead>
                        <TableHead className="text-right">Attempts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hardQuizzes.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-muted-foreground"
                          >
                            No quiz data available.
                          </TableCell>
                        </TableRow>
                      ) : (
                        hardQuizzes.map((q, idx) => (
                          <TableRow key={idx}>
                            <TableCell
                              className="font-medium truncate max-w-[180px]"
                              title={q.title}
                            >
                              {q.title}
                            </TableCell>
                            <TableCell className="text-right">
                              {q.avgScore.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {q.attempts}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Challenging Questions</CardTitle>
                <CardDescription>
                  Lowest accuracy / longest time questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Question</TableHead>
                        <TableHead>Quiz</TableHead>
                        <TableHead className="text-right">
                          Accuracy (%)
                        </TableHead>
                        <TableHead className="text-right">
                          Avg Time (s)
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hardQuestionsRec.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-muted-foreground"
                          >
                            No question data available.
                          </TableCell>
                        </TableRow>
                      ) : (
                        hardQuestionsRec.map((q, idx) => (
                          <TableRow key={idx}>
                            <TableCell
                              className="truncate max-w-[260px]"
                              title={q.question}
                            >
                              {q.question.length > 80
                                ? `${q.question.slice(0, 77)}…`
                                : q.question}
                            </TableCell>
                            <TableCell
                              className="truncate max-w-[180px]"
                              title={q.quizTitle}
                            >
                              {q.quizTitle}
                            </TableCell>
                            <TableCell className="text-right">
                              {q.accuracy.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {q.avgTime.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card>
            <CardHeader className="flex items-center gap-2">
              <LightbulbIcon className="h-5 w-5" />
              <div>
                <CardTitle>Instructor Recommendations</CardTitle>
                <CardDescription>
                  Data-driven guidance to enhance learning outcomes
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {recommendations.length === 0 ? (
                  <p className="text-muted-foreground">
                    No recommendations available.
                  </p>
                ) : (
                  recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="border-l-4 pl-4 py-1"
                      style={{
                        borderColor:
                          rec.priority === "high"
                            ? "rgb(239,68,68)"
                            : rec.priority === "medium"
                            ? "rgb(234,179,8)"
                            : "rgb(34,197,94)",
                      }}
                    >
                      <h4 className="text-lg font-medium mb-2">{rec.title}</h4>
                      <p className="text-muted-foreground mb-3">
                        {rec.description}
                      </p>
                      <ul className="space-y-1">
                        {rec.actionItems.map((a, i) => (
                          <li key={i} className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 text-xs inline-flex">
                        <span
                          className={`uppercase font-semibold rounded-full px-2 py-0.5 ${
                            rec.priority === "high"
                              ? "bg-red-100 text-red-800"
                              : rec.priority === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {rec.priority} priority
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Per-section prescriptions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Per-Section: Quizzes to Re-teach</CardTitle>
                <CardDescription>
                  Lowest average quizzes per section
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section</TableHead>
                        <TableHead>Weak Quizzes (avg %)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.perSection.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-center text-muted-foreground"
                          >
                            No imported prescriptions yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.perSection.map((s, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {s.section}
                            </TableCell>
                            <TableCell>
                              {s.worstQuizzes.length
                                ? s.worstQuizzes
                                    .map(
                                      (w) =>
                                        `${w.quiz} (${w.avgPct.toFixed(1)}%)`
                                    )
                                    .join(", ")
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Per-Section: Commendations</CardTitle>
                <CardDescription>
                  High-performing quizzes (≥80%)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section</TableHead>
                        <TableHead>Strong Quizzes (avg %)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.perSection.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-center text-muted-foreground"
                          >
                            No imported prescriptions yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.perSection.map((s, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {s.section}
                            </TableCell>
                            <TableCell>
                              {s.commendations.length
                                ? s.commendations
                                    .map(
                                      (c) =>
                                        `${c.quiz} (${c.avgPct.toFixed(1)}%)`
                                    )
                                    .join(", ")
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cross-section flags */}
          <Card>
            <CardHeader>
              <CardTitle>Cross-Section Gaps</CardTitle>
              <CardDescription>
                Same quiz, different sections—big performance gaps
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quiz</TableHead>
                      <TableHead>Best → Worst Section</TableHead>
                      <TableHead className="text-right">Gap (pp)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.crossSectionFlags.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          No significant gaps detected.
                        </TableCell>
                      </TableRow>
                    ) : (
                      prescriptions.crossSectionFlags.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            {r.quiz}
                          </TableCell>
                          <TableCell>
                            {r.bestSection} → {r.worstSection}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.gapPct.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Cluster details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Strugglers</CardTitle>
                <CardDescription>
                  Students needing the most support
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead className="text-right">~Avg %</TableHead>
                        <TableHead className="text-right">Pace (s/Q)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.strugglers.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-muted-foreground"
                          >
                            None detected.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.strugglers.map((s, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {s.student}
                            </TableCell>
                            <TableCell>{s.section}</TableCell>
                            <TableCell className="text-right">
                              {s.avgScore?.toFixed(1) ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {s.avgPace?.toFixed(1) ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guessers (One-time)</CardTitle>
                <CardDescription>
                  Likely accidental or quiz-specific
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Section</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.guessersOneTime.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-center text-muted-foreground"
                          >
                            None detected.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.guessersOneTime.map((g, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {g.student}
                            </TableCell>
                            <TableCell>{g.section}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guessers (Multi-time)</CardTitle>
                <CardDescription>
                  Consistent pattern—needs coaching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead className="text-right">Quizzes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.guessersMulti.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-muted-foreground"
                          >
                            None detected.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.guessersMulti.map((g, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {g.student}
                            </TableCell>
                            <TableCell>{g.section}</TableCell>
                            <TableCell className="text-right">
                              {g.quizzesTaken ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Recommendations;
