
import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { getSocket } from '@/lib/socket';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Play, Clock, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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
  // Keep a ref to the socket so we can access it inside callbacks
  const socketRef = useRef<any>(null);

  /**
   * Track whether we've already emitted the initial join/open event.  This
   * prevents duplicate events when `quizCode` or other dependencies
   * change, which could happen if data is loaded asynchronously from
   * Supabase.  Separate refs are used for student join and host open to
   * avoid conflating the two roles.
   */
  const hasEmittedJoinRef = useRef(false);
  const hasEmittedOpenRef = useRef(false);
  
  useEffect(() => {
    // Reset participants list
    setParticipants([]);
    // Determine role and initial data from location.state
    const isStudentFlag = Boolean(location.state?.isStudent);
    setIsStudent(isStudentFlag);
    setStudentName(location.state?.username || '');
    // quizTitle and quizCode may come from location.state or need to be fetched
    if (location.state?.quizTitle) {
      setQuizTitle(location.state.quizTitle);
    }
    if (location.state?.joinCode) {
      setQuizCode(location.state.joinCode);
    }

    // If professor (not student), fetch quiz details from DB
    if (!isStudentFlag) {
      fetchQuizDetails();
    }

    // Setup Socket.IO connection and event handlers
    const socket = getSocket();
    socketRef.current = socket;
    // Determine room code: use state joinCode or current quizCode
    const roomCode = location.state?.joinCode || quizCode;
    // Emit appropriate join event
    if (isStudentFlag && roomCode) {
      // Student joins room; guard against multiple emissions in case
      // quizCode is set later.
      socket.emit('student_join', {
        room: roomCode,
        student_id: user?.id ?? null,
        name: location.state?.username || 'Student',
      });
      hasEmittedJoinRef.current = true;
    } else if (!isStudentFlag && location.state?.joinCode && roomCode) {
      // Host provided a join code explicitly (e.g. via navigation state)
      socket.emit('host_open_quiz', {
        room: roomCode,
        quiz_id: id,
        title: location.state?.quizTitle || quizTitle,
      });
      hasEmittedOpenRef.current = true;
    }

    // Handle participant updates
    socket.on('server:student-joined', (payload: any) => {
      if (Array.isArray(payload?.participants)) {
        setParticipants(payload.participants);
      }
    });
    // Handle participant leaving
    socket.on('server:client-left', (payload: any) => {
      if (Array.isArray(payload?.participants)) {
        setParticipants(payload.participants);
      }
    });
    // Handle quiz started
    socket.on('server:quiz-start', (payload: any) => {
      setQuizStatus('started');
      if (isStudentFlag) {
        // Navigate student to take the quiz
        navigate(`/quiz/take/${id}`, {
          state: {
            username: location.state?.username || studentName,
            quizId: id,
          },
        });
      } else {
        // Host goes to real‑time analytics page instead of results page
        navigate(`/quiz/analytics/${id}`);
      }
    });
    // Handle quiz ended/cancelled
    socket.on('server:quiz-end', (payload: any) => {
      setQuizStatus('ended');
      toast.success('Quiz ended');
      // Send everyone back to dashboard
      navigate('/dashboard');
    });

    return () => {
      // Clean up event listeners on unmount
      socket.off('server:student-joined');
      socket.off('server:client-left');
      socket.off('server:quiz-start');
      socket.off('server:quiz-end');
    };
    // We intentionally exclude quizCode and quizTitle from deps to avoid re‑joining
    // multiple times; location.state carries the joinCode and quizTitle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location]);

  /**
   * Because `quizCode` may be loaded asynchronously (e.g. when the student
   * navigates without a `joinCode` in `location.state`), we perform a
   * secondary emission once the code becomes available.  We guard with
   * `hasEmittedJoinRef` to ensure the event is only sent once.  This
   * effect will run whenever `quizCode` or related dependencies change.
   */
  useEffect(() => {
    if (!socketRef.current) return;
    // Student late join
    if (isStudent && quizCode && !hasEmittedJoinRef.current) {
      socketRef.current.emit('student_join', {
        room: quizCode,
        student_id: user?.id ?? null,
        name: studentName || 'Student',
      });
      hasEmittedJoinRef.current = true;
    }
    // Host late open (host navigated without joinCode in state)
    if (!isStudent && quizCode && !hasEmittedOpenRef.current) {
      socketRef.current.emit('host_open_quiz', {
        room: quizCode,
        quiz_id: id,
        title: quizTitle,
      });
      hasEmittedOpenRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCode, quizTitle, isStudent, studentName, user?.id]);
  
  const fetchQuizDetails = async () => {
    try {
      const { data: quiz, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      
      if (quiz) {
        setQuizTitle(quiz.title);
        setQuizCode(quiz.invitation_code);
        // After retrieving the invitation code, open the quiz room for the host when
        // necessary. Guard against multiple emissions using hasEmittedOpenRef.
        try {
          const socket = socketRef.current || getSocket();
          if (!hasEmittedOpenRef.current) {
            socket.emit('host_open_quiz', {
              room: quiz.invitation_code,
              quiz_id: id,
              title: quiz.title,
            });
            hasEmittedOpenRef.current = true;
          }
        } catch (err) {
          console.error('Failed to emit host_open_quiz:', err);
        }
      }
    } catch (error) {
      console.error('Error fetching quiz details:', error);
      toast.error('Failed to load quiz details');
    }
  };

  const handleStartQuiz = async () => {
    setIsStarting(true);
    try {
      const socket = socketRef.current || getSocket();
      // Announce start; send optional duration if you implement timers
      socket.emit('host_start', { room: quizCode, starts_at: Date.now() });
      toast.success('Quiz started successfully!');
      // Host navigates to results page
      navigate(`/quiz/analytics/${id}`);
    } catch (error) {
      console.error('Error starting quiz:', error);
      toast.error('Failed to start quiz');
    } finally {
      setIsStarting(false);
      setShowConfirmStart(false);
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{quizTitle}</h1>
              <p className="text-muted-foreground mt-1">Waiting for participants to join</p>
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