import { useState, useEffect, useCallback, useMemo } from "react";
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
  ResponsiveContainer,
} from "recharts";
import { LightbulbIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

// Types
interface StudentFeature {
  studentKey: string;
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
  avgTimeMin?: number;
}
interface RecommendationItem {
  title: string;
  description: string;
  actionItems: string[];
  priority: "high" | "medium" | "low";
}

type Props = {
  selectedSectionIds?: string[] | null;
};

const PredictiveModeling = ({ selectedSectionIds = null }: Props) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [clusterStats, setClusterStats] = useState<ClusterStat[]>([]);
  const [hardQuizzes, setHardQuizzes] = useState<HardQuiz[]>([]);
  const [hardQuestionsRec, setHardQuestionsRec] = useState<HardQuestionRec[]>(
    []
  );
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    []
  );
  const [prescriptions, setPrescriptions] = useState<{
    perSection: Array<{
      section: string;
      worstQuizzes: Array<{ quiz: string; avgPct: number }>;
      commendations: Array<{ quiz: string; avgPct: number }>;
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
    strugglers: [],
    guessersOneTime: [],
    guessersMulti: [],
  });

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

  const semanticLabel = (score: number, time: number, medianTime: number) => {
    if (score >= 90)
      return time < medianTime ? "High Achiever" : "Slow High Achiever";
    if (score < 75) return time < medianTime ? "Guesser" : "Struggler";
    return "On Track";
  };

  const fetchAndAnalyze = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      // 1) Fetch professor's quizzes
      const { data: quizRows, error: quizErr } = await supabase
        .from("quizzes")
        .select("id, title, question_no")
        .eq("published", true)
        .eq("user_id", user.id);
      if (quizErr) throw quizErr;

      const quizIds = (quizRows ?? []).map((r) => String(r.id));
      if (!quizIds.length) {
        setIsLoading(false);
        return;
      }

      const qTitle: Record<string, string> = {};
      const qQuestionCount: Record<string, number> = {};
      quizRows.forEach((q) => {
        qTitle[q.id] = q.title;
        qQuestionCount[q.id] = Number(q.question_no ?? 0);
      });

      // 2) Fetch sections
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

      const secLabelById: Record<string, string> = {};
      (sectionRows ?? []).forEach((s: any) => {
        if (s.id && s.code) secLabelById[s.id] = String(s.code);
      });
      const showSection = (val: string) => secLabelById[val] || val;

      // 3) Fetch analytics_student_performance (paged)
      const perf: any[] = [];
      const pageSize = 1000;
      let from = 0,
        to = pageSize - 1;
      while (true) {
        let q = supabase
          .from("analytics_student_performance")
          .select("*")
          .in("quiz_id", quizIds)
          .range(from, to);

        if (selectedSectionIds && selectedSectionIds.length > 0) {
          q = q.in("section_id", selectedSectionIds);
        }

        const { data, error } = await q;
        if (error) throw error;
        const batch = data ?? [];
        perf.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        to += pageSize;
      }

      // 4) Aggregate per student
      type Agg = {
        scoreList: number[];
        timeSum: number;
        questionSum: number;
        quizSet: Set<string>;
      };
      const perStudent: Record<string, Agg> = {};
      perf.forEach((r) => {
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
          const avgPace =
            agg.questionSum > 0 ? agg.timeSum / agg.questionSum : 0;
          return {
            studentKey: key,
            avgScorePct: Math.round(avgScore * 100) / 100,
            avgTimePerQuestion: Math.round(avgPace * 100) / 100,
            totalQuizzes: agg.quizSet.size,
          };
        }
      );

      // 5) Compute median time
      const times = features
        .map((f) => f.avgTimePerQuestion)
        .filter(Number.isFinite);
      const medianTime = quantile(times, 0.5);

      // 6) Cluster stats
      const clusteringRows = features.map((f) => ({
        key: f.studentKey,
        label: semanticLabel(f.avgScorePct, f.avgTimePerQuestion, medianTime),
        quizzesTaken: f.totalQuizzes,
      }));

      const counts: Record<string, number> = {};
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

      // 7) Hard quizzes
      const perfAgg: Record<string, { scoreSum: number; count: number }> = {};
      perf.forEach((r) => {
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
        .filter((q) => q.avgScore <= 80)
        .sort((a, b) => a.avgScore - b.avgScore);
      setHardQuizzes(quizzesRank.slice(0, 3));

      // 8) Fetch quiz_responses for hard questions
      const qrAll: any[] = [];
      from = 0;
      to = pageSize - 1;
      while (true) {
        let q = supabase
          .from("quiz_responses")
          .select("*")
          .in("quiz_id", quizIds)
          .range(from, to);

        if (selectedSectionIds && selectedSectionIds.length > 0) {
          q = q.in("section_id", selectedSectionIds);
        }

        const { data, error } = await q;
        if (error) throw error;
        const batch = data ?? [];
        qrAll.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        to += pageSize;
      }

      // Aggregate per question
      type QAgg = {
        quiz_id: string;
        n: number;
        timeSum: number;
        correct: number;
      };
      const aggByQ = new Map<string, QAgg>();
      qrAll.forEach((r) => {
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
      });

      // Fetch question details
      const qIdsSet = new Set<string>(qrAll.map((r) => String(r.question_id)));
      const { data: questionRows } = await supabase
        .from("quiz_questions")
        .select("*")
        .in("id", Array.from(qIdsSet));

      const questionById = new Map<string, any>();
      (questionRows ?? []).forEach((qq: any) =>
        questionById.set(String(qq.id), qq)
      );

      const qStats: HardQuestionRec[] = Array.from(aggByQ.entries())
        .filter(([, a]) => a.n >= 3)
        .map(([question_id, a]) => {
          const qq = questionById.get(question_id);
          const avgTime = a.n ? a.timeSum / a.n : 0;
          const accuracy = a.n ? (a.correct / a.n) * 100 : 0;
          return {
            question: qq?.text ?? "",
            quizTitle: qTitle[a.quiz_id] || "Unknown",
            accuracy: Math.round(accuracy * 100) / 100,
            avgTime: Math.round(avgTime * 100) / 100,
            avgTimeMin: avgTime / 60,
          };
        })
        .sort((a, b) =>
          a.accuracy === b.accuracy
            ? b.avgTime - a.avgTime
            : a.accuracy - b.accuracy
        );
      setHardQuestionsRec(qStats.slice(0, 5));

      // 9) Prescriptions per section
      const secQuiz: Record<
        string,
        Record<string, { sum: number; denom: number }>
      > = {};
      perf.forEach((r) => {
        const secName = showSection(r.section_id) || "Unknown";
        const qn = qQuestionCount[r.quiz_id] || 0;
        if (!secQuiz[secName]) secQuiz[secName] = {};
        if (!secQuiz[secName][r.quiz_id])
          secQuiz[secName][r.quiz_id] = { sum: 0, denom: 0 };
        secQuiz[secName][r.quiz_id].sum += Number(r.score || 0);
        secQuiz[secName][r.quiz_id].denom += qn;
      });

      const perSection = Object.entries(secQuiz).map(([section, byQuiz]) => {
        const rows = Object.entries(byQuiz)
          .map(([qid, agg]) => {
            const pct = agg.denom > 0 ? (agg.sum / agg.denom) * 100 : 0;
            return { quiz: qTitle[qid] || "Unknown", pct };
          })
          .sort((a, b) => a.pct - b.pct);
        const weak = rows.filter((r) => r.pct <= 75);
        const commendable = rows.filter((r) => r.pct > 85);
        return {
          section,
          worstQuizzes: weak.map((r) => ({
            quiz: r.quiz,
            avgPct: Math.round(r.pct * 100) / 100,
          })),
          commendations: commendable.map((r) => ({
            quiz: r.quiz,
            avgPct: Math.round(r.pct * 100) / 100,
          })),
        };
      });

      // 10) Student categories
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
          row?.label ??
          semanticLabel(f.avgScorePct, f.avgTimePerQuestion, medianTime);
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

      // 11) Recommendations
      const recs: RecommendationItem[] = [];
      perSection.forEach((sec) => {
        if (sec.worstQuizzes.length) {
          const list = sec.worstQuizzes
            .map((w) => `${w.quiz} (${w.avgPct.toFixed(1)}%)`)
            .join(", ");
          recs.push({
            title: `Weak topics for ${sec.section}`,
            description: `These quizzes have scores ≤ 75%: ${list}. Provide targeted remediation.`,
            actionItems: [],
            priority: "high",
          });
        }
        if (sec.commendations.length) {
          const list = sec.commendations
            .map((c) => `${c.quiz} (${c.avgPct.toFixed(1)}%)`)
            .join(", ");
          recs.push({
            title: `Commendable topics for ${sec.section}`,
            description: `Students excelled in: ${list}. Preserve teaching approach.`,
            actionItems: [],
            priority: "low",
          });
        }
      });
      if (!recs.length) {
        recs.push({
          title: "Collect more data",
          description:
            "Insights limited by sample size. Encourage additional quizzes.",
          actionItems: [],
          priority: "low",
        });
      }

      setRecommendations(recs);
      setPrescriptions({
        perSection,
        strugglers,
        guessersOneTime,
        guessersMulti,
      });
    } catch (error) {
      console.error("Analysis error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, selectedSectionIds]);

  useEffect(() => {
    fetchAndAnalyze();
  }, [fetchAndAnalyze]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-3">Analyzing student performance...</span>
      </div>
    );
  }

  const hasData = clusterStats.length > 0;

  return (
    <div className="space-y-6">
      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No analytics data available. Create quizzes and wait for student
            submissions.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Student cluster distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Student Performance Segments</CardTitle>
              <CardDescription>
                Distribution of learners by performance level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...clusterStats].sort((a, b) => b.count - a.count)}
                    layout="vertical"
                    margin={{ top: 20, right: 60, left: 140, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, "auto"]}
                      label={{
                        value: "Quizzes Taken",
                        position: "insideBottom",
                        offset: -10, // Moves text slightly downward
                        fontSize: 12,
                      }}
                    />
                    <YAxis type="category" dataKey="label" width={130} />
                    <Tooltip
                      formatter={(v: any) => {
                        const stat = clusterStats.find((c) => c.count === v);
                        return [
                          `${v} students (${stat?.percent.toFixed(1)}%)`,
                          "",
                        ];
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#60a5fa"
                      radius={[0, 4, 4, 0]}
                      label={{
                        position: "right",
                        formatter: (value: number) => {
                          const stat = clusterStats.find(
                            (c) => c.count === value
                          );
                          return `${value} (${stat?.percent.toFixed(1)}%)`;
                        },
                        fontSize: 11,
                        fill: "#666",
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quiz</TableHead>
                      <TableHead className="text-right">
                        Avg Score (%)
                      </TableHead>
                      <TableHead className="text-right">Students</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hardQuizzes.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          No challenging quizzes identified.
                        </TableCell>
                      </TableRow>
                    ) : (
                      hardQuizzes.map((q, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Challenging Questions</CardTitle>
                <CardDescription>Lowest accuracy questions</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead className="text-right">Accuracy (%)</TableHead>
                      <TableHead className="text-right">Avg Time (s)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hardQuestionsRec.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          No question data available.
                        </TableCell>
                      </TableRow>
                    ) : (
                      hardQuestionsRec.map((q, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="max-w-[300px] truncate">
                            {q.question}
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
                {recommendations.map((rec, idx) => (
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
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Per-section prescriptions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Per-Section: Quizzes to Re-teach</CardTitle>
                <CardDescription>Quizzes with averages ≤ 75%</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead>Weak Quizzes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.perSection.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="text-center text-muted-foreground"
                        >
                          No prescriptions yet.
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
                                    (w) => `${w.quiz} (${w.avgPct.toFixed(1)}%)`
                                  )
                                  .join(", ")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Per-Section: Commendations</CardTitle>
                <CardDescription>
                  High-performing quizzes (Greater than 85%)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead>Strong Quizzes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.perSection.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="text-center text-muted-foreground"
                        >
                          No prescriptions yet.
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
                                    (c) => `${c.quiz} (${c.avgPct.toFixed(1)}%)`
                                  )
                                  .join(", ")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Cluster details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Strugglers</CardTitle>
                <CardDescription>Students needing support</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead className="text-right">~Avg %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.strugglers.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-muted-foreground"
                          >
                            No Strugglers Detected.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.strugglers.slice(0, 10).map((s, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {s.student}
                            </TableCell>
                            <TableCell>{s.section}</TableCell>
                            <TableCell className="text-right">
                              {s.avgScore?.toFixed(1) ?? "—"}
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
                <CardDescription>Likely accidental</CardDescription>
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
                            No One-time Guessers.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.guessersOneTime
                          .slice(0, 10)
                          .map((g, idx) => (
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
                <CardDescription>Needs coaching</CardDescription>
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
                            No Multiple-time Guessers.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prescriptions.guessersMulti
                          .slice(0, 10)
                          .map((g, idx) => (
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

export default PredictiveModeling;
