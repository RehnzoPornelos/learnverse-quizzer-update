
import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { getSocket } from '@/lib/socket';

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

const TakeQuiz = () => {
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
  
  const currentQuestion = quizData?.questions?.[currentQuestionIndex];
  
  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };
  
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
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

  // Compute the score and show result screen
  const finalizeQuiz = () => {
    if (!quizData) return;
    const total = quizData.questions.length;
    let correct = 0;
    // Evaluate each question
    quizData.questions.forEach((q: any) => {
      const studentAnswer = answers[q.id];
      const correctAnswer = (q as any).correctAnswer;
      if (q.type === 'multiple_choice') {
        if (studentAnswer !== undefined && correctAnswer !== null && studentAnswer === correctAnswer) {
          correct++;
        }
      } else if (q.type === 'true_false') {
        // Normalize answers to lower-case strings
        const sa = typeof studentAnswer === 'string' ? studentAnswer.trim().toLowerCase() : String(studentAnswer);
        const ca = typeof correctAnswer === 'string' ? correctAnswer.trim().toLowerCase() : String(correctAnswer);
        if (sa && ca && sa === ca) {
          correct++;
        }
      } else if (q.type === 'essay') {
        // Simple keyword match: compare key words and count at least 2 matches or half
        const sa = typeof studentAnswer === 'string' ? studentAnswer : '';
        const ca = typeof correctAnswer === 'string' ? correctAnswer : '';
        const normalize = (text: string) =>
          text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter((w) => w.length > 0);
        const studentWords = new Set(normalize(sa));
        const correctWords = new Set(normalize(ca));
        let matches = 0;
        correctWords.forEach((w) => {
          if (studentWords.has(w)) matches++;
        });
        if (matches >= 2 || (correctWords.size > 0 && matches >= Math.ceil(correctWords.size / 2))) {
          correct++;
        }
      }
    });
    setScoreResult({ total, correct });
    setShowScore(true);
    // Emit that this student finished with their score
    if (quizCode) {
      const socket = socketRef.current || getSocket();
      socket.emit('student_finished', {
        room: quizCode,
        student_id: null,
        name: username,
        correct,
        total,
        ts: Date.now(),
      });
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