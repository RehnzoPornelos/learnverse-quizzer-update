// StudentProgressChart.tsx
// - Axis labels no longer overlap (bigger margins + outside positioning + tickMargin)
// - Chart and "Cluster Details" now share the SAME fixed color mapping:
//     High Achievers = green, On-Track = yellow, Needs Support = blue
// - Legend colors follow the mapping because we render <Scatter> by label
// - Everything else kept as-is

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AnyRow = Record<string, any>;

type StudentFeature = {
  studentKey: string;             // `${student_name_norm}|${section_id}`
  studentName: string;
  sectionId: string | null;
  avgScorePct: number;            // average % across quizzes
  totalQuizzes: number;
  avgTimePerQuestion: number;     // seconds
};

type ClusteredStudent = StudentFeature & { cluster: number; clusterLabel: "High Achievers" | "On-Track" | "Needs Support" | string };

type Props = { selectedSection?: string | null }; // "all" or section_id or null

// ---- FIXED CLUSTER COLORS (shared by chart & table) ----
const CLUSTER_COLORS: Record<string, string> = {
  "High Achievers": "#00A86B", // green
  "On-Track": "#F59E0B",       // yellow/orange
  "Needs Support": "#3B82F6",  // blue
};

// ---- helpers ----
const toNum = (v:any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round = (n:number, p=2) => Math.round(n*10**p)/10**p;
const avg = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;

function percentileDomain(values:number[], lo=5, hi=95, padRatio=0.08): [number, number] {
  if (!values.length) return [0, 1];
  const v = [...values].sort((a,b)=>a-b);
  const q = (p:number) => v[Math.max(0, Math.min(v.length-1, Math.floor((p/100)*v.length)))];
  let min = q(lo), max = q(hi);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max-min)*padRatio;
  return [Math.max(0, min-pad), max+pad];
}

// Rank centroids and name clusters
function nameClustersByScore(centroids:number[][]): string[] {
  // centroid layout we use: [avgScorePct, avgPace]
  const pairs = centroids.map((c, idx)=>({idx, score:c[0]}));
  pairs.sort((a,b)=>b.score-a.score);
  const names = Array(centroids.length).fill("On-Track");
  if (pairs[0]) names[pairs[0].idx] = "High Achievers";
  if (pairs[pairs.length-1]) names[pairs[pairs.length-1].idx] = "Needs Support";
  for (let i=1;i<pairs.length-1;i++) names[pairs[i].idx] = "On-Track";
  return names;
}

// Simple k-means (2D only)
function euclid(a:number[], b:number[]) { const dx=a[0]-b[0], dy=a[1]-b[1]; return Math.hypot(dx,dy); }
function kmeans2D(X:number[][], k:number, maxIter=80) {
  const n=X.length; if (!n) return {labels:[], centroids:[] as number[][]};
  // init: pick k random points
  const idxs = Array.from({length:n}, (_,i)=>i);
  for (let i=idxs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [idxs[i],idxs[j]]=[idxs[j],idxs[i]];}
  const centroids = idxs.slice(0,Math.min(k,n)).map(i=>X[i].slice(0,2));
  const labels = Array(n).fill(0);
  let changed=true, iter=0;
  while (changed && iter<maxIter) {
    changed=false; iter++;
    // assign
    for (let i=0;i<n;i++){
      let best=0, bestD=Infinity;
      for (let c=0;c<centroids.length;c++){
        const d=euclid(X[i],centroids[c]);
        if(d<bestD){bestD=d; best=c;}
      }
      if (labels[i]!==best){labels[i]=best; changed=true;}
    }
    // update
    const sums = centroids.map(()=>[0,0]);
    const counts = centroids.map(()=>0);
    for (let i=0;i<n;i++){ const c=labels[i]; sums[c][0]+=X[i][0]; sums[c][1]+=X[i][1]; counts[c]++; }
    for (let c=0;c<centroids.length;c++){
      if (counts[c]===0) continue;
      centroids[c][0]=sums[c][0]/counts[c];
      centroids[c][1]=sums[c][1]/counts[c];
    }
  }
  return {labels, centroids};
}

export default function StudentProgressChart({ selectedSection = "all" }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [clustered, setClustered] = useState<ClusteredStudent[]>([]);
  const [kUsed, setKUsed] = useState<number | null>(null);
  const [centroids, setCentroids] = useState<number[][]>([]);
  const [counts, setCounts] = useState({students:0, quizzes:0});
  const [sectionCodeMap, setSectionCodeMap] = useState<Map<string,string>>(new Map());
  const { user } = useAuth();

  // NEW: filter which cluster to show in the table
  const [clusterFilter, setClusterFilter] = useState<"ALL" | "High Achievers" | "On-Track" | "Needs Support">("ALL");

  const run = useCallback(async () => {
    setIsRunning(true);
    setClustered([]); setKUsed(null); setCentroids([]); setCounts({students:0, quizzes:0});

    try {
      if (!user?.id) return;

      // A) Only this professor's PUBLISHED quizzes
      const { data: quizRows, error: quizErr } = await supabase
        .from("quizzes")
        .select("id, question_no")
        .eq("published", true)
        .eq("user_id", user.id);
      if (quizErr) throw quizErr;

      const quizIds = (quizRows ?? []).map(r => String(r.id));
      const quizQMap = new Map<string, number>();
      for (const r of quizRows ?? []) quizQMap.set(String(r.id), Number(r.question_no ?? 0));

      if (quizIds.length === 0) {
        setCounts({ students: 0, quizzes: 0 });
        setClustered([]); setKUsed(null); setCentroids([]);
        setIsRunning(false);
        return;
      }

      // B) section codes
      const { data: qsRows } = await supabase
        .from("quiz_sections")
        .select("section_id")
        .in("quiz_id", quizIds);
      const sectionIds = Array.from(new Set((qsRows ?? []).map(r => String(r.section_id)))).filter(Boolean);

      const { data: sectionRows } = await supabase
        .from("class_sections")
        .select("id, code")
        .in("id", sectionIds.length ? sectionIds : ["00000000-0000-0000-0000-000000000000"]);

      const map = new Map<string, string>();
      for (const r of sectionRows ?? []) map.set(String(r.id), String(r.code));
      setSectionCodeMap(map);

      // C) analytics for ONLY those quizzes (optional section filter)
      const perf: AnyRow[] = [];
      const pageSize = 1000; let from=0, to=pageSize-1;
      while (true) {
        let q = supabase
          .from("analytics_student_performance")
          .select("*")
          .in("quiz_id", quizIds)
          .range(from, to);

        if (selectedSection && selectedSection !== "all") q = q.eq("section_id", selectedSection);

        const { data, error } = await q;
        if (error) throw error;

        const batch = (data as AnyRow[]) ?? [];
        perf.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize; to += pageSize;
      }

      if (!perf.length) { setCounts({students:0, quizzes:quizIds.length}); return; }

      type Agg = {
        studentName: string; sectionId: string | null;
        pctScores: number[]; timeSum: number; questionSum: number; quizIds: Set<string>;
      };
      const perStudent: Record<string, Agg> = {};

      for (const r of perf) {
        const sid = (r.section_id ?? null) as string | null;
        const name = String(r.student_name ?? "");
        const key = `${String(r.student_name_norm ?? "").trim()}|${sid ?? "null"}`;
        const qid = String(r.quiz_id ?? "");
        const rawScore = toNum(r.score);
        const secs = toNum(r.completion_time_seconds);
        const qno = quizQMap.get(qid) ?? 0;

        if (!perStudent[key]) {
          perStudent[key] = { studentName: name, sectionId: sid, pctScores: [], timeSum: 0, questionSum: 0, quizIds: new Set() };
        }
        const pct = qno > 0 ? (rawScore / qno) * 100 : 0;
        perStudent[key].pctScores.push(pct);
        perStudent[key].timeSum += secs;
        perStudent[key].questionSum += qno;
        if (qid) perStudent[key].quizIds.add(qid);
      }

      const feats: StudentFeature[] = Object.entries(perStudent).map(([key, a])=>({
        studentKey: key,
        studentName: a.studentName || key.split("|")[0],
        sectionId: a.sectionId,
        avgScorePct: round(avg(a.pctScores), 2),
        totalQuizzes: a.quizIds.size || a.pctScores.length,
        avgTimePerQuestion: round(a.questionSum > 0 ? a.timeSum / a.questionSum : 0, 2),
      }));

      if (feats.length < 2) { setCounts({students:feats.length, quizzes:quizIds.length}); return; }

      const X = feats.map(f=>[f.avgScorePct, f.avgTimePerQuestion]);
      const k = Math.min(3, Math.max(2, feats.length - 1));
      const { labels, centroids } = kmeans2D(X, k, 80);
      const names = nameClustersByScore(centroids);

      setClustered(feats.map((f,i)=>({
        ...f,
        cluster: labels[i],
        clusterLabel: (names[labels[i]] as ClusteredStudent["clusterLabel"]) || "On-Track"
      })));
      setKUsed(k);
      setCentroids(centroids);
      setCounts({students:feats.length, quizzes:quizIds.length});
    } catch (e) {
      console.error(e);
      setClustered([]); setKUsed(null); setCentroids([]); setCounts({students:0, quizzes:0});
    } finally {
      setIsRunning(false);
    }
  }, [selectedSection, user?.id]);

  // Chart data
  const scatterData = useMemo(
    () =>
      clustered.map((s, idx) => ({
        id: `${s.cluster}-${s.studentKey}-${idx}`,
        x: s.avgScorePct,
        y: s.avgTimePerQuestion,
        name: s.studentName || s.studentKey.split("|")[0],
        sectionId: s.sectionId || "",
        cluster: s.cluster,
        label: s.clusterLabel,
      })),
    [clustered]
  );

  const xVals = scatterData.map(d=>d.x);
  const yVals = scatterData.map(d=>d.y);
  const xDomain = percentileDomain(xVals, 5, 95);
  const yDomain = percentileDomain(yVals, 5, 95);

  // Group for the details table, sorted by avg score
  const grouped = useMemo(()=>{
    const m: Record<number, ClusteredStudent[]> = {};
    for (const s of clustered) (m[s.cluster] = m[s.cluster] || []).push(s);
    Object.values(m).forEach(a => a.sort((a,b)=> b.avgScorePct - a.avgScorePct));
    return m;
  }, [clustered]);

  // Cluster filter → determine which cluster IDs to render
  const visibleClusterIds = useMemo(() => {
    if (clusterFilter === "ALL") return Object.keys(grouped).map(Number);
    return Object.keys(grouped)
      .map(Number)
      .filter(cid => (grouped[cid]?.[0]?.clusterLabel ?? "") === clusterFilter);
  }, [grouped, clusterFilter]);

  const suggestedAction = (label:string) => {
    switch (label) {
      case "High Achievers": return "Enrichment tasks / advanced challenges";
      case "On-Track": return "Maintain pace, occasional formative checks";
      case "Needs Support": return "Targeted remediation & more practice";
      default: return "Monitor progress";
    }
  };

  // Unique labels present in the current data (keeps legend stable & accurate)
  const labelsInUse = useMemo(() => {
    const set = new Set(scatterData.map(d => d.label));
    // Preserve a friendly legend order
    const order = ["High Achievers", "Needs Support", "On-Track"];
    return order.filter(l => set.has(l));
  }, [scatterData]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>K-Means: Student Performance Clusters</CardTitle>
          <CardDescription>
            Live data (published quizzes). X = Avg Score (%), Y = Avg Time per Question (s).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              Section: {selectedSection && selectedSection !== "all"
                ? (sectionCodeMap.get(selectedSection) ?? selectedSection)
                : "All"}
            </Badge>
            {kUsed != null && <Badge>k = {kUsed}</Badge>}
            <Badge variant="outline">Students: {counts.students}</Badge>
            <Badge variant="outline">Quizzes: {counts.quizzes}</Badge>
            <Button onClick={run} disabled={isRunning}>{isRunning ? "Clustering…" : "Run Clustering"}</Button>
          </div>

          <div className="h-[480px]">
            <ResponsiveContainer width="100%" height="100%">
              {/* BIGGER margins + outside labels + tickMargin fix the overlap */}
              <ScatterChart margin={{ top: 40, right: 30, left: 110, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={xDomain as any}
                  tickMargin={12}
                  label={{ value: "Avg Score (%)", position: "bottom", offset: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={yDomain as any}
                  tickMargin={12}
                  // position 'left' puts it outside; plenty of left margin avoids collision
                  label={{ value: "Avg Time per Question (s)", angle: -90, position: "left", offset: 0 }}
                />
                <Tooltip
                  formatter={(v:any, k:any) => {
                    if (k === "x") return [`${Number(v).toFixed(2)}%`, "Avg Score"];
                    if (k === "y") return [`${Number(v).toFixed(2)}s`, "Avg Time/Q"];
                    return [v, k];
                  }}
                  labelFormatter={() => ""}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <Legend
                  verticalAlign="top"
                  align="center"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: 8 }}
                />

                {/* Render one <Scatter> per LABEL, with fixed color mapping */}
                {labelsInUse.map((label) => (
                  <Scatter
                    key={`lab-${label}`}
                    name={label}
                    data={scatterData.filter(d => d.label === label)}
                    fill={CLUSTER_COLORS[label] || "#999"}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Cluster Details</CardTitle>
            <CardDescription>Actionable metrics grouped by cluster</CardDescription>
          </div>

          {/* Cluster filter */}
          <div className="flex items-center gap-2">
            <Select value={clusterFilter} onValueChange={(v:any)=>setClusterFilter(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All clusters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All clusters</SelectItem>
                <SelectItem value="High Achievers">High Achievers</SelectItem>
                <SelectItem value="On-Track">On-Track</SelectItem>
                <SelectItem value="Needs Support">Needs Support</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          {visibleClusterIds.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Click <b>Run Clustering</b> to load data and compute clusters.
            </div>
          ) : (
            visibleClusterIds.map((cid) => {
              const rows = grouped[cid] || [];
              if (!rows.length) return null;
              const label = rows[0]?.clusterLabel ?? `Cluster ${cid + 1}`;
              const dotColor = CLUSTER_COLORS[label] || "#999";

              return (
                <div key={cid} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: dotColor }} />
                    <div className="font-semibold">{label}</div>
                    <Badge variant="secondary">{rows.length} student(s)</Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead className="text-right">Quizzes Taken</TableHead>
                          <TableHead className="text-right">Avg Pace (s/Q)</TableHead>
                          <TableHead className="text-right">Avg Score (%)</TableHead>
                          <TableHead>Suggested Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((s) => (
                          <TableRow key={`${s.studentKey}-${s.cluster}`}>
                            <TableCell className="font-medium">{s.studentName}</TableCell>
                            <TableCell>{s.sectionId ? (sectionCodeMap.get(s.sectionId) ?? "—") : "—"}</TableCell>
                            <TableCell className="text-right">{s.totalQuizzes}</TableCell>
                            <TableCell className="text-right">{s.avgTimePerQuestion.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{s.avgScorePct.toFixed(2)}</TableCell>
                            <TableCell>{suggestedAction(s.clusterLabel)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableCaption className="text-left">
                        Centroids:{" "}
                        {centroids.length
                          ? centroids
                              .map((c, idx) => `[${idx + 1}] score=${c[0].toFixed(1)}%, pace=${c[1].toFixed(2)}s/Q`)
                              .join("  |  ")
                          : "—"}
                      </TableCaption>
                    </Table>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}