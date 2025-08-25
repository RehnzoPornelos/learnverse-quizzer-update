
import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';

const TakeQuiz = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [quizData, setQuizData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [username, setUsername] = useState('');
  
  useEffect(() => {
    if (!location.state?.username) {
      toast.error('User information missing');
      navigate('/join');
      return;
    }
    
    setUsername(location.state.username);
    fetchQuizData();
  }, [id]);
  
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
      
      setQuizData({
        ...quiz,
        questions: questions || []
      });
      
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
  };
  
  const handleEssayAnswer = (questionId: string, text: string) => {
    setAnswers({
      ...answers,
      [questionId]: text
    });
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
