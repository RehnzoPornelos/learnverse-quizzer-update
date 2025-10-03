import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/layout/Navbar";
import {
  getQuizWithQuestions,
  getQuizEligibleSections,
  getQuizAnalytics,
  getStudentPerformanceList,
  getStudentPerformanceDetails,
  // — New (add these in quizService.ts). UI will still work if they throw.
  getQuestionStats,
  deleteStudentSubmission
} from "@/services/quizService";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Loader2,
  ArrowLeft,
  Download,
  LineChart,
  UserRound,
  BarChart3,
  ChevronUp, 
  ChevronDown,
  Search
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

/* -----------------------------------------------------------
   Small helpers
----------------------------------------------------------- */

type BucketCounts = { excellent: number; good: number; average: number; poor: number };

const formatSecs = (s?: number) => {
  if (s == null || Number.isNaN(s)) return "—";
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
};

// Stacked horizontal bar for correct vs incorrect (side-by-side).
const StackedBar = ({ correctPct }: { correctPct: number }) => {
  const c = Math.max(0, Math.min(100, Math.round(correctPct))); // correct
  const i = 100 - c;                                            // incorrect
  return (
    <div className="w-full h-3 rounded bg-muted overflow-hidden flex">
      {/* incorrect on the left */}
      <div className="h-full bg-orange-400 shrink-0" style={{ width: `${i}%` }} />
      {/* correct on the right */}
      <div className="h-full bg-green-500 shrink-0" style={{ width: `${c}%` }} />
    </div>
  );
};

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
  <div className="flex flex-col leading-none">
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
      className={`p-1 rounded hover:bg-muted transition -mt-0.5 ${
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

const ScorePill = ({ v }: { v: number }) => (
  <span className={v >= 75 ? "text-green-600" : "text-amber-600"}>{v}%</span>
);

/* -----------------------------------------------------------
   Component
----------------------------------------------------------- */

const QuizResults = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Sections linked to this quiz (for filtering)
  const [sections, setSections] = useState<Array<{ id: string; code: string }>>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const [studentQuery, setStudentQuery] = useState("");

  // Aggregate stats
  const [stats, setStats] = useState<{
    averageScore: number;
    studentsCompleted: number;
    totalStudents: number;
  }>({ averageScore: 0, studentsCompleted: 0, totalStudents: 0 });

  // Student rows
  const [studentPerformances, setStudentPerformances] = useState<any[]>([]);

  // New data for tabs
  const [qStats, setQStats] = useState<
    Array<{
      questionId: string;
      text: string;
      questionType?: string;      // ← add this
      correct: number;
      incorrect: number;
      avgTimeSeconds?: number;
      difficulty?: string | null;
      optionsBreakdown?: Record<string, number>;
    }>
  >([]);

  // Student detail modal
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [detailStudentName, setDetailStudentName] = useState<string>("");
  const [sectionLoading, setSectionLoading] = useState(false);

  // === Sorting (Student table) ===
  type SortKey = "student" | "score" | "completed" | "time";
  type SortDir = "asc" | "desc";

  const [sortBy, setSortBy] = useState<SortKey>("student");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const setSort = (key: SortKey, dir: SortDir) => {
    setSortBy(key);
    setSortDir(dir);
  };

  // === Sorting (Questions table) ===
  type QSortKey = "type" | "pct" | "avg" | "diff";
  const [qSortBy, setQSortBy] = useState<QSortKey>("pct");
  const [qSortDir, setQSortDir] = useState<SortDir>("desc"); // default: highest % first

  const setQSort = (key: QSortKey, dir: SortDir) => {
    setQSortBy(key);
    setQSortDir(dir);
  };

  // Delete dialog state
const [confirmOpen, setConfirmOpen] = useState(false);
const [deletingId, setDeletingId] = useState<string | null>(null);

  // Ask to delete (opens confirm)
  const requestDelete = (perfId: string) => {
    setDeletingId(perfId);
    setConfirmOpen(true);
  };

  // After confirm, delete then refresh the list
  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    const perfId = deletingId;
    setConfirmOpen(false);

    const res = await deleteStudentSubmission(perfId);
    
    if (res.ok) {
      const r = res.counts || { responses_deleted: 0, performance_deleted: 0 };
      toast.success(`Deleted attempt. Responses: ${r.responses_deleted}`);
      setStudentPerformances(prev => prev.filter(p => p.id !== perfId));

      // Refresh the main list after delete
      try {
        const refreshed = await getStudentPerformanceList(quiz.id, selectedSectionId || undefined);
        setStudentPerformances(refreshed);

        // optional: refresh KPI
        const refreshedStats = await getQuizAnalytics(quiz.id, selectedSectionId || undefined);
        setStats(refreshedStats);
      } catch (e) {
        console.error(e);
      }
    } else {
      toast.error(res.message || "Delete failed.");
    }
    setDeletingId(null);
  };

// Difficulty rank for sorting (lower = "easier")
const diffRank = (d?: string | null) => {
  switch (String(d ?? "").toLowerCase()) {
    case "easy": return 0;
    case "moderate": return 1;
    case "hard": return 2;
    case "very hard": return 3;
    default: return 2; // neutral
  }
};

// Pre-compute derived fields for sorting
const qRows = useMemo(() => {
  return (qStats ?? []).map(q => {
    const total = q.correct + q.incorrect;
    const pct = total > 0 ? (q.correct / total) * 100 : 0;
    return {
      ...q,
      _pct: pct,
      _avg: Number(q.avgTimeSeconds ?? 0),
      _type: String(q.questionType ?? ""),
      _diff: diffRank(q.difficulty),
    };
  });
}, [qStats]);

const sortedQRows = useMemo(() => {
  const rows = [...qRows];
  rows.sort((a, b) => {
    let cmp = 0;
    switch (qSortBy) {
      case "type":
        cmp = a._type.localeCompare(b._type, undefined, { sensitivity: "base" });
        break;
      case "pct":
        cmp = a._pct - b._pct; // asc: 0 -> 100
        break;
      case "avg":
        // asc = slowest -> fastest (larger seconds first)
        cmp = b._avg - a._avg;
        break;
      case "diff":
        // asc = Easy -> Very Hard (0 -> 3)
        cmp = a._diff - b._diff;
        break;
    }
    return qSortDir === "asc" ? cmp : -cmp;
  });
  return rows;
}, [qRows, qSortBy, qSortDir]);

// "27m 5s" -> 1625 (seconds). Handles "Xm", "Xs", "Xm Ys", or empty.
const timeStrToSeconds = (s?: string) => {
  if (!s) return 0;
  const m = /(\d+)\s*m/.exec(s);
  const sec = /(\d+)\s*s/.exec(s);
  const mm = m ? parseInt(m[1], 10) : 0;
  const ss = sec ? parseInt(sec[1], 10) : 0;
  return mm * 60 + ss;
};

// Filter by name (case-insensitive)
const filteredStudents = useMemo(() => {
  const q = studentQuery.trim().toLowerCase();
  if (!q) return studentPerformances ?? [];
  return (studentPerformances ?? []).filter((s) =>
    String(s.student_name || "").toLowerCase().includes(q)
  );
}, [studentPerformances, studentQuery]);

// Then sort the filtered list
const sortedStudents = useMemo(() => {
  const rows = [...filteredStudents];
  rows.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "student") {
      cmp = String(a.student_name || "").localeCompare(
        String(b.student_name || ""), undefined, { sensitivity: "base" }
      );
    } else if (sortBy === "score") {
      cmp = Number(a.score || 0) - Number(b.score || 0);
    } else if (sortBy === "completed") {
      const at = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      cmp = at - bt;
    } else if (sortBy === "time") {
      cmp = timeStrToSeconds(a.timeSpent) - timeStrToSeconds(b.timeSpent);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return rows;
}, [filteredStudents, sortBy, sortDir]);

  /* -------------------- load quiz -------------------- */
  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      try {
        if (!id) return;
        const quizData = await getQuizWithQuestions(id);
        setQuiz(quizData);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load quiz data");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  /* -------------------- sections -------------------- */
  useEffect(() => {
    (async () => {
      if (!quiz) return;
      try {
        const sects = await getQuizEligibleSections(quiz.id);
        setSections(sects);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load sections");
      }
    })();
  }, [quiz]);

  /* -------- analytics + students + questions -------- */
useEffect(() => {
  if (!quiz) return;
  let cancelled = false;

  setSectionLoading(true);
  (async () => {
    try {
      const [analytics, perfList, qs] = await Promise.all([
        getQuizAnalytics(quiz.id, selectedSectionId || undefined),
        getStudentPerformanceList(quiz.id, selectedSectionId || undefined),
        getQuestionStats(quiz.id, selectedSectionId || undefined),
      ]);

      if (cancelled) return;
      setStats(analytics);
      setStudentPerformances(perfList);
      setQStats(qs || []);
    } catch (e) {
      if (!cancelled) {
        console.error(e);
        toast.error("Failed to load quiz analytics");
        setQStats([]);
        setStudentPerformances([]);
      }
    } finally {
      if (!cancelled) setSectionLoading(false);
    }
  })();

  return () => { cancelled = true; };
}, [quiz, selectedSectionId]);


   /* ---------- fallback: compute buckets from rows ---------- */
   /* ---------- buckets: use service result, else safe fallback ---------- */
    const computedBuckets: BucketCounts = useMemo(() => {
    const totalQuestions =
      (Array.isArray(quiz?.questions) ? quiz.questions.length : 0) ||
      (typeof quiz?.question_no === "number" ? quiz.question_no : 0);

    const acc: BucketCounts = { excellent: 0, good: 0, average: 0, poor: 0 };
    if (!studentPerformances?.length) return acc;

    for (const s of studentPerformances) {
      // s.score may be raw-correct or percent depending on your pipeline
      const raw = parseFloat(String(s.score));
      if (!Number.isFinite(raw)) continue;

      const pct =
        totalQuestions && raw <= totalQuestions ? (raw / totalQuestions) * 100
        : raw <= 100 ? raw
        : 0;

      const v = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
      if (v >= 90) acc.excellent++;
      else if (v >= 75) acc.good++;
      else if (v >= 60) acc.average++;
      else acc.poor++;
    }
    return acc;
  }, [studentPerformances, quiz]);

  /* -------------------- handlers -------------------- */
  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSectionId(e.target.value);
  };

  const handleViewDetails = async (student: any) => {
    try {
      const details = await getStudentPerformanceDetails(student.id);
      setDetailStudentName(student.student_name);
      setDetailRows(details);
      setDetailsOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load student details");
    }
  };

  const handleBackClick = () => navigate("/dashboard");

  /* -------------------- render -------------------- */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20"
    >
      <Navbar />
      <main className="pt-20">
        <div className="container-content py-8">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !quiz ? (
            <div className="text-center py-16">
              <h2 className="text-2xl font-bold">Quiz not found</h2>
              <Button className="mt-4" onClick={handleBackClick}>
                Back to Dashboard
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header + actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">Quiz Results</h1>
                  <p className="text-muted-foreground mt-1">{quiz.title}</p>
                </div>
                <div className="flex space-x-3">
                  <Button variant="outline" onClick={handleBackClick}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                  </Button>
                  <Button>
                    <Download className="mr-2 h-4 w-4" />
                    Export Results
                  </Button>
                </div>
              </div>

              {/* Section filter */}
              <div className="mt-4 flex items-center gap-2">
                <Label htmlFor="sectionSelect">Section:</Label>
                <select
                  id="sectionSelect"
                  value={selectedSectionId}
                  onChange={handleSectionChange}
                  disabled={sectionLoading}
                  aria-busy={sectionLoading}
                  className="p-2 border rounded-md bg-background text-foreground disabled:opacity-60"
                >
                  <option value="">All Sections</option>
                  {sections.map((sect) => (
                    <option key={sect.id} value={sect.id}>{sect.code}</option>
                  ))}
                </select>
                {sectionLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              {/* Tabs */}
        <div className="relative">
            {sectionLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            <div className={sectionLoading ? "pointer-events-none opacity-60" : ""}>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="questions">Questions</TabsTrigger>
                </TabsList>

                {/* ---------------- Overview ---------------- */}
                <TabsContent value="overview" className="space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                      <LineChart className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {stats.averageScore ? Math.round(stats.averageScore) : 0}%
                      </div>
                      <Progress value={stats.averageScore} className="h-2 mt-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        Across all submissions in scope
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Students Completed</CardTitle>
                      <UserRound className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stats.studentsCompleted}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Out of {stats.totalStudents} total students
                      </p>
                    </CardContent>
                  </Card>

                  {/* Score Distribution */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Score Distribution</CardTitle>
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-xl font-bold">{computedBuckets.excellent}</div>
                          <div className="text-xs text-muted-foreground">Excellent (90–100)</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold">{computedBuckets.good}</div>
                          <div className="text-xs text-muted-foreground">Good (75–89)</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold">{computedBuckets.average}</div>
                          <div className="text-xs text-muted-foreground">Average (60–74)</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold">{computedBuckets.poor}</div>
                          <div className="text-xs text-muted-foreground">Poor (&lt;60)</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Students table moved here */}
                <Card>
                  <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle>Student Performance</CardTitle>
                      <CardDescription>Detailed results for each student who completed the quiz</CardDescription>
                    </div>

                    {/* Search (adapts to light/dark via bg-background / text-foreground) */}
                    <div className="relative w-full md:w-72">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder="Search student..."
                        aria-label="Search student by name"
                        className="pl-8 bg-background text-foreground"
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableCaption>A list of student results for this quiz</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <div className="flex items-center gap-2">
                              Student
                              <ColumnSorter
                                onAsc={() => setSort("student", "asc")}
                                onDesc={() => setSort("student", "desc")}
                                activeAsc={sortBy === "student" && sortDir === "asc"}
                                activeDesc={sortBy === "student" && sortDir === "desc"}
                              />
                            </div>
                          </TableHead>

                          <TableHead>
                            <div className="flex items-center gap-2">
                              Score
                              <ColumnSorter
                                onAsc={() => setSort("score", "asc")}
                                onDesc={() => setSort("score", "desc")}
                                activeAsc={sortBy === "score" && sortDir === "asc"}
                                activeDesc={sortBy === "score" && sortDir === "desc"}
                              />
                            </div>
                          </TableHead>

                          <TableHead>
                            <div className="flex items-center gap-2">
                              Completed
                              <ColumnSorter
                                onAsc={() => setSort("completed", "asc")}
                                onDesc={() => setSort("completed", "desc")}
                                activeAsc={sortBy === "completed" && sortDir === "asc"}
                                activeDesc={sortBy === "completed" && sortDir === "desc"}
                              />
                            </div>
                          </TableHead>

                          <TableHead>
                            <div className="flex items-center gap-2">
                              Time Spent
                              <ColumnSorter
                                onAsc={() => setSort("time", "asc")}
                                onDesc={() => setSort("time", "desc")}
                                activeAsc={sortBy === "time" && sortDir === "asc"}
                                activeDesc={sortBy === "time" && sortDir === "desc"}
                              />
                            </div>
                          </TableHead>

                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {sortedStudents.length ? (
                            sortedStudents.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="font-medium">{s.student_name}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <ScorePill v={s.score} />
                                    <Progress value={s.score} className="w-16 h-2" />
                                  </div>
                                </TableCell>
                                <TableCell>{s.completedAt ? new Date(s.completedAt).toLocaleString() : "—"}</TableCell>
                                <TableCell>{s.timeSpent ?? "—"}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center gap-2 justify-end">
                                    <Button variant="ghost" size="sm" onClick={() => handleViewDetails(s)}>
                                      View Details
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => requestDelete(s.id)}  // s.id is the performance id
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>              
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-4">
                                No performance data found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                  </TabsContent>

                {/* ---------------- Questions ---------------- */}
                <TabsContent value="questions" className="space-y-6">

                  {/* Per-question table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Question Performance</CardTitle>
                      <CardDescription>
                        Correct vs Incorrect, average time, difficulty
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableCaption>Per-question performance for this quiz</TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>

                            <TableHead>Question</TableHead>

                            <TableHead>
                              <div className="flex items-center gap-2">
                                Question Type
                                <ColumnSorter
                                  onAsc={() => setQSort("type", "asc")}
                                  onDesc={() => setQSort("type", "desc")}
                                  activeAsc={qSortBy === "type" && qSortDir === "asc"}
                                  activeDesc={qSortBy === "type" && qSortDir === "desc"}
                                />
                              </div>
                            </TableHead>

                            <TableHead className="w-64">Correct vs Incorrect</TableHead>

                            <TableHead>
                              <div className="flex items-center gap-2">
                                % Correct
                                <ColumnSorter
                                  onAsc={() => setQSort("pct", "asc")}
                                  onDesc={() => setQSort("pct", "desc")}
                                  activeAsc={qSortBy === "pct" && qSortDir === "asc"}
                                  activeDesc={qSortBy === "pct" && qSortDir === "desc"}
                                />
                              </div>
                            </TableHead>

                            <TableHead>
                              <div className="flex items-center gap-2">
                                Avg Time
                                <ColumnSorter
                                  onAsc={() => setQSort("avg", "asc")}
                                  onDesc={() => setQSort("avg", "desc")}
                                  activeAsc={qSortBy === "avg" && qSortDir === "asc"}
                                  activeDesc={qSortBy === "avg" && qSortDir === "desc"}
                                />
                              </div>
                            </TableHead>

                            <TableHead>
                              <div className="flex items-center gap-2">
                                Difficulty
                                <ColumnSorter
                                  onAsc={() => setQSort("diff", "asc")}
                                  onDesc={() => setQSort("diff", "desc")}
                                  activeAsc={qSortBy === "diff" && qSortDir === "asc"}
                                  activeDesc={qSortBy === "diff" && qSortDir === "desc"}
                                />
                              </div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedQRows.length ? (
                            sortedQRows.map((q, idx) => {
                              const pct = Math.round(q._pct);
                              return (
                                <TableRow key={q.questionId}>
                                  <TableCell>{idx + 1}</TableCell>
                                  <TableCell className="max-w-xl">
                                    <div className="truncate">{q.text}</div>
                                  </TableCell>
                                  <TableCell>{q.questionType}</TableCell>
                                  <TableCell><StackedBar correctPct={pct} /></TableCell>
                                  <TableCell><ScorePill v={pct} /></TableCell>
                                  <TableCell>{formatSecs(q.avgTimeSeconds)}</TableCell>
                                  <TableCell>{q.difficulty || "—"}</TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-4">
                                No question analytics available.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this student’s records?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the student’s attempt (analytics + all linked responses).
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

              {/* Student details modal */}
              {detailsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="bg-card rounded-lg shadow-lg p-6 max-w-2xl w-full">
                    <h3 className="text-lg font-bold mb-4">
                      Details for {detailStudentName}
                    </h3>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {detailRows.length ? (
                        detailRows.map((item: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-4">
                            <h4 className="font-semibold mb-1">
                              {item.questionText}
                            </h4>
                            <p className="text-sm">
                              Your Answer:{" "}
                              <span
                                className={
                                  item.isCorrect ? "text-green-600" : "text-red-600"
                                }
                              >
                                {item.studentAnswer || "No answer"}
                              </span>
                            </p>
                            <p className="text-sm">
                              Correct Answer: {item.correctAnswer}
                            </p>
                            <p className="text-sm">Time Spent: {item.timeSpent}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No details available.
                        </p>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button onClick={() => setDetailsOpen(false)}>Close</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </motion.div>
  );
};

export default QuizResults;