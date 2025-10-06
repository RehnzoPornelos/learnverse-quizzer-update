import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
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
  TableCaption,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Types for our processed data
interface TrendingPoint {
  /** Month key (e.g. 'Jan 25') */
  month: string;
  /** Average correct rate (0–100) */
  avgCorrect: number;
  /** Average time spent per response in seconds */
  avgTime: number;
  /** Number of unique questions answered */
  totalQuestions: number;
}

interface TypeStat {
  type: string;
  name: string;
  questionCount: number;
  avgAccuracy: number;
  avgTime: number;
}

interface HardQuestion {
  type: string;
  name: string;
  question: string;
  quizTitle: string;
  accuracy: number;
  avgTime: number;
}

interface QuizSummary {
  id: string;
  title: string;
  avgScore: number;
  avgTime: number;
  attempts: number;
  typeCounts: Record<string, number>;
}

interface SectionStat {
  sectionId: string;
  sectionCode: string; // pretty code like IT-31
  avgScorePct: number; // 0–100
  avgTimePerQ: number; // seconds per question
  attempts: number; // # of attempts in this section across quizzes
}

/**
 * QuizDifficultyAnalysis
 *
 * This component analyzes quiz difficulty using raw quiz responses. It computes:
 * - Monthly trends in average correct rate and average time spent per response.
 * - Question type distribution and average accuracy per type.
 * - Hardest questions by type (lowest accuracy, highest time taken).
 * - Per-quiz performance summary (average score, average time, question type breakdown).
 *
 * It relies on Supabase tables:
 *   - quizzes (published quizzes belonging to the current professor)
 *   - quiz_questions (question metadata)
 *   - quiz_responses (raw responses to each question)
 *   - analytics_student_performance (per-quiz performance per attempt)
 */
const QuizDifficultyAnalysis = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [trendingData, setTrendingData] = useState<TrendingPoint[]>([]);
  const [typeStats, setTypeStats] = useState<TypeStat[]>([]);
  const [hardQuestions, setHardQuestions] = useState<HardQuestion[]>([]);
  const [quizSummary, setQuizSummary] = useState<QuizSummary[]>([]);
  const [sectionStats, setSectionStats] = useState<SectionStat[]>([]);
  const shortType = useCallback((s: string) => {
    switch (s) {
      case "Multiple Choice":
        return "MCQ";
      case "True/False":
        return "T/F";
      case "Short Answer":
        return "Short Ans";
      case "Fill in the Blank":
        return "Fill-Blank";
      default:
        return s;
    }
  }, []);

  useEffect(() => {
    /**
     * Fetch data from Supabase and compute analytics.
     */
    const fetchData = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      try {
        // 1. Fetch all published quizzes for this professor
        const { data: quizRows, error: quizErr } = await supabase
          .from("quizzes")
          .select("id, title, question_no")
          .eq("published", true)
          .eq("user_id", user.id);
        if (quizErr || !quizRows) throw quizErr;

        const quizIds = quizRows.map((q: any) => q.id);
        const quizQuestionCount: Record<string, number> = {};
        for (const q of quizRows) {
          quizQuestionCount[q.id] = Number(q.question_no ?? 0);
        }

        if (quizIds.length === 0) {
          // No data
          setSectionStats([]);
          setTrendingData([]);
          setTypeStats([]);
          setHardQuestions([]);
          setQuizSummary([]);
          setIsLoading(false);
          return;
        }

        // 2. Fetch questions for these quizzes
        const { data: questionRows, error: questionErr } = await supabase
          .from("quiz_questions")
          .select("id, quiz_id, type, text")
          .in("quiz_id", quizIds);
        if (questionErr || !questionRows) throw questionErr;

        // Build question map and type grouping
        const questionsById: Record<
          string,
          { quiz_id: string; type: string; text: string }
        > = {};
        const questionsByType: Record<string, string[]> = {};
        for (const q of questionRows) {
          questionsById[q.id] = {
            quiz_id: q.quiz_id,
            type: q.type,
            text: q.text,
          };
          questionsByType[q.type] = questionsByType[q.type] || [];
          questionsByType[q.type].push(q.id);
        }

        // 3. Fetch responses for these quizzes
        const { data: responseRows, error: responseErr } = await supabase
          .from("quiz_responses")
          .select(
            "question_id, quiz_id, answered_at, time_spent_seconds, is_correct"
          )
          .in("quiz_id", quizIds);
        if (responseErr || !responseRows) throw responseErr;

        // Process trending data by month
        const trendMap: Record<
          string,
          {
            correctCount: number;
            total: number;
            timeSum: number;
            questionSet: Set<string>;
          }
        > = {};
        responseRows.forEach((r: any) => {
          const dt = new Date(r.answered_at);
          if (Number.isNaN(dt.getTime())) return;
          const monthKey =
            dt.toLocaleString("default", { month: "short" }) +
            " " +
            dt.getFullYear().toString().slice(-2);
          trendMap[monthKey] = trendMap[monthKey] || {
            correctCount: 0,
            total: 0,
            timeSum: 0,
            questionSet: new Set(),
          };
          const entry = trendMap[monthKey];
          entry.total += 1;
          entry.correctCount += r.is_correct ? 1 : 0;
          entry.timeSum += Number(r.time_spent_seconds ?? 0);
          entry.questionSet.add(r.question_id);
        });

        // Convert to array and sort by chronological order (YYYY-MM sort)
        const trendPoints: TrendingPoint[] = Object.entries(trendMap)
          .map(([month, stats]) => {
            const avgCorrect =
              stats.total > 0 ? (stats.correctCount / stats.total) * 100 : 0;
            const avgTime = stats.total > 0 ? stats.timeSum / stats.total : 0;
            return {
              month,
              avgCorrect: Math.round(avgCorrect * 100) / 100,
              avgTime: Math.round(avgTime * 100) / 100,
              totalQuestions: stats.questionSet.size,
            };
          })
          .sort((a, b) => {
            // Extract year and month for sorting (e.g. 'Jan 25')
            const parseKey = (k: string) => {
              const [monStr, yrStr] = k.split(" ");
              const monthIndex = new Date(monStr + " 1, 2000").getMonth();
              return { year: parseInt("20" + yrStr, 10), month: monthIndex };
            };
            const aKey = parseKey(a.month);
            const bKey = parseKey(b.month);
            if (aKey.year === bKey.year) return aKey.month - bKey.month;
            return aKey.year - bKey.year;
          });
        setTrendingData(trendPoints); // <<< ADD THIS

        // 4. Compute type stats: question count, average accuracy, average time
        // Build response grouping by question id
        const responsesByQuestion: Record<
          string,
          { correct: number; total: number; timeSum: number }
        > = {};
        responseRows.forEach((r: any) => {
          const qid = r.question_id;
          responsesByQuestion[qid] = responsesByQuestion[qid] || {
            correct: 0,
            total: 0,
            timeSum: 0,
          };
          const row = responsesByQuestion[qid];
          row.total += 1;
          row.correct += r.is_correct ? 1 : 0;
          row.timeSum += Number(r.time_spent_seconds ?? 0);
        });

        const typeStatsArray: TypeStat[] = [];
        for (const [type, qids] of Object.entries(questionsByType)) {
          let totalResponses = 0;
          let correctResponses = 0;
          let timeSum = 0;
          qids.forEach((qid) => {
            const stats = responsesByQuestion[qid];
            if (stats) {
              totalResponses += stats.total;
              correctResponses += stats.correct;
              timeSum += stats.timeSum;
            }
          });
          const avgAccuracy =
            totalResponses > 0 ? (correctResponses / totalResponses) * 100 : 0;
          const avgTime = totalResponses > 0 ? timeSum / totalResponses : 0;
          // Convert type to readable name
          let readable = type;
          switch (type) {
            case "multiple_choice":
              readable = "Multiple Choice";
              break;
            case "true_false":
              readable = "True/False";
              break;
            case "short_answer":
              readable = "Short Answer";
              break;
            case "fill_blank":
              readable = "Fill in the Blank";
              break;
            case "essay":
              readable = "Essay";
              break;
          }
          typeStatsArray.push({
            type,
            name: readable,
            questionCount: qids.length,
            avgAccuracy: Math.round(avgAccuracy * 100) / 100,
            avgTime: Math.round(avgTime * 100) / 100,
          });
        }
        // Sort typeStats by question count descending
        typeStatsArray.sort((a, b) => b.questionCount - a.questionCount);
        setTypeStats(typeStatsArray);

        // 5. Determine hardest questions: lowest accuracy per type
        const questionStats: HardQuestion[] = [];
        for (const qid of Object.keys(responsesByQuestion)) {
          const qStats = responsesByQuestion[qid];
          const qInfo = questionsById[qid];
          if (!qInfo) continue;
          const acc =
            qStats.total > 0 ? (qStats.correct / qStats.total) * 100 : 0;
          const avgT = qStats.total > 0 ? qStats.timeSum / qStats.total : 0;
          // Skip questions with very few responses (e.g. <3) to avoid noise
          if (qStats.total < 3) continue;
          let name = qInfo.type;
          switch (qInfo.type) {
            case "multiple_choice":
              name = "Multiple Choice";
              break;
            case "true_false":
              name = "True/False";
              break;
            case "short_answer":
              name = "Short Answer";
              break;
            case "fill_blank":
              name = "Fill in the Blank";
              break;
            case "essay":
              name = "Essay";
              break;
          }
          questionStats.push({
            type: qInfo.type,
            name,
            question: qInfo.text,
            quizTitle:
              quizRows.find((qr) => qr.id === qInfo.quiz_id)?.title ||
              "Unknown",
            accuracy: Math.round(acc * 100) / 100,
            avgTime: Math.round(avgT * 100) / 100,
          });
        }
        // Sort questions by accuracy ascending, then by avgTime descending (harder questions first)
        questionStats.sort((a, b) => {
          if (a.accuracy === b.accuracy) return b.avgTime - a.avgTime;
          return a.accuracy - b.accuracy;
        });
        // Pick top 2 hardest questions per type
        const hardList: HardQuestion[] = [];
        const typeCount: Record<string, number> = {};
        questionStats.forEach((q) => {
          if (!typeCount[q.type]) typeCount[q.type] = 0;
          if (typeCount[q.type] < 2) {
            typeCount[q.type]++;
            hardList.push(q);
          }
        });
        setHardQuestions(hardList);

        // 6. Compute quiz performance summary (per-quiz) AND per-section comparison
        const { data: perfRows, error: perfErr } = await supabase
          .from("analytics_student_performance")
          .select("quiz_id, section_id, score, completion_time_seconds")
          .in("quiz_id", quizIds);
        if (perfErr || !perfRows) throw perfErr;

        // ---- Per-quiz aggregation (existing behavior) ----
        const perfAgg: Record<
          string,
          { scoreSum: number; timeSum: number; count: number }
        > = {};
        perfRows.forEach((r: any) => {
          perfAgg[r.quiz_id] = perfAgg[r.quiz_id] || {
            scoreSum: 0,
            timeSum: 0,
            count: 0,
          };
          perfAgg[r.quiz_id].scoreSum += Number(r.score ?? 0);
          perfAgg[r.quiz_id].timeSum += Number(r.completion_time_seconds ?? 0);
          perfAgg[r.quiz_id].count += 1;
        });
        const quizSummaryArray: QuizSummary[] = [];
        for (const q of quizRows) {
          const qAgg = perfAgg[q.id] || { scoreSum: 0, timeSum: 0, count: 0 };
          const count = qAgg.count;
          const avgScore =
            count > 0 && quizQuestionCount[q.id] > 0
              ? (qAgg.scoreSum / (count * quizQuestionCount[q.id])) * 100
              : 0;
          const avgTime = count > 0 ? qAgg.timeSum / count : 0;
          // Count questions by type for this quiz
          const counts: Record<string, number> = {};
          questionRows.forEach((qq: any) => {
            if (qq.quiz_id === q.id) {
              counts[qq.type] = (counts[qq.type] || 0) + 1;
            }
          });
          quizSummaryArray.push({
            id: q.id,
            title: q.title,
            avgScore: Math.round(avgScore * 100) / 100,
            avgTime: Math.round(avgTime * 100) / 100,
            attempts: count,
            typeCounts: counts,
          });
        }
        // Sort quizzes by avgScore ascending (harder quizzes first)
        quizSummaryArray.sort((a, b) => a.avgScore - b.avgScore);

        // ---- NEW: Per-section aggregation ----
        type SecAgg = {
          scorePctSum: number;
          timePerQSum: number;
          attempts: number;
        };
        const bySection: Record<string, SecAgg> = {};

        for (const r of perfRows) {
          const qCount = quizQuestionCount[r.quiz_id] ?? 0;
          if (qCount <= 0) continue;

          // Normalize to per-question metrics
          const scorePct = (Number(r.score ?? 0) / qCount) * 100;
          const timePerQ = Number(r.completion_time_seconds ?? 0) / qCount || 0;

          const sid = String(r.section_id ?? "");
          if (!sid) continue;

          bySection[sid] = bySection[sid] || {
            scorePctSum: 0,
            timePerQSum: 0,
            attempts: 0,
          };
          bySection[sid].scorePctSum += scorePct;
          bySection[sid].timePerQSum += timePerQ;
          bySection[sid].attempts += 1;
        }

        // Fetch section codes for pretty labels
        const sectionIds = Object.keys(bySection);
        let codeMap = new Map<string, string>();
        if (sectionIds.length) {
          const { data: sectionRows, error: sectionErr } = await supabase
            .from("class_sections")
            .select("id, code")
            .in("id", sectionIds);
          if (sectionErr) throw sectionErr;
          (sectionRows ?? []).forEach((s: any) => {
            codeMap.set(String(s.id), String(s.code));
          });
        }

        // Build array and sort by lowest avg score first (so weakest sections bubble up)
        const sectionStatsArray: SectionStat[] = sectionIds
          .map((sid) => {
            const a = bySection[sid];
            const avgScorePct = a.attempts ? a.scorePctSum / a.attempts : 0;
            const avgTimePerQ = a.attempts ? a.timePerQSum / a.attempts : 0;
            return {
              sectionId: sid,
              sectionCode: codeMap.get(sid) || sid.slice(0, 8),
              avgScorePct: Math.round(avgScorePct * 100) / 100,
              avgTimePerQ: Math.round(avgTimePerQ * 100) / 100,
              attempts: a.attempts,
            };
          })
          .sort((a, b) => a.avgScorePct - b.avgScorePct);

        // ---- Update state ----
        setQuizSummary(quizSummaryArray);
        setSectionStats(sectionStatsArray);
      } catch (err) {
        console.error("Error computing difficulty analysis:", err);
        // Fallback to empty state on error
        setTrendingData([]);
        setTypeStats([]);
        setHardQuestions([]);
        setQuizSummary([]);
        setSectionStats([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id]);

  // Derived chart data for question types: count and accuracy
  const typeCountData = useMemo(() => {
    return typeStats.map((t) => ({ name: t.name, count: t.questionCount }));
  }, [typeStats]);
  const typeAccuracyData = useMemo(() => {
    return typeStats.map((t) => ({ name: t.name, accuracy: t.avgAccuracy }));
  }, [typeStats]);

  if (isLoading) {
    // Skeleton loading state (placeholder cards)
    return (
      <div className="space-y-6">
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
      {/* Trends overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Section Performance Comparison</CardTitle>
            <CardDescription>
              Average score and average time per question by class section
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sectionStats.map((s) => ({
                    section: s.sectionCode || s.sectionId,
                    score: s.avgScorePct,
                    pace: s.avgTimePerQ,
                  }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="section" />
                  {/* Left axis for Score (%) */}
                  <YAxis yAxisId="left" domain={[0, 100]} />
                  {/* Right axis for Pace (seconds per question) */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[
                      0,
                      (dataMax: number) =>
                        Math.max(10, Math.ceil(dataMax * 1.2)),
                    ]}
                  />
                  <Tooltip
                    formatter={(val: any, name: string) => {
                      if (name === "score")
                        return [`${val.toFixed(2)}%`, "Avg Score"];
                      if (name === "pace")
                        return [`${val.toFixed(2)}s`, "Avg Time/Q"];
                      return [val, name];
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="score"
                    name="Avg Score (%)"
                    fill="#3b82f6"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="pace"
                    name="Avg Time per Q (s)"
                    fill="#10b981"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Tip: Low score + high time = struggling section; low score + low
              time may indicate guessing.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Question Type Analysis</CardTitle>
            <CardDescription>
              Number of questions and average correct rate by type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {/* Dual bar chart: count and accuracy */}
                <BarChart
                  data={typeStats.map((t) => ({
                    name: t.name,
                    count: t.questionCount,
                    accuracy: t.avgAccuracy,
                  }))}
                  margin={{ top: 20, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tickMargin={10}
                    tickFormatter={shortType}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    domain={[
                      0,
                      (dataMax: number) => Math.max(5, dataMax * 1.2),
                    ]}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === "count") return [`${value}`, "Questions"];
                      if (name === "accuracy") return [`${value}%`, "Accuracy"];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="Question Count"
                    fill="#3b82f6"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="accuracy"
                    name="Avg Accuracy (%)"
                    fill="#f59e0b"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Hardest questions */}
      <Card>
        <CardHeader>
          <CardTitle>Hardest Questions</CardTitle>
          <CardDescription>
            Questions with the lowest accuracy (top 2 per type)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Quiz</TableHead>
                  <TableHead className="text-right">Accuracy (%)</TableHead>
                  <TableHead className="text-right">Avg Time (s)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hardQuestions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No question data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  hardQuestions.map((q, idx) => (
                    <TableRow key={idx} className="align-top">
                      <TableCell className="font-medium">{q.name}</TableCell>
                      <TableCell
                        className="truncate max-w-[240px]"
                        title={q.question}
                      >
                        {q.question.length > 60
                          ? `${q.question.slice(0, 57)}...`
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
      {/* Quiz performance summary */}
      <Card>
        <CardHeader>
          <CardTitle>Quiz Performance Summary</CardTitle>
          <CardDescription>
            Average score, completion time and question type breakdown per quiz
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quiz</TableHead>
                  <TableHead className="text-right">Avg Score (%)</TableHead>
                  <TableHead className="text-right">Avg Time (s)</TableHead>
                  <TableHead className="text-right">
                    Students Participated
                  </TableHead>
                  {/* Dynamic columns for question types (MCQ, TF, Short Answer, etc.) */}
                  {typeStats.map((t) => (
                    <TableHead key={t.type} className="text-right">
                      {t.name} (#)
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quizSummary.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4 + typeStats.length}
                      className="text-center text-muted-foreground"
                    >
                      No quiz performance data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  quizSummary.map((qs) => (
                    <TableRow key={qs.id}>
                      <TableCell
                        className="font-medium truncate max-w-[180px]"
                        title={qs.title}
                      >
                        {qs.title}
                      </TableCell>
                      <TableCell className="text-right">
                        {qs.avgScore.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {qs.avgTime.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {qs.attempts}
                      </TableCell>
                      {typeStats.map((t) => (
                        <TableCell
                          key={`${qs.id}-${t.type}`}
                          className="text-right"
                        >
                          {qs.typeCounts[t.type] || 0}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuizDifficultyAnalysis;
