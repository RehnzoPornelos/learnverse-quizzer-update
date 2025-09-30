import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QuizScore {
  name: string;     // quiz title
  avgScore: number; // % (0..100)
  maxScore: number; // 100
}

interface PerformanceData {
  name: string;     // quiz title
  excellent: number; // >= 90
  good: number;      // 80–89
  average: number;   // 70–79
  poor: number;      // < 70
}

interface PerformanceOverviewProps {
  professorId: string | null; // owner of the quizzes
  sectionId: string | null;   // only this section's data (null = all sections)
  hasAnalyticsData?: boolean;
}

const PerformanceOverview = ({ professorId, sectionId }: PerformanceOverviewProps) => {
  const [quizScoreData, setQuizScoreData] = useState<QuizScore[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [completionRate, setCompletionRate] = useState<number>(0);
  const [avgScore, setAvgScore] = useState<number>(0);
  const [activeStudents, setActiveStudents] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const canQuery = useMemo(() => !!professorId, [professorId]);

  useEffect(() => {
    if (!canQuery) return;

    const run = async () => {
      setIsLoading(true);
      try {
        // 1) Quizzes owned by this professor — ONLY published (active) ones
        const { data: quizRows, error: qErr } = await supabase
          .from("quizzes")
          .select("id, title")
          .eq("user_id", professorId)
          .eq("published", true); // <-- filter to active quizzes only
        if (qErr) throw qErr;

        let quizIds = (quizRows ?? []).map((q) => q.id as string);
        const titleById = new Map<string, string>();
        (quizRows ?? []).forEach((q) => titleById.set(q.id, q.title));

        // 2) Restrict to quizzes assigned to the selected section
        if (sectionId && quizIds.length) {
          const { data: qSec, error: qsErr } = await supabase
            .from("quiz_sections")
            .select("quiz_id")
            .eq("section_id", sectionId)
            .in("quiz_id", quizIds);
          if (qsErr) throw qsErr;
          quizIds = (qSec ?? []).map((r) => r.quiz_id as string);
        }

        if (!quizIds.length) {
          setQuizScoreData([]);
          setPerformanceData([]);
          setCompletionRate(0);
          setAvgScore(0);
          setActiveStudents(0);
          setIsLoading(false);
          return;
        }

        // 3) Get question counts per quiz (to convert raw scores -> %)
        const { data: qqRows, error: qqErr } = await supabase
          .from("quiz_questions")
          .select("id, quiz_id")
          .in("quiz_id", quizIds);
        if (qqErr) throw qqErr;

        const qCount = new Map<string, number>();
        (qqRows ?? []).forEach((r) => {
          const qid = r.quiz_id as string;
          qCount.set(qid, (qCount.get(qid) || 0) + 1);
        });

        // 4) Pull all student-performance rows for the scope (section-aware)
        const { data: spRows, error: spErr } = await supabase
          .from("analytics_student_performance")
          .select("quiz_id, score, student_name_norm, section_id")
          .in("quiz_id", quizIds)
          .match(sectionId ? { section_id: sectionId } : {});
        if (spErr) throw spErr;

        if (!spRows?.length) {
          setQuizScoreData([]);
          setPerformanceData([]);
          setCompletionRate(0);
          setAvgScore(0);
          setActiveStudents(0);
          setIsLoading(false);
          return;
        }

        // 5) Aggregate using PERCENTAGE per submission
        type Agg = {
          sumPct: number;
          n: number;
          uniq: Set<string>;
          buckets: { ex: number; g: number; a: number; p: number };
        };
        const byQuiz: Record<string, Agg> = {};
        const uniqStudents = new Set<string>();

        for (const r of spRows) {
          const qid = r.quiz_id as string;
          if (!byQuiz[qid]) {
            byQuiz[qid] = {
              sumPct: 0,
              n: 0,
              uniq: new Set(),
              buckets: { ex: 0, g: 0, a: 0, p: 0 },
            };
          }

          const raw = Number(r.score);
          const totalQ = qCount.get(qid) || 0;
          const pct = totalQ > 0 && raw <= totalQ ? (raw / totalQ) * 100 : raw;

          byQuiz[qid].sumPct += pct;
          byQuiz[qid].n += 1;

          const sn = (r as any).student_name_norm as string | null;
          if (sn) {
            byQuiz[qid].uniq.add(sn);
            uniqStudents.add(sn);
          }

          if (pct >= 90) byQuiz[qid].buckets.ex += 1;
          else if (pct >= 80) byQuiz[qid].buckets.g += 1;
          else if (pct >= 70) byQuiz[qid].buckets.a += 1;
          else byQuiz[qid].buckets.p += 1;
        }

        // Chart: Average Quiz Scores (percent)
        const scores: QuizScore[] = Object.entries(byQuiz).map(([qid, agg]) => ({
          name: titleById.get(qid) || `Quiz ${qid.slice(0, 4)}`,
          avgScore: agg.n ? agg.sumPct / agg.n : 0,
          maxScore: 100,
        }));
        scores.sort((a, b) => a.name.localeCompare(b.name));
        setQuizScoreData(scores);

        // Chart: Performance Distribution (percent buckets)
        const perf: PerformanceData[] = Object.entries(byQuiz).map(([qid, agg]) => ({
          name: titleById.get(qid) || `Quiz ${qid.slice(0, 4)}`,
          excellent: agg.buckets.ex,
          good: agg.buckets.g,
          average: agg.buckets.a,
          poor: agg.buckets.p,
        }));
        perf.sort((a, b) => a.name.localeCompare(b.name));
        setPerformanceData(perf);

        // Cards: Average Score (simple mean of per-quiz averages)
        const overallAvg = scores.length
          ? scores.reduce((s, d) => s + d.avgScore, 0) / scores.length
          : 0;
        setAvgScore(Number.isFinite(overallAvg) ? overallAvg : 0);

        // Card: Participation
        setActiveStudents(uniqStudents.size);

        // Card: Completion (mean of per-quiz completion vs. max participants)
        const maxParticipants = Object.values(byQuiz).reduce(
          (m, agg) => Math.max(m, agg.uniq.size),
          0
        );
        const perQuizCompletion = Object.values(byQuiz).map((agg) =>
          maxParticipants ? (agg.uniq.size / maxParticipants) * 100 : 0
        );
        const meanCompletion = perQuizCompletion.length
          ? perQuizCompletion.reduce((s, v) => s + v, 0) / perQuizCompletion.length
          : 0;
        setCompletionRate(Number.isFinite(meanCompletion) ? Math.round(meanCompletion) : 0);
      } catch (e) {
        console.error("PerformanceOverview error:", e);
        setQuizScoreData([]);
        setPerformanceData([]);
        setCompletionRate(0);
        setAvgScore(0);
        setActiveStudents(0);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [canQuery, professorId, sectionId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* 3 top cards now that Hardest Question is gone */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-5 bg-muted rounded w-24"></div>
                <div className="h-4 bg-muted rounded w-40 mt-1"></div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-8 bg-muted rounded w-16"></div>
                <div className="h-4 bg-muted rounded w-32 mt-2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-5 bg-muted rounded w-32"></div>
                <div className="h-4 bg-muted rounded w-48 mt-1"></div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-80 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top metrics (3 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quiz Completion</CardTitle>
            <CardDescription>100% completion rate (per-quiz)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-bold">{Math.round(completionRate)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Averaged across quizzes in scope
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Average Score</CardTitle>
            <CardDescription>Across all submissions</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-bold">{avgScore.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Section filter applied</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Participation</CardTitle>
            <CardDescription>Distinct students who submitted</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-bold">{activeStudents}</div>
            <p className="text-xs text-muted-foreground mt-1">In current scope</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Average Quiz Scores</CardTitle>
            <CardDescription>Performance across different quizzes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quizScoreData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value: number) => value.toFixed(2)} cursor={false} />
                  <Legend />
                  <Bar dataKey="avgScore" name="Average Score (%)" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Distribution</CardTitle>
            <CardDescription>Student performance by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip cursor={false} />
                  <Legend />
                  <Bar dataKey="excellent" name="Excellent (≥90%)" fill="#8884d8" />
                  <Bar dataKey="good" name="Good (80–89%)" fill="#82ca9d" />
                  <Bar dataKey="average" name="Average (70–79%)" fill="#ffc658" />
                  <Bar dataKey="poor" name="Needs Improvement (<70%)" fill="#ff8042" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PerformanceOverview;