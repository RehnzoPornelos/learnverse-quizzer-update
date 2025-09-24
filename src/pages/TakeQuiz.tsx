
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

// Call Supabase Edge Function to compute semantic similarity with a BERT model.
// Returns { isCorrect, score, usedBert } and falls back to your old lexical check on errors.
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

const TakeQuiz = () => {
  // avoid duplicate inserts from double-click, timer + click, etc.
  const hasSavedRef = useRef(false);
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [quizData, setQuizData] = useState<any>(null);
  // Track remaining time if quiz has a timer (in seconds)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [username, setUsername] = useState('');
  const [quizCode, setQuizCode] = useState<string>('');
  const socketRef = useRef<any>(null);

  // Authenticated user (if logged in).  We use the profile ID for
  // analytics when available.  For guest users, this will be null.
  const { user } = useAuth();

  // Section associated with this student for this quiz session.  This
  // originates from the host when they started the quiz or is inferred
  // when only one section is linked to the quiz.  It is used when
  // persisting analytics.
  const [section, setSection] = useState<{ id: string; code?: string } | null>(null);

  // Track when each question was first viewed, and how many seconds the
  // student spent on each question.  Keys are question IDs.  These
  // values are populated dynamically when the student navigates
  // between questions.
  const [questionStartTimes, setQuestionStartTimes] = useState<Record<string, number>>({});
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<string, number>>({});

  // Additional state for result handling and modals
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
    // Capture section info from the location if provided.  This will
    // subsequently be used to record analytics and responses with the
    // appropriate section_id.
    if (location.state?.section) {
      setSection(location.state.section);
    }
    fetchQuizData();
    // Setup socket and listen for end event
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
  
  // helper to map DB -> UI
function mapDbQuestionToUi(q: any) {
  // types from DB: 'mcq', 'multiple_choice', 'true_false', 'short_answer', 'essay'
  // Normalize DB type to handle both 'mcq' and 'multiple_choice' as multiple choice
  const dbType = q.type;
  if (dbType === 'mcq' || dbType === 'multiple_choice') {
    const opts: string[] = Array.isArray(q.options) ? q.options : [];
    // Determine correct answer index based on stored value.  The DB may store
    // an index number (e.g. 0), a letter (e.g. 'a'), or the option text itself.
    let correctId: string | null = null;
    if (q.correct_answer !== null && q.correct_answer !== undefined) {
      const ca = q.correct_answer;
      // Numeric or numeric-string index
      if (typeof ca === 'number' || (typeof ca === 'string' && /^\d+$/.test(ca))) {
        correctId = String(ca);
      } else if (typeof ca === 'string' && ca.length === 1 && /[a-z]/i.test(ca)) {
        // letter (a => 0, b => 1, etc.)
        const index = ca.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
        correctId = index >= 0 ? String(index) : null;
      } else if (typeof ca === 'string') {
        // try to match against option text
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
    // Normalize correct answer to 'true'/'false' string
    let correctId: string | null = null;
    if (q.correct_answer !== null && q.correct_answer !== undefined) {
      const ca = q.correct_answer;
      if (typeof ca === 'boolean') {
        correctId = ca ? 'true' : 'false';
      } else if (typeof ca === 'string') {
        correctId = ca.trim().toLowerCase();
        if (correctId !== 'true' && correctId !== 'false') correctId = null;
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
  // short_answer or essay -> essay in UI
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

      const normalized = (questions || []).map(mapDbQuestionToUi);

      setQuizData({
        ...quiz,
        questions: normalized,
      });

      setQuizCode(quiz?.invitation_code || '');

      // If no section came via navigation state, try to infer it.
      // If exactly one section is linked to this quiz, use it.
      if (!location.state?.section) {
        try {
          const { data: qs, error: qsErr } = await supabase
            .from('quiz_sections')
            .select('section_id')
            .eq('quiz_id', id as string);

          if (!qsErr && Array.isArray(qs) && qs.length === 1) {
            const onlyId = qs[0].section_id as string;
            const { data: sec } = await supabase
              .from('class_sections')
              .select('id, code')
              .eq('id', onlyId)
              .maybeSingle();
            if (sec) setSection({ id: sec.id, code: sec.code || undefined });
          } else if (qsErr) {
            console.warn('[fetchQuizData] Could not infer section:', qsErr);
          }
        } catch (e) {
          console.warn('[fetchQuizData] Fallback section inference failed:', e);
        }
      }

      // If you added a timer to quizzes table (quiz_duration_seconds), initialize countdown:
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
    setAnswers({
      ...answers,
      [questionId]: answerId
    });
    // Emit answer event to server
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
    setAnswers({
      ...answers,
      [questionId]: text
    });
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

  /**
   * Record the time spent on a given question by computing the
   * difference between now and when the student first started
   * viewing the question.  The resulting duration (in seconds) is
   * added to `questionTimeSpent`.  We also reset the start time
   * to now so that if the student revisits the question later we
   * can track additional time separately.
   */
  const recordTimeForQuestion = (questionId: string) => {
    const start = questionStartTimes[questionId];
    if (start != null) {
      const elapsed = (Date.now() - start) / 1000; // seconds
      setQuestionTimeSpent((prev) => {
        const existing = prev[questionId] ?? 0;
        return { ...prev, [questionId]: existing + elapsed };
      });
      // Reset start time for future visits to this question
      setQuestionStartTimes((prev) => ({ ...prev, [questionId]: Date.now() }));
    }
  };
  
  const currentQuestion = quizData?.questions?.[currentQuestionIndex];

  /**
   * Whenever the current question changes (either on initial load or
   * navigation), record the start time for that question if we
   * haven't already.  This ensures we capture how long the student
   * spends on each question.  Start times are measured in
   * milliseconds since epoch.
   */
  useEffect(() => {
    if (!currentQuestion) return;
    const qid: string = currentQuestion.id;
    setQuestionStartTimes((prev) => {
      // If we already have a start time for this question, do not
      // overwrite it.  Otherwise, record the current time.
      if (prev[qid] !== undefined) return prev;
      return { ...prev, [qid]: Date.now() };
    });
  }, [currentQuestion?.id]);
  
  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      // Before navigating away from current question, record time spent
      if (quizData?.questions?.[currentQuestionIndex]) {
        recordTimeForQuestion(quizData.questions[currentQuestionIndex].id);
      }
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };
  
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      // Record time for the current question before going back
      if (quizData?.questions?.[currentQuestionIndex]) {
        recordTimeForQuestion(quizData.questions[currentQuestionIndex].id);
      }
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };
  
  const handleSubmitQuiz = () => {
    if (!quizData) return;
    // Determine if there are unanswered questions
    const total = quizData.questions.length;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < total) {
      // Show confirmation modal if there are unanswered questions
      setShowConfirmSubmit(true);
      return;
    }
    // All questions answered, compute score and show result
    finalizeQuiz();
  };

  // Compute the next attempt_no within (quiz_id, section_id, student_name_norm)
  async function getNextAttemptNo(quizId: string, studentNameNorm: string) {
    try {
      const { data, error } = await supabase
        .from('analytics_student_performance')
        .select('attempt_no')
        .eq('quiz_id', quizId)
        .eq('student_name_norm', studentNameNorm)
        .order('attempt_no', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('[getNextAttemptNo] read failed, defaulting to 1:', error);
        return 1;
      }
      const last = data?.attempt_no;
      const n = Number(last);
      return Number.isFinite(n) ? n + 1 : 1;
    } catch (e) {
      console.warn('[getNextAttemptNo] exception, defaulting to 1:', e);
      return 1;
    }
  }

  // Has this normalized student already taken THIS quiz in THIS section?
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

      const { data, error } = sectionId
        ? await base.eq('section_id', sectionId)
        : await base.is('section_id', null);

      if (error) {
        console.warn('[hasTakenInSection] read failed — fail-open:', error);
        return false;
      }
      return !!data && data.length > 0;
    } catch (e) {
      console.warn('[hasTakenInSection] exception — fail-open:', e);
      return false;
    }
  }

// Compute the score, record analytics and show result screen.
  const finalizeQuiz = async () => {
    try {
      if (hasSavedRef.current) {
        console.info('[finalizeQuiz] already saved – ignoring duplicate call');
        return;
      }

      if (!quizData) {
        console.warn('[finalizeQuiz] Missing quizData');
        toast.error('Cannot finish: quiz data missing.');
        return;
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

      // capture time on the current question
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

      // Build response rows
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
          // short-answer / essay → ask backend (Groq) for TRUE/FALSE
          const sa = typeof studentAnswer === 'string' ? studentAnswer : '';
          if (sa) {
            try {
              isCorrect = await gradeShortAnswerViaBackend(q.id, sa);
            } catch {
              isCorrect = false;
            }
          } else {
            isCorrect = false;
          }
        }

        if (isCorrect) correct++;

        const timeSpent = updatedTimes[q.id];
        const time_spent_seconds =
          typeof timeSpent === 'number' && Number.isFinite(timeSpent)
            ? Math.round(timeSpent)
            : null;

        // Store answer text (or "true"/"false") in selected_option
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

      // Update UI immediately
      setQuestionTimeSpent(updatedTimes);
      setScoreResult({ total, correct });
      setShowScore(true);

      // Best-effort socket notify
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
      } catch (sockErr) {
        console.warn('[finalizeQuiz] Socket notify failed (non-fatal):', sockErr);
      }

      // Persist analytics (don’t block UI on failure)
      try {
        hasSavedRef.current = true; // guard starts here

        // Optional: confirm section is allowed (defense-in-depth)
        if (section?.id) {
          const { data: qsRow, error: qsErr } = await (supabase as any)
            .from('quiz_sections')
            .select('section_id')
            .eq('quiz_id', quizId)
            .eq('section_id', section.id)
            .maybeSingle();
          if (qsErr) {
            console.error('[finalizeQuiz] quiz_sections check failed:', qsErr);
            toast.error('Could not verify your selected section for this quiz.');
            return;
          }
          if (!qsRow) {
            console.warn('[finalizeQuiz] Section not allowed:', { quizId, sectionId: section.id });
            toast.error('This section is not allowed for this quiz.');
            return;
          }
        }

        const totalTimeSeconds = Object.values(updatedTimes).reduce(
          (acc: number, v: any) => acc + (typeof v === 'number' ? v : 0),
          0
        );

        // Generate id client-side
        const studentPerfId = (window.crypto?.randomUUID?.() || undefined) as string | undefined;
        if (!studentPerfId) {
          console.error('[finalizeQuiz] crypto.randomUUID() unavailable.');
          toast.error('Your browser cannot finish the quiz (no UUID). Try updating your browser.');
          return;
        }

       const studentNameNorm = (username ?? '').trim().toLowerCase();

      // Block re-take in the same section
      const already = await hasTakenInSection(quizId, section?.id ?? null, studentNameNorm);
      if (already) {
        toast.error('You already took this quiz.');
        return;
      }

      // Still compute attempt_no scoped by (quiz_id, student_name_norm)
      // to satisfy your existing unique constraint uq_asp_quiz_name_attempt
      const attemptNo = await getNextAttemptNo(quizId, studentNameNorm);

        // IMPORTANT: Do NOT send `student_name_norm` to the DB — it’s generated there
        const perfPayload = {
          id: studentPerfId,
          quiz_id: quizId,
          score: Number(correct),
          completion_time_seconds: Math.round(totalTimeSeconds),
          student_name: username ?? 'Unknown',
          attempt_no: attemptNo,
          section_id: section?.id ?? null,
        };

        console.debug('[finalizeQuiz] inserting analytics_student_performance (no return):', perfPayload);

        const { error: perfErr } = await (supabase as any)
        .from('analytics_student_performance')
        .insert([perfPayload], { returning: 'minimal' });

      if (perfErr) {
        console.error('[finalizeQuiz] Insert analytics_student_performance failed:', perfErr);
        const msg = (perfErr as any)?.message || '';
        if (/duplicate key value|conflict/i.test(msg)) {
          toast.error('This attempt was already recorded. Please don’t resubmit.');
        } else if (/row-level security|RLS/i.test(msg)) {
          toast.error('Your attempt could not be saved due to security policies (RLS).');
        } else if (/foreign key/i.test(msg)) {
          toast.error('Section is not allowed for this quiz or quiz is inactive.');
        } else {
          toast.error('Failed to record your attempt (analytics).');
        }
        return;
      }

        const rowsWithPerf = responseRows.map((r) => ({
          ...r,
          student_perf_id: studentPerfId,
        }));

        if (!rowsWithPerf.length) {
          console.warn('[finalizeQuiz] No per-question responses to insert.');
          return;
        }

        console.debug('[finalizeQuiz] inserting quiz_responses count=', rowsWithPerf.length,
          ' firstRow=', rowsWithPerf[0]);

        const { error: respErr } = await (supabase as any)
          .from('quiz_responses')
          .insert(rowsWithPerf, { returning: 'minimal' });

        if (respErr) {
          console.error('[finalizeQuiz] Insert quiz_responses failed:', respErr);
          const msg = (respErr as any)?.message || '';
          if (/foreign key/i.test(msg)) {
            toast.error('Some answers failed validation (question/section mismatch).');
          } else if (/row-level security|RLS/i.test(msg)) {
            toast.error('Your answers could not be saved due to security policies (RLS).');
          } else {
            toast.error('Saved your total score, but per-question answers failed to save.');
          }
          return;
        }

        console.info('[finalizeQuiz] Saved analytics + per-question responses successfully.');
        toast.success('Your answers have been recorded. 🎉');
      } catch (netErr: any) {
        console.error('[finalizeQuiz] Network/DB error while recording analytics:', netErr);
        toast.error('We could not save your answers due to a network error.');
      }
    } catch (fatal: any) {
      console.error('[finalizeQuiz] Unexpected failure:', fatal);
      toast.error('Something went wrong while finishing the quiz.');
    }
  };


  // Handle time up: show warning and then finalize
  const handleTimeUp = () => {
    setShowTimeUp(true);
  };

  // Format seconds into MM:SS for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Countdown timer effect: when timeLeft is set, decrement every second until 0
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev > 1) {
          return prev - 1;
        }
        // Time is up: stop timer and trigger time-up modal
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

  // Show score screen once the quiz has been finalized
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
        {/* Header with title, user info, time and theme toggle */}
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

        {/* Progress info and navigation state */}
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

        {/* Navigation cards for jumping between questions */}
        <div className="mb-6 flex flex-wrap gap-2 justify-center md:justify-start">
          {quizData.questions.map((q: any, idx: number) => {
            const isAnswered = answers[q.id] !== undefined;
            const isCurrent = idx === currentQuestionIndex;
            let colorClass = '';
            if (isCurrent) {
              colorClass = 'bg-primary text-primary-foreground';
            } else if (isAnswered) {
              colorClass = 'bg-green-500 text-white dark:bg-green-600';
            } else {
              colorClass = 'bg-muted text-muted-foreground dark:bg-gray-700 dark:text-gray-300';
            }
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

        {/* Question card */}
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

        {/* Navigation buttons */}
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

      {/* Confirm Submit Dialog */}
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

      {/* Time Up Dialog */}
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
    </motion.div>
  );
};

export default TakeQuiz;