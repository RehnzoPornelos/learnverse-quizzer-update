import { useState, useEffect, useMemo } from "react";
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
import { ChevronUp, ChevronDown, LightbulbIcon } from "lucide-react";

// Interface definitions for our internal data structures
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
}

interface RecommendationItem {
  title: string;
  description: string;
  actionItems: string[];
  priority: "high" | "medium" | "low";
}

const Recommendations = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [clusterStats, setClusterStats] = useState<ClusterStat[]>([]);
  const [hardQuizzes, setHardQuizzes] = useState<HardQuiz[]>([]);
  const [hardQuestionsRec, setHardQuestionsRec] = useState<HardQuestionRec[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [scoreTrend, setScoreTrend] = useState<{ month: string; avgScore: number }[]>([]);

  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      try {
        // Step 1: Fetch professor's published quizzes
        const { data: quizRows, error: quizErr } = await supabase
          .from("quizzes")
          .select("id, title, question_no")
          .eq("published", true)
          .eq("user_id", user.id);
        if (quizErr || !quizRows) throw quizErr;
        const quizIds = quizRows.map((q: any) => q.id);
        const quizQuestionCount: Record<string, number> = {};
        quizRows.forEach((q: any) => {
          quizQuestionCount[q.id] = Number(q.question_no ?? 0);
        });
        if (quizIds.length === 0) {
          setClusterStats([]);
          setHardQuizzes([]);
          setHardQuestionsRec([]);
          setRecommendations([]);
          setScoreTrend([]);
          setIsLoading(false);
          return;
        }

        // Step 2: Fetch analytics_student_performance rows for these quizzes to build student-level features
        const { data: perfRows, error: perfErr } = await supabase
          .from("analytics_student_performance")
          .select("quiz_id, score, completion_time_seconds, student_name_norm, section_id")
          .in("quiz_id", quizIds);
        if (perfErr || !perfRows) throw perfErr;

        // Build per-student aggregated metrics
        type Agg = {
          scoreList: number[];
          timeSum: number;
          questionSum: number;
          quizSet: Set<string>;
        };
        const perStudent: Record<string, Agg> = {};
        perfRows.forEach((r: any) => {
          const key = `${(r.student_name_norm ?? "").trim()}|${r.section_id ?? "null"}`;
          perStudent[key] = perStudent[key] || { scoreList: [], timeSum: 0, questionSum: 0, quizSet: new Set() };
          const questions = quizQuestionCount[r.quiz_id] ?? 0;
          const scorePct = questions > 0 ? (Number(r.score ?? 0) / questions) * 100 : 0;
          perStudent[key].scoreList.push(scorePct);
          perStudent[key].timeSum += Number(r.completion_time_seconds ?? 0);
          perStudent[key].questionSum += questions;
          perStudent[key].quizSet.add(r.quiz_id);
        });
        const features: StudentFeature[] = Object.entries(perStudent).map(([key, agg]) => {
          const avgScore = agg.scoreList.length > 0 ? agg.scoreList.reduce((a, b) => a + b, 0) / agg.scoreList.length : 0;
          const avgTimePerQuestion = agg.questionSum > 0 ? agg.timeSum / agg.questionSum : 0;
          return {
            studentKey: key,
            avgScorePct: Math.round(avgScore * 100) / 100,
            avgTimePerQuestion: Math.round(avgTimePerQuestion * 100) / 100,
            totalQuizzes: agg.quizSet.size,
          };
        });

        // Step 3: Classify students into performance labels using robust thresholds
        // Determine score/time thresholds
        const scores = features.map((f) => f.avgScorePct).filter((n) => Number.isFinite(n));
        const times = features.map((f) => f.avgTimePerQuestion).filter((n) => Number.isFinite(n));
        const quantile = (arr: number[], q: number) => {
          if (!arr.length) return 0;
          const sorted = [...arr].sort((a, b) => a - b);
          const idx = (sorted.length - 1) * q;
          const lo = Math.floor(idx);
          const hi = Math.ceil(idx);
          if (lo === hi) return sorted[lo];
          const h = idx - lo;
          return sorted[lo] * (1 - h) + sorted[hi] * h;
        };
        let SCORE_HI = 75;
        let TIME_FAST = 25;
        if (features.length >= 20) {
          SCORE_HI = quantile(scores, 0.6);
          TIME_FAST = quantile(times, 0.4);
        }
        const labelByThresholds = (score: number, time: number) => {
          const highScore = score >= SCORE_HI;
          const fastTime = time <= TIME_FAST;
          if (highScore && fastTime) return "High Achiever";
          if (!highScore && fastTime) return "Guesser";
          if (!highScore && !fastTime) return "Struggler";
          return "On Track";
        };
        const counts: Record<string, number> = {
          "High Achiever": 0,
          Guesser: 0,
          Struggler: 0,
          "On Track": 0,
        };
        features.forEach((f) => {
          const label = labelByThresholds(f.avgScorePct, f.avgTimePerQuestion);
          counts[label]++;
        });
        const totalStudents = features.length;
        const clusterArray: ClusterStat[] = Object.entries(counts).map(([label, count]) => ({
          label,
          count,
          percent: totalStudents > 0 ? Math.round((count / totalStudents) * 1000) / 10 : 0,
        }));
        // Sort clusters by count descending
        clusterArray.sort((a, b) => b.count - a.count);

        // Step 4: Compute hardest quizzes based on avg score (lowest 3)
        // Use analytics_student_performance (perfRows) aggregated by quiz_id
        const perfAgg: Record<string, { scoreSum: number; count: number }> = {};
        perfRows.forEach((r: any) => {
          const qid = r.quiz_id;
          perfAgg[qid] = perfAgg[qid] || { scoreSum: 0, count: 0 };
          perfAgg[qid].scoreSum += Number(r.score ?? 0);
          perfAgg[qid].count += 1;
        });
        const quizzes: HardQuiz[] = [];
        quizRows.forEach((q: any) => {
          const agg = perfAgg[q.id] || { scoreSum: 0, count: 0 };
          const attempts = agg.count;
          const avgScore = attempts > 0 && quizQuestionCount[q.id] > 0 ? (agg.scoreSum / (attempts * quizQuestionCount[q.id])) * 100 : 0;
          quizzes.push({ title: q.title, avgScore: Math.round(avgScore * 100) / 100, attempts });
        });
        quizzes.sort((a, b) => a.avgScore - b.avgScore);
        const worstQuizzes = quizzes.slice(0, Math.min(3, quizzes.length));

        // Step 5: Compute hardest questions overall (top 5 lowest accuracy)
        // Fetch quiz_questions and quiz_responses again (could optimize by using earlier requests but okay here)
        const { data: questionRows, error: questionErr } = await supabase
          .from("quiz_questions")
          .select("id, quiz_id, type, text")
          .in("quiz_id", quizIds);
        if (questionErr || !questionRows) throw questionErr;
        const { data: responseRows, error: responseErr } = await supabase
          .from("quiz_responses")
          .select("question_id, quiz_id, time_spent_seconds, is_correct")
          .in("quiz_id", quizIds);
        if (responseErr || !responseRows) throw responseErr;
        const responsesByQ: Record<string, { correct: number; total: number; timeSum: number }> = {};
        responseRows.forEach((r: any) => {
          const qid = r.question_id;
          responsesByQ[qid] = responsesByQ[qid] || { correct: 0, total: 0, timeSum: 0 };
          const row = responsesByQ[qid];
          row.total++;
          row.correct += r.is_correct ? 1 : 0;
          row.timeSum += Number(r.time_spent_seconds ?? 0);
        });
        const qStats: HardQuestionRec[] = [];
        questionRows.forEach((qRow: any) => {
          const stats = responsesByQ[qRow.id];
          if (!stats || stats.total < 3) return; // require at least 3 responses for reliability
          const acc = (stats.correct / stats.total) * 100;
          const avgT = stats.timeSum / stats.total;
          qStats.push({
            question: qRow.text,
            quizTitle: quizRows.find((qr: any) => qr.id === qRow.quiz_id)?.title || "Unknown",
            accuracy: Math.round(acc * 100) / 100,
            avgTime: Math.round(avgT * 100) / 100,
          });
        });
        qStats.sort((a, b) => {
          if (a.accuracy === b.accuracy) return b.avgTime - a.avgTime;
          return a.accuracy - b.accuracy;
        });
        const topHardQuestions = qStats.slice(0, Math.min(5, qStats.length));

        // Step 6: Build performance trend (average score per month)
        // Group perfRows by month of created_at? analytics_student_performance table lacks created_at in select; but we can join created_at or use date of record? We'll approximate using average of responded month from perfRows' created_at; we need to refetch created_at.
        const { data: perfWithDates, error: perfDatesErr } = await supabase
          .from("analytics_student_performance")
          .select("quiz_id, score, created_at")
          .in("quiz_id", quizIds);
        if (perfDatesErr || !perfWithDates) throw perfDatesErr;
        const trendMap: Record<string, { scoreSum: number; count: number }> = {};
        perfWithDates.forEach((row: any) => {
          const dt = new Date(row.created_at);
          if (Number.isNaN(dt.getTime())) return;
          const key = dt.toLocaleString("default", { month: "short" }) + " " + dt.getFullYear().toString().slice(-2);
          trendMap[key] = trendMap[key] || { scoreSum: 0, count: 0 };
          trendMap[key].scoreSum += Number(row.score ?? 0);
          trendMap[key].count++;
        });
        const trendPoints: { month: string; avgScore: number }[] = Object.entries(trendMap)
          .map(([month, agg]) => {
            const avg = agg.count > 0 ? (agg.scoreSum / agg.count) : 0;
            return { month, avgScore: Math.round((avg / 100) * 1000) / 10 }; // convert raw score (points) into % based on assumption of 100 max (approx)
          })
          .sort((a, b) => {
            const parseKey = (k: string) => {
              const [mStr, yrStr] = k.split(" ");
              const monthIndex = new Date(mStr + " 1, 2000").getMonth();
              return { year: parseInt("20" + yrStr, 10), month: monthIndex };
            };
            const ak = parseKey(a.month);
            const bk = parseKey(b.month);
            if (ak.year === bk.year) return ak.month - bk.month;
            return ak.year - bk.year;
          });

        // Step 7: Generate recommendations based on computed stats
        const recs: RecommendationItem[] = [];
        // Cluster-based recommendations
        const clusterObj: Record<string, ClusterStat> = {};
        clusterArray.forEach((c) => (clusterObj[c.label] = c));
        if (clusterObj["Guesser"] && clusterObj["Guesser"].percent >= 30) {
          recs.push({
            title: "Reduce Guessing Behaviour",
            description:
              "A significant portion of students fall into the 'Guesser' category, indicating they may be guessing rather than understanding the material.",
            actionItems: [
              "Encourage students to review lecture materials before attempting quizzes.",
              "Incorporate more guided practice and formative assessments.",
              "Offer feedback sessions to help clarify misunderstandings.",
            ],
            priority: "high",
          });
        }
        if (clusterObj["Struggler"] && clusterObj["Struggler"].percent >= 30) {
          recs.push({
            title: "Support Struggling Students",
            description:
              "A large group of students are struggling with quizzes. This suggests the material may be too challenging or insufficiently explained.",
            actionItems: [
              "Break down complex topics into simpler subtopics.",
              "Provide additional examples and practice questions.",
              "Consider peer mentoring or study groups for reinforcement.",
            ],
            priority: "high",
          });
        }
        if (clusterObj["High Achiever"] && clusterObj["High Achiever"].percent >= 25) {
          recs.push({
            title: "Extend High Achievers",
            description:
              "Many students are excelling. They may benefit from additional challenges to maintain engagement.",
            actionItems: [
              "Introduce enrichment activities and advanced problem sets.",
              "Offer optional research or extension projects.",
              "Provide leadership roles in group work to support peers.",
            ],
            priority: "medium",
          });
        }
        // Hard quizzes recommendation
        if (worstQuizzes.length > 0) {
          const titles = worstQuizzes.map((q) => `${q.title} (${q.avgScore.toFixed(1)}%)`).join(", ");
          recs.push({
            title: "Revisit Difficult Quizzes",
            description: `The following quizzes have the lowest average scores: ${titles}. Consider reviewing the underlying concepts and question phrasing.`,
            actionItems: [
              "Identify which questions most students missed.",
              "Provide additional lectures or resources covering those topics.",
              "Offer a low-stakes practice quiz for revision.",
            ],
            priority: "medium",
          });
        }
        // Hard questions recommendation
        if (topHardQuestions.length > 0) {
          recs.push({
            title: "Review Hard Questions",
            description:
              "Some questions consistently have low correct rates and high response times, indicating they may be too challenging or ambiguous.",
            actionItems: [
              "Examine the wording of difficult questions for clarity.",
              "Provide students with additional practice on these topics.",
              "Discuss common misconceptions revealed by these questions.",
            ],
            priority: "medium",
          });
        }
        // General recommendation if few data points
        if (recs.length === 0) {
          recs.push({
            title: "Explore Student Performance",
            description:
              "There is limited data available. Encourage students to complete more quizzes for better insights.",
            actionItems: [
              "Assign more quizzes covering key concepts.",
              "Promote timely completion of assignments.",
              "Remind students about the importance of consistent practice.",
            ],
            priority: "low",
          });
        }
        // Update state
        setClusterStats(clusterArray);
        setHardQuizzes(worstQuizzes);
        setHardQuestionsRec(topHardQuestions);
        setRecommendations(recs);
        setScoreTrend(trendPoints);
      } catch (err) {
        console.error("Error generating recommendations:", err);
        setClusterStats([]);
        setHardQuizzes([]);
        setHardQuestionsRec([]);
        setRecommendations([]);
        setScoreTrend([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecommendations();
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Student cluster distribution and score trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Student Performance Segments</CardTitle>
            <CardDescription>Distribution of learners by performance level</CardDescription>
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
                  <Tooltip formatter={(value: any, name: string) => {
                    if (name === "count") return [`${value}`, "Students"];
                    if (name === "percent") return [`${value}%`, "Percent"];
                    return [value, name];
                  }} />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="Count"
                    fill="#3b82f6"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="percent"
                    name="Percent"
                    fill="#f59e0b"
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
                  <Tooltip formatter={(value: any) => [`${value}%`, "Avg Score"]} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    name="Average Score (%)"
                    stroke="#10b981"
                    dot={{ r: 4 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Hard quizzes and questions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Challenging Quizzes</CardTitle>
            <CardDescription>Quizzes with the lowest average scores</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quiz</TableHead>
                    <TableHead className="text-right">Avg Score (%)</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hardQuizzes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No quiz data available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    hardQuizzes.map((q, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium truncate max-w-[160px]" title={q.title}>{q.title}</TableCell>
                        <TableCell className="text-right">{q.avgScore.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{q.attempts}</TableCell>
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
              Questions with the lowest accuracy and highest response times
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Quiz</TableHead>
                    <TableHead className="text-right">Accuracy (%)</TableHead>
                    <TableHead className="text-right">Avg Time (s)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hardQuestionsRec.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No question data available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    hardQuestionsRec.map((q, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="truncate max-w-[200px]" title={q.question}>{q.question.length > 60 ? `${q.question.slice(0, 57)}...` : q.question}</TableCell>
                        <TableCell className="truncate max-w-[160px]" title={q.quizTitle}>{q.quizTitle}</TableCell>
                        <TableCell className="text-right">{q.accuracy.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{q.avgTime.toFixed(2)}</TableCell>
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
        <CardHeader className="flex flex-row items-center gap-2">
          <LightbulbIcon className="h-5 w-5 text-yellow-500" />
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
              <p className="text-muted-foreground">No recommendations available.</p>
            ) : (
              recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="border-l-4 pl-4 py-1"
                  style={{
                    borderColor:
                      rec.priority === "high"
                        ? "rgb(239, 68, 68)"
                        : rec.priority === "medium"
                        ? "rgb(234, 179, 8)"
                        : "rgb(34, 197, 94)",
                  }}
                >
                  <h4 className="text-lg font-medium mb-2">{rec.title}</h4>
                  <p className="text-muted-foreground mb-3">{rec.description}</p>
                  <ul className="space-y-1">
                    {rec.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start">
                        <span className="mr-2 text-lg">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs inline-flex items-center">
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
    </div>
  );
};

export default Recommendations;