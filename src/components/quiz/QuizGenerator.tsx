import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TabUploadContent from './TabUploadContent';
import TabCustomizeContent from './TabCustomizeContent';
import TabPreviewContent from './TabPreviewContent';
import { QuizQuestion } from '@/services/quizService';
import { toast } from 'sonner';

interface QuizGeneratorProps {
  onPublish?: (quizData: any) => void;
  isPublishing?: boolean;
}

const QuizGenerator = ({ onPublish, isPublishing = false }: QuizGeneratorProps) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quizGenerated, setQuizGenerated] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleContinueToCustomize = () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }

    if (!quizTitle) {
      toast.error("Please enter a quiz title");
      return;
    }

    setActiveTab('customize');
  };

  const handleQuizReady = (quizData: any) => {
    setQuizQuestions(quizData.questions || quizData);
    setQuizGenerated(true);
    setActiveTab('preview');
  };

  const handleBackToCustomize = () => {
    setActiveTab('customize');
  };

  const handlePublishQuiz = () => {
    if (onPublish) {
      onPublish({
        title: quizTitle,
        description: quizDescription,
        questions: quizQuestions,
      });
    }
  };

  const handleQuestionsUpdated = (questions: QuizQuestion[]) => {
    setQuizQuestions(questions);
  };

  return (
    <div className="flex flex-col space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Quiz Generator</h1>
          <p className="text-muted-foreground mt-1">Create AI-powered quizzes from your teaching materials</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="upload">Upload Content</TabsTrigger>
          <TabsTrigger value="customize" disabled={!selectedFile}>
            Customize Quiz
          </TabsTrigger>
          <TabsTrigger value="preview" disabled={!quizGenerated}>
            Preview & Save
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <TabUploadContent 
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            quizTitle={quizTitle}
            setQuizTitle={setQuizTitle}
            quizDescription={quizDescription}
            setQuizDescription={setQuizDescription}
            onContinue={handleContinueToCustomize}
          />
        </TabsContent>

        <TabsContent value="customize">
          <TabCustomizeContent 
            file={selectedFile}
            onQuizReady={handleQuizReady}
          />
        </TabsContent>

        <TabsContent value="preview">
          <TabPreviewContent 
            quizTitle={quizTitle}
            onBack={handleBackToCustomize}
            onPublish={handlePublishQuiz}
            isPublishing={isPublishing}
            onQuestionsUpdated={handleQuestionsUpdated}
            initialQuestions={quizQuestions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QuizGenerator;