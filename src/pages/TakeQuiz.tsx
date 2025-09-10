
import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { getSocket } from '@/lib/socket';

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
  // types from DB: 'mcq' | 'true_false' | 'short_answer'
  if (q.type === 'mcq') {
    const opts: string[] = Array.isArray(q.options) ? q.options : [];
    return {
      id: q.id,
      text: q.text,
      type: 'multiple_choice',
      options: opts.map((text, idx) => ({ id: String(idx), text })),
    };
  }
  if (q.type === 'true_false') {
    return {
      id: q.id,
      text: q.text,
      type: 'true_false',
      options: [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ],
    };
  }
  // short_answer -> essay in UI
  return {
    id: q.id,
    text: q.text,
    type: 'essay',
    options: [],
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
    // In a real app, this would submit answers to the database
    toast.success('Quiz submitted successfully!');
    navigate('/');
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
        // Time is up: stop timer and auto-submit
        clearInterval(interval);
        handleSubmitQuiz();
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
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20 p-4"
    >
      <div className="max-w-3xl mx-auto pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{quizData.title}</h1>
          <p className="text-muted-foreground">Taking as: {username}</p>
          {timeLeft !== null && (
            <p className="mt-2 text-muted-foreground">
              Time remaining: <span className="font-semibold">{formatTime(timeLeft)}</span>
            </p>
          )}
        </div>
        
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
        
        <Card className="mb-6">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">{currentQuestion.text}</h2>
            
            {currentQuestion.type === 'multiple_choice' && (
              <div className="space-y-3">
                {currentQuestion.options.map((option: any) => (
                  <div
                    key={option.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      answers[currentQuestion.id] === option.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted'
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
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      answers[currentQuestion.id] === option.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => handleSelectAnswer(currentQuestion.id, option.id)}
                  >
                    {option.text}
                  </div>
                ))}
              </div>
            )}
            
            {currentQuestion.type === 'essay' && (
              <textarea
                className="w-full min-h-[150px] p-3 border rounded-lg"
                placeholder="Type your answer here..."
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleEssayAnswer(currentQuestion.id, e.target.value)}
              />
            )}
          </CardContent>
        </Card>
        
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePreviousQuestion}
            disabled={currentQuestionIndex === 0}
          >
            Previous
          </Button>
          
          {currentQuestionIndex < quizData.questions.length - 1 ? (
            <Button onClick={handleNextQuestion}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmitQuiz}>
              Submit Quiz
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default TakeQuiz;
