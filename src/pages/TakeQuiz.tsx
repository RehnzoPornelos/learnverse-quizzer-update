import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

// UI components for dialogs and textarea
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// ------- helpers: seeded shuffle so order is stable per student -------
function hashToInt(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function makePRNG(seed: number) {
  // xorshift32
  let x = seed || 123456789;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };
}
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  const rand = makePRNG(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Call FastAPI to grade short answers (returns { is_correct: boolean })
async function gradeShortAnswerViaBackend(questionId: string, student: string): Promise<boolean> {
  try {
    const r = await fetch(`${BACKEND_URL}/grade-short-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: questionId, student_answer: student }),
    });
    const j = await r.json();
    return Boolean(j?.is_correct);
  } catch {
    return false; // conservative on network error
  }
}

const MAX_LEAVE_WARNINGS = 3;

const TakeQuiz = () => {
  const hasSavedRef = useRef(false);
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [quizData, setQuizData] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [username, setUsername] = useState('');
  const [quizCode, setQuizCode] = useState<string>('');
  const socketRef = useRef<any>(null);

  // Anti-cheat
  const [leaveCount, setLeaveCount] = useState(0);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [showAutoSubmitDialog, setShowAutoSubmitDialog] = useState(false);
  const lastLeaveTsRef = useRef<number>(0);
  const isFinalizingRef = useRef(false);

  const { user } = useAuth();
  const [section, setSection] = useState<{ id: string; code?: string } | null>(null);

  // Time tracking per question
  const [questionStartTimes, setQuestionStartTimes] = useState<Record<string, number>>({});
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<string, number>>({});

  // Result handling and modals
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ total: number; correct: number }>({ total: 0, correct: 0 });
  const [showTimeUp, setShowTimeUp] = useState(false);

  useEffect(() => {
    if (!location.state?.username) {
      toast.error('User information missing');
      navigate('/join');
      return;
    }
    setUsername(location.state.username);
    if (location.state?.section) setSection(location.state.section);

    fetchQuizData();

    const socket = getSocket();
    socketRef.current = socket;
    socket.on('server:quiz-end', () => {
      toast.success('Quiz ended');
      navigate('/dashboard');
    });
    return () => {
      socket.off('server:quiz-end');
    };
  }, [id]);

  // ---- Helper: wait until quizData is loaded before auto-submit ----
  const waitForQuizReady = async (timeoutMs = 5000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (quizData && Array.isArray(quizData.questions) && quizData.questions.length > 0) return true;
      await new Promise((r) => setTimeout(r, 120));
    }
    return false;
  };

  // ---- Anti-cheat leave handling ----
  useEffect(() => {
    const handleLeave = () => {
      if (showScore) return;
      if (isFinalizingRef.current) return;
      const now = Date.now();
      if (now - lastLeaveTsRef.current < 1200) return; // debounce double-fires
      lastLeaveTsRef.current = now;

      setLeaveCount((prev) => {
        const next = prev + 1;
        if (next < MAX_LEAVE_WARNINGS) {
          setShowLeaveWarning(true);
        } else {
          // 3rd: show modal + auto-submit
          setShowLeaveWarning(false);
          setShowAutoSubmitDialog(true);
          if (!isFinalizingRef.current) {
            isFinalizingRef.current = true;
            (async () => {
              toast.error('You left the page 3 times. Submitting your quiz now.');
              const ready = await waitForQuizReady(6000);
              if (!ready) {
                try { await fetchQuizData(); } catch {}
                await new Promise((r) => setTimeout(r, 300));
              }
              finalizeQuiz();
            })();
          }
        }
        return next;
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleLeave();
    };
    const onWindowBlur = () => handleLeave();

    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [showScore, quizData]);

  function mapDbQuestionToUi(q: any) {
    const dbType = q.type;
    if (dbType === 'mcq' || dbType === 'multiple_choice') {
      const opts: string[] = Array.isArray(q.options) ? q.options : [];
      let correctId: string | null = null;
      if (q.correct_answer !== null && q.correct_answer !== undefined) {
        const ca = q.correct_answer;
        if (typeof ca === 'number' || (typeof ca === 'string' && /^\d+$/.test(ca))) {
          correctId = String(ca);
        } else if (typeof ca === 'string' && ca.length === 1 && /[a-z]/i.test(ca)) {
          const index = ca.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
          correctId = index >= 0 ? String(index) : null;
        } else if (typeof ca === 'string') {
          const idx = opts.findIndex((opt) => opt.trim().toLowerCase() === ca.trim().toLowerCase());
          if (idx >= 0) correctId = String(idx);
        }
      }
      return {
        id: q.id,
        text: q.text,
        type: 'multiple_choice',
        options: opts.map((text, idx) => ({ id: String(idx), text })),
        correctAnswer: correctId,
      };
    }

    if (dbType === 'true_false') {
      let correctId: string | null = null;
      if (q.correct_answer !== null && q.correct_answer !== undefined) {
        const ca = q.correct_answer;
        if (typeof ca === 'boolean') {
          correctId = ca ? 'true' : 'false';
        } else if (typeof ca === 'string') {
          const v = ca.trim().toLowerCase();
          correctId = v === 'true' || v === 'false' ? v : null;
        }
      }
      return {
        id: q.id,
        text: q.text,
        type: 'true_false',
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correctAnswer: correctId,
      };
    }

    // short_answer/essay mapped to essay UI
    return {
      id: q.id,
      text: q.text,
      type: 'essay',
      options: [],
      correctAnswer: typeof q.correct_answer === 'string' ? q.correct_answer : null,
    };
  }

  const fetchQuizData = async () => {
    try {
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', id)
        .single();
      if (quizError) throw quizError;

      const { data: questions, error: questionsError } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', id)
        .order('order_position', { ascending: true });
      if (questionsError) throw questionsError;

      // map to UI
      let normalized = (questions || []).map(mapDbQuestionToUi);

      // ---- NEW: per-student shuffle when quiz.is_rumbled === true ----
      if (quiz?.is_rumbled) {
        const sectionPart = location.state?.section?.id ?? section?.id ?? '';
        const seedStr = `${quiz.id}|${username}|${sectionPart}`;
        const seed = hashToInt(seedStr);
        normalized = shuffleWithSeed(normalized, seed);
      }

      setQuizData({ ...quiz, questions: normalized });
      setQuizCode(quiz?.invitation_code || '');
      setCurrentQuestionIndex(0); // ensure we start at first after loading

      if (!location.state?.section) {
        try {
          const { data: qs } = await supabase
            .from('quiz_sections')
            .select('section_id')
            .eq('quiz_id', id as string);
          if (Array.isArray(qs) && qs.length === 1) {
            const onlyId = qs[0].section_id as string;
            const { data: sec } = await supabase
              .from('class_sections')
              .select('id, code')
              .eq('id', onlyId)
              .maybeSingle();
            if (sec) setSection({ id: sec.id, code: sec.code || undefined });
          }
        } catch {}
      }

      if (quiz?.quiz_duration_seconds && Number(quiz.quiz_duration_seconds) > 0) {
        setTimeLeft(Number(quiz.quiz_duration_seconds));
      }
    } catch (error) {
      console.error('Error fetching quiz:', error);
      toast.error('Failed to load quiz');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAnswer = (questionId: string, answerId: string) => {
    setAnswers({ ...answers, [questionId]: answerId });
    if (quizCode) {
      const socket = socketRef.current || getSocket();
      socket.emit('student_answer', {
        room: quizCode,
        student_id: null,
        name: username,
        question_id: questionId,
        answer: answerId,
        ts: Date.now(),
      });
    }
  };

  const handleEssayAnswer = (questionId: string, text: string) => {
    setAnswers({ ...answers, [questionId]: text });
    if (quizCode) {
      const socket = socketRef.current || getSocket();
      socket.emit('student_answer', {
        room: quizCode,
        student_id: null,
        name: username,
        question_id: questionId,
        answer: text,
        ts: Date.now(),
      });
    }
  };

  const recordTimeForQuestion = (questionId: string) => {
    const start = questionStartTimes[questionId];
    if (start != null) {
      const elapsed = (Date.now() - start) / 1000;
      setQuestionTimeSpent((prev) => {
        const existing = prev[questionId] ?? 0;
        return { ...prev, [questionId]: existing + elapsed };
      });
      setQuestionStartTimes((prev) => ({ ...prev, [questionId]: Date.now() }));
    }
  };

  const currentQuestion = quizData?.questions?.[currentQuestionIndex];

  useEffect(() => {
    if (!currentQuestion) return;
    const qid: string = currentQuestion.id;
    setQuestionStartTimes((prev) => {
      if (prev[qid] !== undefined) return prev;
      return { ...prev, [qid]: Date.now() };
    });
  }, [currentQuestion?.id]);

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      if (quizData?.questions?.[currentQuestionIndex]) {
        recordTimeForQuestion(quizData.questions[currentQuestionIndex].id);
      }
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      if (quizData?.questions?.[currentQuestionIndex]) {
        recordTimeForQuestion(quizData.questions[currentQuestionIndex].id);
      }
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmitQuiz = () => {
    if (!quizData) return;
    const total = quizData.questions.length;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < total) {
      setShowConfirmSubmit(true);
      return;
    }
    finalizeQuiz();
  };

  // attempt_no helpers
  async function getNextAttemptNo(quizId: string, studentNameNorm: string) {
    try {
      const { data } = await supabase
        .from('analytics_student_performance')
        .select('attempt_no')
        .eq('quiz_id', quizId)
        .eq('student_name_norm', studentNameNorm)
        .order('attempt_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      const last = data?.attempt_no;
      const n = Number(last);
      return Number.isFinite(n) ? n + 1 : 1;
    } catch {
      return 1;
    }
  }
  async function hasTakenInSection(
    quizId: string,
    sectionId: string | null,
    studentNameNorm: string
  ): Promise<boolean> {
    try {
      const base = supabase
        .from('analytics_student_performance')
        .select('id')
        .eq('quiz_id', quizId)
        .eq('student_name_norm', studentNameNorm)
        .limit(1);
      const { data } = sectionId ? await base.eq('section_id', sectionId) : await base.is('section_id', null);
      return !!data && data.length > 0;
    } catch {
      return false;
    }
  }

  // ---- Finalize / persist ----
  const finalizeQuiz = async () => {
    try {
      if (hasSavedRef.current) {
        console.info('[finalizeQuiz] already saved – ignoring duplicate call');
        return;
      }
      hasSavedRef.current = true;
      isFinalizingRef.current = true;

      if (!quizData || !quizData.questions?.length) {
        console.warn('[finalizeQuiz] Missing quizData, retrying small wait…');
        const ready = await waitForQuizReady(3000);
        if (!ready) {
          toast.error('Cannot finish: quiz data missing.');
          return;
        }
      }

      const quizId: string | undefined =
        (quizData as any)?.id ?? (typeof id === 'string' ? id : undefined);
      const UUID_RX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!quizId || !UUID_RX.test(quizId)) {
        console.error('[finalizeQuiz] invalid quizId:', quizId);
        toast.error('Invalid quiz id. Please re-open the quiz and try again.');
        return;
      }

      // capture time on current question
      const updatedTimes: Record<string, number> = { ...questionTimeSpent };
      const currentQ = quizData.questions[currentQuestionIndex];
      if (currentQ) {
        const start = questionStartTimes[currentQ.id];
        if (start != null) {
          const elapsed = (Date.now() - start) / 1000;
          const existing = updatedTimes[currentQ.id] ?? 0;
          updatedTimes[currentQ.id] = existing + elapsed;
        }
      }

      const total = quizData.questions.length;
      let correct = 0;

      const responseRows: any[] = [];
      for (const q of quizData.questions) {
        const studentAnswer = answers[q.id];
        const correctAnswer = (q as any).correctAnswer;

        let isCorrect = false;

        if (q.type === 'multiple_choice') {
          isCorrect =
            studentAnswer !== undefined &&
            correctAnswer != null &&
            studentAnswer === correctAnswer;
        } else if (q.type === 'true_false') {
          const sa = (typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer)).trim().toLowerCase();
          const ca = (typeof correctAnswer === 'string' ? correctAnswer : String(correctAnswer)).trim().toLowerCase();
          isCorrect = !!sa && !!ca && sa === ca;
        } else {
          const sa = typeof studentAnswer === 'string' ? studentAnswer : '';
          isCorrect = sa ? await gradeShortAnswerViaBackend(q.id, sa) : false;
        }

        if (isCorrect) correct++;

        const timeSpent = updatedTimes[q.id];
        const time_spent_seconds =
          typeof timeSpent === 'number' && Number.isFinite(timeSpent)
            ? Math.round(timeSpent)
            : null;

        let selected_option: string | null = null;
        if (q.type === 'multiple_choice') {
          const opt = (q.options || []).find((o: any) => o.id === studentAnswer);
          selected_option = opt ? String(opt.text) : null;
        } else if (q.type === 'true_false') {
          const v = (typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer)).trim().toLowerCase();
          if (v === 'true' || v === 'false') selected_option = v;
        }

        responseRows.push({
          quiz_id: quizId,
          question_id: q.id,
          section_id: section?.id ?? null,
          student_name: username ?? null,
          answered_at: new Date().toISOString(),
          time_spent_seconds,
          is_correct: isCorrect,
          selected_option,
          text_answer: q.type === 'essay' ? (answers[q.id] ?? '') : null,
        });
      }

      // Show score immediately
      setQuestionTimeSpent(updatedTimes);
      setScoreResult({ total, correct });
      setShowScore(true);
      setShowAutoSubmitDialog(false);

      // Best-effort notify
      try {
        if (quizCode) {
          const socket = socketRef.current || getSocket();
          socket.emit('student_finished', {
            room: quizCode,
            student_id: null,
            name: username,
            correct,
            total,
            section_id: section?.id ?? null,
            ts: Date.now(),
          });
          setTimeout(() => {
            try { socket.disconnect(); } catch {}
          }, 300);
        }
      } catch {}

      // Persist (non-blocking to user)
      try {
        if (section?.id) {
          const { data: qsRow, error: qsErr } = await (supabase as any)
            .from('quiz_sections')
            .select('section_id')
            .eq('quiz_id', quizId)
            .eq('section_id', section.id)
            .maybeSingle();
        if (qsErr || !qsRow) {
            console.warn('[finalizeQuiz] section check failed or not allowed', qsErr);
            return;
          }
        }

        const totalTimeSeconds = Object.values(updatedTimes).reduce(
          (acc: number, v: any) => acc + (typeof v === 'number' ? v : 0),
          0
        );

        const studentPerfId = (window.crypto?.randomUUID?.() || undefined) as string | undefined;
        if (!studentPerfId) return;

        const studentNameNorm = (username ?? '').trim().toLowerCase();
        const already = await hasTakenInSection(quizId, section?.id ?? null, studentNameNorm);
        if (already) return;

        const attemptNo = await getNextAttemptNo(quizId, studentNameNorm);

        const perfPayload = {
          id: studentPerfId,
          quiz_id: quizId,
          score: Number(correct),
          completion_time_seconds: Math.round(totalTimeSeconds),
          student_name: username ?? 'Unknown',
          attempt_no: attemptNo,
          section_id: section?.id ?? null,
        };

        const { error: perfErr } = await (supabase as any)
          .from('analytics_student_performance')
          .insert([perfPayload], { returning: 'minimal' });
        if (perfErr) {
          console.error('[finalizeQuiz] analytics insert failed:', perfErr);
          return;
        }

        const rowsWithPerf = responseRows.map((r) => ({ ...r, student_perf_id: studentPerfId }));
        if (!rowsWithPerf.length) return;

        const { error: respErr } = await (supabase as any)
          .from('quiz_responses')
          .insert(rowsWithPerf, { returning: 'minimal' });
        if (respErr) console.error('[finalizeQuiz] responses insert failed:', respErr);
      } catch (netErr) {
        console.error('[finalizeQuiz] network/db error:', netErr);
      }
    } catch (fatal) {
      console.error('[finalizeQuiz] unexpected failure:', fatal);
      toast.error('Something went wrong while finishing the quiz.');
    }
  };

  const handleTimeUp = () => setShowTimeUp(true);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev > 1) return prev - 1;
        clearInterval(interval);
        handleTimeUp();
        return 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading quiz...</p>
      </div>
    );
  }

  if (!quizData || !quizData.questions || quizData.questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>This quiz has no questions.</p>
      </div>
    );
  }

  // Score screen
  if (showScore) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Quiz Completed!</h2>
            <p className="text-lg mb-2">
              Score: {scoreResult.correct} / {scoreResult.total}
            </p>
            <p className="mb-6">
              You answered {scoreResult.correct} out of {scoreResult.total} questions correctly.
            </p>
            <Button onClick={() => navigate('/')}>Back to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20 p-4"
    >
      <div className="max-w-3xl mx-auto pt-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{quizData.title}</h1>
            <p className="text-muted-foreground">Taking as: {username}</p>
            {timeLeft !== null && (
              <p className="mt-2 text-muted-foreground">
                Time remaining: <span className="font-semibold">{formatTime(timeLeft)}</span>
              </p>
            )}
          </div>
          <div className="mt-1">
            <ThemeToggle />
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">
              Question {currentQuestionIndex + 1} of {quizData.questions.length}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {Object.keys(answers).length} of {quizData.questions.length} answered
          </div>
        </div>

        {/* Navigator */}
        <div className="mb-6 flex flex-wrap gap-2 justify-center md:justify-start">
          {quizData.questions.map((q: any, idx: number) => {
            const isAnswered = answers[q.id] !== undefined;
            const isCurrent = idx === currentQuestionIndex;
            let colorClass = '';
            if (isCurrent) colorClass = 'bg-primary text-primary-foreground';
            else if (isAnswered) colorClass = 'bg-green-500 text-white dark:bg-green-600';
            else colorClass = 'bg-muted text-muted-foreground dark:bg-gray-700 dark:text-gray-300';
            return (
              <button
                key={q.id}
                className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium cursor-pointer transition-all duration-200 hover:scale-105 ${colorClass}`}
                onClick={() => setCurrentQuestionIndex(idx)}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Question */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">{currentQuestion.text}</h2>

            {currentQuestion.type === 'multiple_choice' && (
              <div className="space-y-3">
                {currentQuestion.options.map((option: any) => (
                  <div
                    key={option.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
                      answers[currentQuestion.id] === option.id
                        ? 'bg-primary/10 border-primary scale-100'
                        : 'hover:bg-muted hover:scale-105'
                    }`}
                    onClick={() => handleSelectAnswer(currentQuestion.id, option.id)}
                  >
                    {option.text}
                  </div>
                ))}
              </div>
            )}

            {currentQuestion.type === 'true_false' && (
              <div className="space-y-3">
                {currentQuestion.options.map((option: any) => (
                  <div
                    key={option.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
                      answers[currentQuestion.id] === option.id
                        ? 'bg-primary/10 border-primary scale-100'
                        : 'hover:bg-muted hover:scale-105'
                    }`}
                    onClick={() => handleSelectAnswer(currentQuestion.id, option.id)}
                  >
                    {option.text}
                  </div>
                ))}
              </div>
            )}

            {currentQuestion.type === 'essay' && (
              <Textarea
                className="w-full min-h-[150px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/60"
                placeholder="Type your answer here..."
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleEssayAnswer(currentQuestion.id, e.target.value)}
              />
            )}
          </CardContent>
        </Card>

        {/* Nav buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePreviousQuestion}
            disabled={currentQuestionIndex === 0}
          >
            Previous
          </Button>

          {currentQuestionIndex < quizData.questions.length - 1 ? (
            <Button onClick={handleNextQuestion}>Next</Button>
          ) : (
            <Button onClick={handleSubmitQuiz}>Submit Quiz</Button>
          )}
        </div>
      </div>

      {/* Confirm Submit */}
      <AlertDialog open={showConfirmSubmit} onOpenChange={setShowConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unanswered Questions</AlertDialogTitle>
            <AlertDialogDescription>
              You still have unanswered questions. Are you sure you want to submit your quiz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmSubmit(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirmSubmit(false);
                finalizeQuiz();
              }}
            >
              Submit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Time Up */}
      <AlertDialog open={showTimeUp} onOpenChange={setShowTimeUp}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Time's Up!</AlertDialogTitle>
            <AlertDialogDescription>
              The quiz timer has expired. Your answers will be submitted automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setShowTimeUp(false);
                finalizeQuiz();
              }}
            >
              View Score
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave warning (1st & 2nd time) */}
      <AlertDialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stay on this page</AlertDialogTitle>
            <AlertDialogDescription>
              We detected that you switched tabs or windows. Please do not leave the quiz page.
              {` You have ${Math.max(0, MAX_LEAVE_WARNINGS - leaveCount)} warning(s) left before automatic submission.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowLeaveWarning(false)}>
              I understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-submit dialog (3rd time) */}
      <AlertDialog open={showAutoSubmitDialog} onOpenChange={setShowAutoSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-submission in progress</AlertDialogTitle>
            <AlertDialogDescription>
              You left the quiz page 3 times. Your answers are being submitted automatically.
              Please wait…
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction disabled>Submitting…</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default TakeQuiz;