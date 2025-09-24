import { useState, useEffect, useRef } from 'react';
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

  const socketRef = useRef<any>(null);
  const hasEmittedJoinRef = useRef(false);
  const hasEmittedOpenRef = useRef(false);
  const startGuardRef = useRef(false);

  // the active section for this quiz session
  const [section, setSection] = useState<SectionLite | null>(null);

  // ----- helpers -----

  const inferSingleSection = async (quizId: string) => {
    try {
      const { data: rows, error } = await supabase
        .from('quiz_sections')
        .select('section_id, class_sections ( id, code )')
        .eq('quiz_id', quizId);

      if (error) {
        console.warn('[QuizWaiting] inferSingleSection error:', error);
        return null;
      }
      if (Array.isArray(rows) && rows.length === 1) {
        const cs = rows[0]?.class_sections as { id: string; code?: string } | null;
        if (cs?.id) return { id: cs.id, code: cs.code };
      }
      return null;
    } catch (e) {
      console.warn('[QuizWaiting] inferSingleSection exception:', e);
      return null;
    }
  };

  const fetchQuizBasics = async (quizId: string) => {
    try {
      const { data: quiz, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (error) throw error;

      setQuizTitle(quiz.title);
      setQuizCode(quiz.invitation_code);

      return quiz as { title: string; invitation_code: string };
    } catch (err) {
      console.error('[QuizWaiting] Failed to load quiz basics:', err);
      toast.error('Failed to load quiz details.');
      return null;
    }
  };

  // ----- mount: set role, basic state, socket wiring -----

  useEffect(() => {
    if (!id) return;

    const isStudentFlag = Boolean(location.state?.isStudent);
    setIsStudent(isStudentFlag);
    setStudentName(location.state?.username || '');

    if (location.state?.quizTitle) setQuizTitle(location.state.quizTitle);
    if (location.state?.joinCode) setQuizCode(location.state.joinCode);

    // section provided by previous page (host or student)
    if (location.state?.section) setSection(location.state.section as SectionLite);

    // Always fetch basic quiz info if missing code/title
    if (!location.state?.quizTitle || !location.state?.joinCode) {
      fetchQuizBasics(id);
    }

    // Students may arrive without section; if the quiz has exactly one, infer it
    (async () => {
      if (!location.state?.section) {
        const inferred = await inferSingleSection(id);
        if (inferred) setSection(inferred);
      }
    })();

    const socket = getSocket();
    socketRef.current = socket;

    const roomCode = location.state?.joinCode || quizCode;

    // student joins the room (once)
    if (isStudentFlag && roomCode) {
      socket.emit('student_join', {
        room: roomCode,
        student_id: user?.id ?? null,
        name: location.state?.username || 'Student',
        section_id: location.state?.section?.id || section?.id || null, // send if we know it
      });
      hasEmittedJoinRef.current = true;
    }

    // host opens the room (once) if they came with a joinCode
    if (!isStudentFlag && location.state?.joinCode && roomCode) {
      socket.emit('host_open_quiz', {
        room: roomCode,
        quiz_id: id,
        title: location.state?.quizTitle || quizTitle,
        section_id: location.state?.section?.id || section?.id || null,
      });
      hasEmittedOpenRef.current = true;
    }

    // ---- socket listeners ----
    socket.on('server:student-joined', (payload: any) => {
      if (Array.isArray(payload?.participants)) {
        setParticipants(payload.participants);
      }
    });

    socket.on('server:client-left', (payload: any) => {
      if (Array.isArray(payload?.participants)) {
        setParticipants(payload.participants);
      }
    });

    socket.on('server:quiz-start', (payload: any) => {
      // payload may include section info from host_start
      if (payload?.section) setSection(payload.section);
      if (payload?.section_id && !payload?.section) {
        setSection((prev) => prev ?? { id: payload.section_id });
      }

      setQuizStatus('started');
      if (isStudentFlag) {
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
    });

    socket.on('server:quiz-end', () => {
      setQuizStatus('ended');
      toast.success('Quiz ended');
      navigate('/dashboard');
    });

    return () => {
      socket.off('server:student-joined');
      socket.off('server:client-left');
      socket.off('server:quiz-start');
      socket.off('server:quiz-end');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location]);

  // late join/open when quizCode arrives async (guarded)
  useEffect(() => {
    if (!socketRef.current) return;

    if (isStudent && quizCode && !hasEmittedJoinRef.current) {
      socketRef.current.emit('student_join', {
        room: quizCode,
        student_id: user?.id ?? null,
        name: studentName || 'Student',
        section_id: section?.id || null,
      });
      hasEmittedJoinRef.current = true;
    }

    if (!isStudent && quizCode && !hasEmittedOpenRef.current) {
      socketRef.current.emit('host_open_quiz', {
        room: quizCode,
        quiz_id: id,
        title: quizTitle,
        section_id: section?.id || null,
      });
      hasEmittedOpenRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCode, quizTitle, isStudent, studentName, section?.id, user?.id]);

  // ----- actions -----

  const handleStartQuiz = async () => {
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    setIsStarting(true);

    try {
      if (!quizCode) {
        toast.error('Missing join code.');
        return;
      }
      if (!section?.id) {
        // last-ditch inference for hosts if they forgot to pass section and exactly one exists
        const inferred = await inferSingleSection(id!);
        if (inferred) {
          setSection(inferred);
        } else {
          toast.error('Please choose a section before starting the quiz.');
          return;
        }
      }

      const socket = socketRef.current || getSocket();
      // include the section so students can receive it and carry it to /take
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

  // ----- UI -----

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

          {isStudent ? (
            <div className="text-center p-6 border rounded-lg bg-muted/50">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <h3 className="text-lg font-medium mb-1">Waiting for the professor to start the quiz</h3>
              <p className="text-muted-foreground">
                The quiz will begin automatically once the professor starts it
              </p>
            </div>
          ) : (
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
