
import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const StudentJoin = () => {
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleJoinQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user && !username.trim()) {
      toast.error("Please enter your name");
      return;
    }
    
    if (!joinCode.trim()) {
      toast.error("Please enter a join code");
      return;
    }
    
    setIsJoining(true);
    
    try {
      // Check if quiz exists with this invitation code (works for both authenticated and non-authenticated users)
      const { data: quiz, error } = await supabase
        .from('quizzes')
        .select('id, title, user_id')
        .eq('invitation_code', joinCode.trim())
        .eq('published', true)
        .single();
      
      if (error || !quiz) {
        toast.error("Invalid join code. Please check and try again.");
        setIsJoining(false);
        return;
      }
      
      // Check if the logged-in user is the owner of the quiz
      const isQuizOwner = user && quiz.user_id === user.id;
      
      // If we're here, the quiz exists - redirect to waiting area
      navigate(`/quiz/waiting/${quiz.id}`, { 
        state: { 
          username: isQuizOwner ? 'Quiz Host' : username, 
          quizId: quiz.id,
          quizTitle: quiz.title,
          joinCode: joinCode.trim(),
          isStudent: !isQuizOwner,
          isOwner: isQuizOwner
        } 
      });
      
    } catch (error) {
      console.error("Error joining quiz:", error);
      toast.error("Failed to join quiz. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-center justify-center bg-muted/20 p-4"
    >
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Join Quiz</h1>
          <p className="text-muted-foreground mt-2">Enter your details to participate</p>
        </div>
        
        <form onSubmit={handleJoinQuiz} className="space-y-6">
          {!user && (
            <div className="space-y-2">
              <Label htmlFor="username">Your Name</Label>
              <Input 
                id="username"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="joinCode">Quiz Code</Label>
            <Input 
              id="joinCode"
              placeholder="Enter quiz code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="uppercase"
              required
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={isJoining}>
            {isJoining ? 'Joining...' : 'Join Quiz'}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <a href="/" className="text-primary hover:underline">
            Back to Home
          </a>
        </div>
      </div>
    </motion.div>
  );
};

export default StudentJoin;
