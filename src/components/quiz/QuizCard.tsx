
import { motion } from 'framer-motion';
import { BookOpen, Calendar, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface QuizCardProps {
  quiz: {
    id: number;
    title: string;
    description?: string;
    dueDate?: string;
    questions: number;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    timeLimit?: number;
    completed?: boolean;
    score?: number;
  };
  role?: 'professor' | 'student';
}

const QuizCard = ({ quiz, role = 'student' }: QuizCardProps) => {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'Medium':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'Hard':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Use ui-card-hover for improved borders and hover shading */}
      <Card className="ui-card-hover overflow-hidden transition-all">
        {quiz.completed && (
          <div className="absolute top-0 right-0 m-4">
            <div className="flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2 py-1">
              <CheckCircle className="w-3 h-3 mr-1 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Completed</span>
            </div>
          </div>
        )}
        
        <CardHeader className="pb-2">
          <div className="flex flex-wrap gap-2 mb-2">
            <Badge variant="outline" className={getDifficultyColor(quiz.difficulty)}>
              {quiz.difficulty}
            </Badge>
            {quiz.timeLimit && (
              <Badge variant="outline" className="bg-secondary text-secondary-foreground">
                <Clock className="mr-1 h-3 w-3" /> {quiz.timeLimit} min
              </Badge>
            )}
          </div>
          <CardTitle className="text-xl">{quiz.title}</CardTitle>
        </CardHeader>
        
        <CardContent>
          {quiz.description && (
            <p className="text-sm text-muted-foreground mb-4">{quiz.description}</p>
          )}
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center">
              <BookOpen className="h-4 w-4 mr-2 text-muted-foreground" />
              <span>{quiz.questions} Questions</span>
            </div>
            
            {quiz.dueDate && (
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Due {quiz.dueDate}</span>
              </div>
            )}
            
            {quiz.score !== undefined && (
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Score: {quiz.score}%</span>
              </div>
            )}
          </div>
        </CardContent>
        
        <CardFooter className="pt-0">
          {role === 'student' ? (
            <Button className="w-full">
              {quiz.completed ? 'Review Quiz' : 'Start Quiz'}
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1">Edit</Button>
              <Button className="flex-1">View Results</Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
};

export default QuizCard;
