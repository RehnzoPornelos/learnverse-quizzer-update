
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from "sonner";
import Navbar from '@/components/layout/Navbar';
import QuizGenerator from '@/components/quiz/QuizGenerator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, ArrowRight } from "lucide-react";
import { saveQuiz } from '@/services/quizService';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const Generator = () => {
  const [invitationCode, setInvitationCode] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // new handler the generator passes down:
  const handlePublished = (savedQuiz: any) => {
    setInvitationCode(savedQuiz.invitation_code || '');
    setSavedQuizId(savedQuiz.id);
    setShowDialog(true);
    // (optional) toast.success('Quiz published successfully!');
  };

  const copyToClipboard = () => {
    if (invitationCode) {
      navigator.clipboard.writeText(invitationCode);
      toast.success("Invitation code copied to clipboard!");
    }
  };

  const handleDoneClick = () => {
    setShowDialog(false);
    navigate('/dashboard');
  };
  
  const handleStartQuizNow = () => {
    if (savedQuizId) {
      navigate(`/quiz/waiting/${savedQuizId}`);
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20"
    >
      <Navbar />
      <main className="pt-20">
        <div className="container-content py-8">
          <QuizGenerator onPublish={handlePublished} />
          
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Quiz Published Successfully!</DialogTitle>
                <DialogDescription>
                  Share this invitation code with your students to access the quiz.
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex items-center space-x-2 mt-4">
                <div className="grid flex-1 gap-2">
                  <Input
                    readOnly
                    value={invitationCode || ''}
                    className="font-mono text-center text-lg"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="mt-6 flex flex-col gap-3">
                <Button 
                  className="w-full gap-2" 
                  onClick={handleStartQuizNow}
                >
                  Start Quiz Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleDoneClick}
                >
                  Save for Later
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </motion.div>
  );
};

export default Generator;
