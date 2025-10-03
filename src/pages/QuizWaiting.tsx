import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { getSocket } from '@/lib/socket';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Users, Play, Clock, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type SectionLite = { id: string; code?: string };

const QuizWaiting = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [quizTitle, setQuizTitle] = useState('');
  const [quizCode, setQuizCode] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [quizStatus, setQuizStatus] = useState<'waiting' | 'started' | 'ended'>('waiting');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const canHost = useMemo(() => Boolean(user?.id && ownerId && user!.id === ownerId), [user?.id, ownerId]);

  const socketRef = useRef<any>(null);
  const hasEmittedJoinRef = useRef(false);
  const hasEmittedOpenRef = useRef(false);
  const startGuardRef = useRef(false);

  const [section, setSection] = useState<SectionLite | null>(null);

  const inferSingleSection = async (quizId: string) => {
    try {
      const { data: rows, error } = await supabase
        .from('quiz_sections')
        .select('section_id, class_sections ( id, code )')
        .eq('quiz_id', quizId);

      if (error) return null;
      if (Array.isArray(rows) && rows.length === 1) {
        const cs = rows[0]?.class_sections as { id: string; code?: string } | null;
        if (cs?.id) return { id: cs.id, code: cs.code };
      }
      return null;
    } catch {
      return null;
    }
  };

  const fetchQuizBasics = async (quizId: string) => {
    try {
      const { data: quiz, error } = await supabase
        .from('quizzes')
        .select('id, title, invitation_code, user_id, published, is_code_active')
        .eq('id', quizId)
        .single();

      if (error) throw error;

      setQuizTitle(quiz.title);
      setQuizCode(quiz.invitation_code || '');
      setOwnerId(quiz.user_id || null);

      return quiz as { title: string; invitation_code: string | null; user_id: string | null };
    } catch (err) {
      console.error('[QuizWaiting] Failed to load quiz basics:', err);
      toast.error('Failed to load quiz details.');
      return null;
    }
  };

  // ---------- FIRST GUARD: decide role / redirect ----------
  useEffect(() => {
    if (!id) return;

    const cameWithStudentState = Boolean(location.state?.isStudent);
    const cameWithJoinCode = Boolean(location.state?.joinCode);

    // If not logged-in and there is no student payload, kick them to /join
    if (!user && !cameWithStudentState) {
      navigate('/join', { replace: true });
      return;
    }

    // If they are not logged in but came from /join with student payload -> student
    if (!user && cameWithStudentState) {
      setIsStudent(true);
    }

    // If they are logged in but explicitly marked as student (edge case), honor it
    if (user && cameWithStudentState) {
      setIsStudent(true);
    }

    setStudentName(location.state?.username || '');
    if (location.state?.quizTitle) setQuizTitle(location.state.quizTitle);
    if (location.state?.joinCode) setQuizCode(location.state.joinCode);
    if (location.state?.section) setSection(location.state.section as SectionLite);

    // Always fetch quiz (to know owner)
    fetchQuizBasics(id).then(async () => {
      // Students may arrive without section; infer when exactly one is linked
      if (!location.state?.section) {
        const inferred = await inferSingleSection(id);
        if (inferred) setSection(inferred);
      }
    });

    const socket = getSocket();
    socketRef.current = socket;

    const roomCode = location.state?.joinCode || quizCode;

    // student joins (once)
    if ((cameWithStudentState || isStudent) && roomCode) {
      socket.emit('student_join', {
        room: roomCode,
        student_id: user?.id ?? null,
        name: location.state?.username || 'Student',
        section_id: location.state?.section?.id || section?.id || null,
      });
      hasEmittedJoinRef.current = true;
    }

    // host opens the room (once) — ONLY if canHost will be true later
    // (we don't know canHost yet on very first render; we’ll re-emit later when canHost resolves)
    return () => {
      socket.off('server:student-joined');
      socket.off('server:client-left');
      socket.off('server:quiz-start');
      socket.off('server:quiz-end');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Re-wire listeners after socketRef is set & role is known
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // listeners
    const onJoined = (payload: any) => {
      if (Array.isArray(payload?.participants)) setParticipants(payload.participants);
    };
    const onLeft = (payload: any) => {
      if (Array.isArray(payload?.participants)) setParticipants(payload.participants);
    };
    const onStart = (payload: any) => {
      if (payload?.section) setSection(payload.section);
      if (payload?.section_id && !payload?.section) {
        setSection((prev) => prev ?? { id: payload.section_id });
      }
      setQuizStatus('started');
      if (isStudent) {
        navigate(`/quiz/take/${id}`, {
          state: {
            username: location.state?.username || studentName,
            quizId: id,
            section: payload?.section || (section ? { id: section.id, code: section.code } : null),
          },
        });
      } else {
        navigate(`/quiz/analytics/${id}`);
      }
    };
    const onEnd = () => {
      setQuizStatus('ended');
      toast.success('Quiz ended');
      navigate('/dashboard');
    };

    socket.on('server:student-joined', onJoined);
    socket.on('server:client-left', onLeft);
    socket.on('server:quiz-start', onStart);
    socket.on('server:quiz-end', onEnd);

    return () => {
      socket.off('server:student-joined', onJoined);
      socket.off('server:client-left', onLeft);
      socket.off('server:quiz-start', onStart);
      socket.off('server:quiz-end', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, section?.id, studentName, user?.id]);

  // When we finally know quizCode/title/section & canHost => emit host_open_quiz once
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !quizCode) return;

    if (isStudent && !hasEmittedJoinRef.current) {
      socket.emit('student_join', {
        room: quizCode,
        student_id: user?.id ?? null,
        name: studentName || 'Student',
        section_id: section?.id || null,
      });
      hasEmittedJoinRef.current = true;
    }

    if (canHost && !isStudent && !hasEmittedOpenRef.current) {
      socket.emit('host_open_quiz', {
        room: quizCode,
        quiz_id: id,
        title: quizTitle,
        section_id: section?.id || null,
      });
      hasEmittedOpenRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCode, quizTitle, isStudent, studentName, section?.id, user?.id, canHost]);

  // ----- actions (host only) -----
  const handleStartQuiz = async () => {
    if (!canHost) return; // extra guard
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    setIsStarting(true);

    try {
      if (!quizCode) {
        toast.error('Missing join code.');
        return;
      }
      if (!section?.id) {
        const inferred = await inferSingleSection(id!);
        if (inferred) setSection(inferred);
        else {
          toast.error('Please choose a section before starting the quiz.');
          return;
        }
      }

      const socket = socketRef.current || getSocket();
      socket.emit('host_start', {
        room: quizCode,
        starts_at: Date.now(),
        section: section ? { id: section.id, code: section.code } : null,
        section_id: section?.id ?? null,
      });

      toast.success('Quiz started successfully!');
      navigate(`/quiz/analytics/${id}`);
    } catch (error) {
      console.error('Error starting quiz:', error);
      toast.error('Failed to start quiz');
    } finally {
      setIsStarting(false);
      setShowConfirmStart(false);
      setTimeout(() => { startGuardRef.current = false; }, 800);
    }
  };

  const handleCancelQuiz = async () => {
    if (!canHost) return; // extra guard
    setIsCancelling(true);
    try {
      const socket = socketRef.current || getSocket();
      socket.emit('host_end', { room: quizCode });
      toast.success('Quiz cancelled');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error cancelling quiz:', error);
      toast.error('Failed to cancel quiz');
    } finally {
      setIsCancelling(false);
      setShowConfirmCancel(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20 p-4 md:p-8"
    >
      <div className="max-w-4xl mx-auto">
        <Card className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{quizTitle}</h1>
              <p className="text-muted-foreground mt-1">Waiting for participants to join</p>
              {section?.code && (
                <p className="text-muted-foreground mt-1">
                  Section: <span className="font-semibold">{section.code}</span>
                </p>
              )}
            </div>

            <div className="mt-4 md:mt-0 flex items-center gap-2 bg-muted px-4 py-2 rounded-lg">
              <span className="text-sm font-medium">Join Code:</span>
              <span className="text-xl font-bold">{quizCode}</span>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Participants ({participants.length})</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {participants.length > 0 ? (
                participants.map((name, index) => (
                  <div key={index} className="bg-muted/50 rounded-lg p-3 flex items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mr-3">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{name}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  No participants have joined yet
                </div>
              )}
            </div>
          </div>

          {/* Student view */}
          {(!canHost || isStudent) ? (
            <div className="text-center p-6 border rounded-lg bg-muted/50">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <h3 className="text-lg font-medium mb-1">Waiting for the professor to start the quiz</h3>
              <p className="text-muted-foreground">
                The quiz will begin automatically once the professor starts it
              </p>
            </div>
          ) : (
            // Host view (only owner)
            <div className="flex flex-col sm:flex-row gap-4 justify-end">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowConfirmCancel(true)}
                disabled={isCancelling}
              >
                <XCircle className="h-4 w-4" />
                Cancel Quiz
              </Button>

              <Button
                className="gap-2"
                onClick={() => setShowConfirmStart(true)}
                disabled={isStarting}
              >
                <Play className="h-4 w-4" />
                Start Quiz
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Start Quiz Confirmation Dialog */}
      <AlertDialog open={showConfirmStart} onOpenChange={setShowConfirmStart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start the Quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This will start the quiz for all participants. Are you ready to begin?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartQuiz}>
              Start Quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Quiz Confirmation Dialog */}
      <AlertDialog open={showConfirmCancel} onOpenChange={setShowConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the Quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the quiz and remove all participants. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelQuiz}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default QuizWaiting;