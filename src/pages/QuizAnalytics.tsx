import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getSocket } from '@/lib/socket';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { toast } from 'sonner';

type MCQOption =
  | { id: string; text: string }
  | { value: string; label: string }
  | string;

interface StudentState {
  name: string;
  answersMap: Record<string, boolean>;
  answered: number;
  correct: number;
}

const normalizeString = (s: any) =>
  String(s ?? '')
    .toLowerCase()
    .trim();

const wordSet = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );

const QuizAnalytics = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quizTitle, setQuizTitle] = useState('');
  const [students, setStudents] = useState<Record<string, StudentState>>({});
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizCode, setQuizCode] = useState('');
  const socketRef = useRef<any>(null);

  // Map question_id -> normalized meta used for correctness checks
  const correctAnswersRef = useRef<
    Record<
      string,
      {
        type: 'multiple_choice' | 'true_false' | 'essay';
        // a set of acceptable “correct” tokens for MCQ/TF
        correctTokens?: Set<string>;
        // normalized canonical essay string
        essayAnswer?: string;
      }
    >
  >({});

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      // quiz meta
      const { data: quiz, error: quizErr } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', id)
        .single();
      if (quizErr || !quiz) return;
      setQuizTitle(quiz.title);
      setQuizCode(quiz.invitation_code || '');

      // questions + correctness map
      const { data: questions, error: qErr } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', id);
      if (qErr || !questions) return;
      setTotalQuestions(questions.length);

      const map: typeof correctAnswersRef.current = {};
      for (const q of questions) {
        const type = String(q.type || '').toLowerCase();

        if (type === 'multiple_choice' || type === 'mcq') {
          // Build a set of acceptable tokens for the correct option.
          // Accept any of:
          //  - the option id ('a','b',…)
          //  - the option index ("0","1",…)
          //  - the option text (lowercased)
          //  - the raw correct_answer value if it’s already an id/index/text
          const options: unknown[] = Array.isArray(q.options) ? (q.options as unknown[]) : [];
          const tokens = new Set<string>();

          const optAtIndex = (idx: number) => {
            const raw = options[idx];
            if (raw == null) return { id: '', text: '' };
            if (typeof raw === 'string') return { id: String.fromCharCode(97 + idx), text: raw };
            const id = (raw as any).id ?? (raw as any).value ?? String.fromCharCode(97 + idx);
            const text = (raw as any).text ?? (raw as any).label ?? '';
            return { id: String(id), text: String(text) };
          };

          // normalize correct_answer from DB
          const ca = q.correct_answer;
          let correctIndex: number | null = null;
          let correctId = '';
          let correctText = '';

          // If correct_answer is like 'a'/'b'
          if (typeof ca === 'string' && ca.length === 1 && /[a-z]/i.test(ca)) {
            correctIndex = ca.toLowerCase().charCodeAt(0) - 97;
          }
          // If it’s a number or numeric string – treat as index
          else if (typeof ca === 'number' || (typeof ca === 'string' && /^\d+$/.test(ca))) {
            correctIndex = Number(ca);
          }
          // Otherwise, try to match by text or id against options
          else if (typeof ca === 'string') {
            const nCA = normalizeString(ca);
            const byTextIdx = options.findIndex((o, i) => {
              const { id, text } = optAtIndex(i);
              return normalizeString(text) === nCA || normalizeString(id) === nCA;
            });
            if (byTextIdx >= 0) correctIndex = byTextIdx;
          }

          if (correctIndex != null && correctIndex >= 0) {
            const { id: cid, text: ctext } = optAtIndex(correctIndex);
            correctId = cid;
            correctText = ctext;
          }

          // If we didn’t resolve via index, also try to see if ca is already an option id/text
          if (!correctId && typeof ca === 'string') {
            correctId = normalizeString(ca);
          }

          // Build tokens
          if (correctId) tokens.add(normalizeString(correctId));
          if (correctIndex != null && correctIndex >= 0) tokens.add(String(correctIndex));
          if (correctText) tokens.add(normalizeString(correctText));

          map[q.id] = { type: 'multiple_choice', correctTokens: tokens };
        } else if (type === 'true_false' || type === 'true-false' || type === 'truefalse') {
          // Accept: true/false, 'a'/'b', 't'/'f', '1'/'0', 'yes'/'no'
          const tokens = new Set<string>();
          const ca = q.correct_answer;
          const truth =
            typeof ca === 'boolean'
              ? ca
              : normalizeString(ca) === 'true' ||
                normalizeString(ca) === 't' ||
                normalizeString(ca) === '1' ||
                normalizeString(ca) === 'yes' ||
                normalizeString(ca) === 'a';

          if (truth) {
            ['true', 't', '1', 'yes', 'a'].forEach((t) => tokens.add(t));
          } else {
            ['false', 'f', '0', 'no', 'b'].forEach((t) => tokens.add(t));
          }

          map[q.id] = { type: 'true_false', correctTokens: tokens };
        } else {
          // essay / short answer
          map[q.id] = { type: 'essay', essayAnswer: normalizeString(q.correct_answer ?? '') };
        }
      }
      correctAnswersRef.current = map;
    };

    load();
  }, [id]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // seed students on open/join (no scoring here)
    const seed = (payload: any) => {
      const names: string[] = Array.isArray(payload?.participants) ? payload.participants : [];
      setStudents((prev) => {
        const next = { ...prev };
        names.forEach((n) => {
          if (!next[n]) next[n] = { name: n, answersMap: {}, answered: 0, correct: 0 };
        });
        return next;
      });
    };

    socket.on('server:quiz-opened', seed);
    socket.on('server:student-joined', seed);

    // scoring
    socket.on('server:answer-received', (data: any) => {
      const { name, question_id, answer } = data || {};
      if (!name || !question_id) return;

      const meta = correctAnswersRef.current[question_id];
      if (!meta) return;

      let isCorrect = false;

      if (meta.type === 'multiple_choice' || meta.type === 'true_false') {
        const token = normalizeString(answer);
        if (meta.correctTokens?.has(token)) {
          isCorrect = true;
        }
      } else {
        // essay: ≥2 shared keywords OR ≥50% of distinct keywords match
        const stu = wordSet(String(answer ?? ''));
        const key = wordSet(String(meta.essayAnswer ?? ''));
        let m = 0;
        key.forEach((w) => {
          if (stu.has(w)) m++;
        });
        if (m >= 2 || (key.size > 0 && m >= Math.ceil(key.size / 2))) {
          isCorrect = true;
        }
      }

      setStudents((prev) => {
        const next = { ...prev };
        const s = next[name] || { name, answersMap: {}, answered: 0, correct: 0 };
        s.answersMap[question_id] = isCorrect;
        s.answered = Object.keys(s.answersMap).length;
        s.correct = Object.values(s.answersMap).filter(Boolean).length;
        next[name] = { ...s };
        return next;
      });
    });

    socket.on('server:client-left', seed);

    socket.on('server:quiz-end', () => {
      toast.success('Quiz ended');
      navigate(`/quiz/results/${id}`);
    });

    return () => {
      socket.off('server:quiz-opened', seed);
      socket.off('server:student-joined', seed);
      socket.off('server:answer-received');
      socket.off('server:client-left', seed);
      socket.off('server:quiz-end');
    };
  }, [id, navigate]);

  const handleEndQuiz = () => {
    if (!quizCode) return;
    const socket = socketRef.current || getSocket();
    socket.emit('host_end', { room: quizCode });
  };

  // sort by correct desc, then by answered desc, then name asc
  const sorted = Object.values(students).sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (b.answered !== a.answered) return b.answered - a.answered;
    return a.name.localeCompare(b.name);
    });

  return (
    <div className="min-h-screen bg-muted/20 p-4">
      <div className="max-w-5xl mx-auto pt-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Live Quiz Results</h1>
            <p className="text-muted-foreground">{quizTitle}</p>
            <p className="text-muted-foreground mt-1">Students Finished: {sorted.length}</p>
            <p className="text-muted-foreground mt-1">Total Questions: {totalQuestions}</p>
          </div>
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            <Button onClick={handleEndQuiz}>End Quiz</Button>
          </div>
        </div>

        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">Rank</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Progress</th>
                  <th className="px-4 py-2 text-left">Correct Answers</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((stu, idx) => {
                  const progress = totalQuestions > 0 ? (stu.answered / totalQuestions) * 100 : 0;
                  const correctPct = totalQuestions > 0 ? (stu.correct / totalQuestions) * 100 : 0;
                  return (
                    <tr key={stu.name} className="border-b">
                      <td className="px-4 py-2">{idx + 1}</td>
                      <td className="px-4 py-2 font-medium">{stu.name}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center">
                          <div className="flex-1 mr-2">
                            <div className="h-3 relative w-full rounded-md bg-muted/50">
                              <div
                                className="absolute top-0 left-0 h-full rounded-md bg-primary"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm">
                            {stu.answered}/{totalQuestions}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center">
                          <div className="flex-1 mr-2">
                            <div className="h-3 relative w-full rounded-md bg-muted/50">
                              <div
                                className="absolute top-0 left-0 h-full rounded-md bg-emerald-500 dark:bg-emerald-600"
                                style={{ width: `${Math.max(0, Math.min(100, correctPct))}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm">
                            {stu.correct}/{totalQuestions}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                      Waiting for students to finish...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default QuizAnalytics;