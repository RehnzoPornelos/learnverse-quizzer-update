import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QuizMeta { id: string; title: string; created_at?: string | null }
interface StudentKPI {
  id: string; name: string;
  byQuiz: { quizId: string; quizTitle: string; pct: number; when?: string | null }[];
  avgPct: number; participationRate: number; consistencyStd: number; improvementPct: number;
  risk: "On Track" | "Needs Attention" | "At Risk";
}
interface ProgressChartPoint { name: string; [series: string]: number | string }
interface Props { professorId: string | null; sectionId: string | null }

const StudentProgressChart = ({ professorId, sectionId }: Props) => {
  const [isLoading, setIsLoading] = useState(true);
  const [chartData, setChartData] = useState<ProgressChartPoint[]>([]);
  const [students, setStudents] = useState<StudentKPI[]>([]);

  // allow query if either professor scope or a specific section is chosen
  const canQuery = useMemo(() => !!professorId || !!sectionId, [professorId, sectionId]);

  useEffect(() => {
    if (!canQuery) {
      setIsLoading(false);
      setStudents([]);
      setChartData([]);
      return;
    }

    const run = async () => {
      setIsLoading(true);
      try {
        // ──────────────────────────────────────────────────────────────────────
        // 1) Pull student rows DIRECTLY from analytics_student_performance
        //    with an inner join to quizzes (to scope by professor).
        //    This avoids the empty .in('quiz_id', []) problem entirely.
        // ──────────────────────────────────────────────────────────────────────
        const base = supabase
          .from("analytics_student_performance")
          .select(
            "quiz_id, section_id, student_name_norm, score, submitted_at, quizzes!inner(id, title, created_at, user_id)"
          );

        let spRes;
        if (professorId) {
          spRes = base.eq("quizzes.user_id", professorId);
        } else {
          // no professor context; still require the inner join to bring quiz meta
          spRes = base;
        }
        if (sectionId) spRes = spRes.eq("section_id", sectionId);

        const { data: spRows, error: spErr } = await spRes;
        if (spErr) throw spErr;

        if (!spRows || spRows.length === 0) {
          setStudents([]);
          setChartData([]);
          setIsLoading(false);
          return;
        }

        // Build quiz meta from the join payload included in spRows
        const quizById = new Map<string, QuizMeta>();
        const quizIds: string[] = [];
        for (const r of spRows as any[]) {
          const q = r.quizzes as { id: string; title: string; created_at?: string | null };
          if (q && !quizById.has(q.id)) {
            quizById.set(q.id, { id: q.id, title: q.title, created_at: q.created_at ?? null });
            quizIds.push(q.id);
          }
        }

        // Sort quizzes chronologically for x-axis order
        const quizzes = Array.from(quizById.values()).sort((a, b) => {
          const ta = a.created_at ? Date.parse(a.created_at) : 0;
          const tb = b.created_at ? Date.parse(b.created_at) : 0;
          return ta - tb;
        });

        // ──────────────────────────────────────────────────────────────────────
        // 2) Fetch total questions per quiz (for raw→% conversion)
        // ──────────────────────────────────────────────────────────────────────
        const { data: qqRows, error: qqErr } = await supabase
          .from("quiz_questions")
          .select("id, quiz_id")
          .in("quiz_id", quizIds);
        if (qqErr) throw qqErr;

        const qCount = new Map<string, number>();
        (qqRows ?? []).forEach((r: any) => {
          qCount.set(r.quiz_id, (qCount.get(r.quiz_id) || 0) + 1);
        });

        // ──────────────────────────────────────────────────────────────────────
        // 3) Normalize per-submission to percentages and group by student
        // ──────────────────────────────────────────────────────────────────────
        type Row = {
          studentKey: string; name: string; quiz_id: string; pct: number; when?: string | null;
        };

        const rows: Row[] = (spRows as any[]).map((r) => {
          const raw = Number(r.score);
          const total = qCount.get(r.quiz_id) || 0;
          const pct = total > 0 && raw <= total ? (raw / total) * 100 : raw;
          const name = (r.student_name_norm || "Unknown") as string;

          return {
            studentKey: name, // stable key (use normalized name as unique id)
            name,
            quiz_id: r.quiz_id as string,
            pct,
            when: r.submitted_at ?? (quizById.get(r.quiz_id)?.created_at ?? null),
          };
        });

        const byStudent = new Map<string, StudentKPI>();
        for (const r of rows) {
          if (!byStudent.has(r.studentKey)) {
            byStudent.set(r.studentKey, {
              id: r.studentKey,
              name: r.name,
              byQuiz: [],
              avgPct: 0,
              participationRate: 0,
              consistencyStd: 0,
              improvementPct: 0,
              risk: "On Track",
            });
          }
          byStudent.get(r.studentKey)!.byQuiz.push({
            quizId: r.quiz_id,
            quizTitle: quizById.get(r.quiz_id)?.title || "Quiz",
            pct: r.pct,
            when: r.when ?? null,
          });
        }

        // ──────────────────────────────────────────────────────────────────────
        // 4) Compute KPIs
        // ──────────────────────────────────────────────────────────────────────
        const allQuizCount = quizzes.length || 1; // prevent /0

        const kpis: StudentKPI[] = Array.from(byStudent.values()).map((s) => {
          s.byQuiz.sort((a, b) => {
            const ta = a.when ? Date.parse(a.when) : 0;
            const tb = b.when ? Date.parse(b.when) : 0;
            return ta - tb;
          });

          const vals = s.byQuiz.map((b) => b.pct);
          const n = vals.length;
          const avg = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
          const mean = avg;
          const variance = n ? vals.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n : 0;
          const std = Math.sqrt(variance);

          const first = n ? vals[0] : 0;
          const last = n ? vals[n - 1] : 0;
          const improvement = last - first;

          const participation = (n / allQuizCount) * 100;

          let risk: StudentKPI["risk"] = "On Track";
          if (avg < 70 || (improvement <= -10 && participation >= 50)) risk = "At Risk";
          else if ((avg >= 70 && avg < 80) || std > 12) risk = "Needs Attention";

          return {
            ...s,
            avgPct: avg,
            participationRate: participation,
            consistencyStd: std,
            improvementPct: improvement,
            risk,
          };
        });

        // ──────────────────────────────────────────────────────────────────────
        // 5) Build line chart for Top 5 by participation then avg
        // ──────────────────────────────────────────────────────────────────────
        const top5 = kpis
          .slice()
          .sort((a, b) => (b.participationRate !== a.participationRate
            ? b.participationRate - a.participationRate
            : b.avgPct - a.avgPct))
          .slice(0, 5);

        const points: ProgressChartPoint[] = quizzes.map((q) => {
          const p: ProgressChartPoint = { name: q.title };
          for (const s of top5) {
            const label = s.name.split(" ")[0]; // first name as series label
            const rec = s.byQuiz.find((b) => b.quizId === q.id);
            p[label] = rec ? Number(rec.pct.toFixed(2)) : 0;
          }
          return p;
        });

        setStudents(kpis.slice().sort((a, b) => b.avgPct - a.avgPct));
        setChartData(points);
      } catch (e) {
        console.error("StudentProgressChart error:", e);
        setStudents([]);
        setChartData([]);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [canQuery, professorId, sectionId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardHeader className="pb-2">
            <div className="h-5 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-48 mt-1"></div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-96 bg-muted rounded"></div>
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardHeader className="pb-2">
            <div className="h-5 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-48 mt-1"></div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80 bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Student Progress Over Time</CardTitle>
          <CardDescription>Score trends across multiple quizzes (Top 5 by participation)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip cursor={false} />
                  <Legend />
                  {Object.keys(chartData[0] ?? {})
                    .filter((k) => k !== "name")
                    .map((key) => (
                      <Line key={key} type="monotone" dataKey={key} dot={false} strokeWidth={2} />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
                No student data in this scope.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student Performance Details</CardTitle>
          <CardDescription>Individual student analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Avg Score</TableHead>
                  <TableHead className="text-right">Participation</TableHead>
                  <TableHead className="text-right">Consistency (σ)</TableHead>
                  <TableHead className="text-right">Improvement</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress value={s.avgPct} className="h-2 w-40" />
                        <span className="text-sm">{s.avgPct.toFixed(2)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{s.participationRate.toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{s.consistencyStd.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={s.improvementPct >= 0 ? "text-green-600" : "text-red-600"}>
                        {s.improvementPct >= 0 ? "+" : ""}
                        {s.improvementPct.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.risk === "On Track" && (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-green-500 text-primary-foreground">
                          On Track
                        </span>
                      )}
                      {s.risk === "Needs Attention" && (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-yellow-500 text-primary-foreground">
                          Needs Attention
                        </span>
                      )}
                      {s.risk === "At Risk" && (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-red-500 text-primary-foreground">
                          At Risk
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProgressChart;
