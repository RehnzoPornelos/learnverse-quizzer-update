
import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
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
  const [quizStatus, setQuizStatus] = useState('waiting');
  
  useEffect(() => {
    // Handle student joining from the join page
    if (location.state?.isStudent) {
      setIsStudent(true);
      setStudentName(location.state.username);
      setQuizTitle(location.state.quizTitle || '');
      setQuizCode(location.state.joinCode || '');
      
      // Add to participants (in a real app, this would be done via a database)
      // For demo purposes, we're using localStorage to simulate this
      const participantKey = `quiz_${id}_participants`;
      const existingParticipants = JSON.parse(localStorage.getItem(participantKey) || '[]');
      if (!existingParticipants.includes(location.state.username)) {
        const updatedParticipants = [...existingParticipants, location.state.username];
        localStorage.setItem(participantKey, JSON.stringify(updatedParticipants));
      }
    } else {
      // Professor is accessing the waiting room
      fetchQuizDetails();
    }
    
    // Set up a timer to fetch participants
    const interval = setInterval(fetchParticipants, 3000);
    
    return () => clearInterval(interval);
  }, [id, location]);
  
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
      }
    } catch (error) {
      console.error('Error fetching quiz details:', error);
      toast.error('Failed to load quiz details');
    }
  };
  
  const fetchParticipants = () => {
    // In a real app, this would fetch from a database
    // For demo purposes, we're using localStorage
    const participantKey = `quiz_${id}_participants`;
    const storedParticipants = JSON.parse(localStorage.getItem(participantKey) || '[]');
    setParticipants(storedParticipants);
    
    // Check if quiz has been started by professor
    const statusKey = `quiz_${id}_status`;
    const status = localStorage.getItem(statusKey) || 'waiting';
    setQuizStatus(status);
    
    // If the quiz has started and user is a student, navigate to the quiz
    if (status === 'started' && isStudent) {
      navigate(`/quiz/take/${id}`, { 
        state: { 
          username: studentName,
          quizId: id
        } 
      });
    }
  };
  
  const handleStartQuiz = async () => {
    setIsStarting(true);
    try {
      // Update quiz status in localStorage (in a real app, this would be in the database)
      localStorage.setItem(`quiz_${id}_status`, 'started');
      
      // In a real implementation, you would update the database here
      
      // Redirect to the quiz page
      toast.success('Quiz started successfully!');
      navigate(`/quiz/results/${id}`);
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
      // Clear participants and status from localStorage
      localStorage.removeItem(`quiz_${id}_participants`);
      localStorage.removeItem(`quiz_${id}_status`);
      
      // In a real implementation, you would update the database here
      
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
