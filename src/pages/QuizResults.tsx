import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import {
  getQuizWithQuestions,
  getQuizEligibleSections,
  getQuizAnalytics,
  getStudentPerformanceList,
  getStudentPerformanceDetails,
  // — New (add these in quizService.ts). UI will still work if they throw.
  getQuestionStats,
} from "@/services/quizService";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2,
  ArrowLeft,
  Download,
  LineChart,
  UserRound,
  BarChart3,
  ListOrdered,
} from "lucide-react";
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
                  <CardHeader>
                    <CardTitle>Student Performance</CardTitle>
                    <CardDescription>Detailed results for each student who completed the quiz</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableCaption>A list of student results for this quiz</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Time Spent</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentPerformances.length ? (
                          studentPerformances.map((s) => (
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
                                <Button variant="ghost" size="sm" onClick={() => handleViewDetails(s)}>
                                  View Details
                                </Button>
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
                            <TableHead className="w-64">Correct vs Incorrect</TableHead>
                            <TableHead>% Correct</TableHead>
                            <TableHead>Avg Time</TableHead>
                            <TableHead>Difficulty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {qStats.length ? (
                            qStats.map((q, idx) => {
                              const total = q.correct + q.incorrect;
                              const pct = total > 0 ? Math.round((q.correct / total) * 100) : 0;
                              return (
                                <TableRow key={q.questionId}>
                                  <TableCell>{idx + 1}</TableCell>
                                  <TableCell className="max-w-xl">
                                    <div className="truncate">{q.text}</div>
                                  </TableCell>
                                  <TableCell>
                                    <StackedBar correctPct={pct} />
                                  </TableCell>
                                  <TableCell><ScorePill v={pct} /></TableCell>
                                  <TableCell>{formatSecs(q.avgTimeSeconds)}</TableCell>
                                  <TableCell>{q.difficulty || "—"}</TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-4">
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