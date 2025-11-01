import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabUploadContent from "./TabUploadContent";
import TabCustomizeContent from "./TabCustomizeContent";
import TabPreviewContent from "./TabPreviewContent";
import { QuizQuestion } from "@/services/quizService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { nanoid } from "nanoid";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

interface QuizGeneratorProps {
  onPublish?: (quizData: any) => void;
}

// Generate a short code similar to Quizizz
const makeCode = () => nanoid(6).toUpperCase();

// Map UI question shape -> DB row for public.quiz_questions
function mapQuestionToDBRow(q: any, quizId: string, index: number) {
  const type = q.type;
  let options: any = null;
  let correct: any = null;
  
  if (type === 'mcq') {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    options = choices;
    correct = q.answer || '';
  } else if (type === 'true_false') {
    options = null;
    if (typeof q.answer === 'string') {
      correct = q.answer.toLowerCase() === 'true';
    } else {
      correct = !!q.answer;
    }
  } else if (type === 'identification' || type === 'short_answer' || type === 'essay') {
    options = null;
    correct = q.answer ?? '';
  } else {
    options = null;
    correct = q.answer ?? '';
  }
  
  return {
    quiz_id: quizId,
    text: q.question ?? '',
    type,
    options,
    correct_answer: correct,
    order_position: index,
  };
}

const QuizGenerator = ({ onPublish }: QuizGeneratorProps) => {
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quizGenerated, setQuizGenerated] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  // Duration in seconds for the quiz. Persist across steps.
  const [quizDurationSeconds, setQuizDurationSeconds] = useState<number | null>(
    () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("quiz_duration_seconds");
        if (stored) {
          const parsed = parseInt(stored);
          return isNaN(parsed) ? null : parsed;
        }
      }
      return null;
    }
  );
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleContinueToCustomize = () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }
    if (!quizTitle.trim()) {
      toast.error("Please enter a quiz title");
      return;
    }
    if (selectedSections.length === 0) {
      toast.error("Please select at least one class section");
      return;
    }
    setActiveTab("customize");
  };

  const handleQuizReady = (quizData: any) => {
    setQuizQuestions(quizData.questions || quizData);
    setQuizGenerated(true);
    setActiveTab("preview");
  };

  const handleBackToCustomize = () => {
    setActiveTab("customize");
  };

  /**
   * Insert quiz and questions into Supabase. Also sync class sections and
   * set is_rumbled/is_code_active flags. Uses randomize_questions
   * persisted in localStorage to determine is_rumbled. After publish
   * redirects to dashboard.
   */
  const handlePublishQuiz = async () => {
    if (!user) {
      toast.error("You must be logged in to publish a quiz");
      return;
    }
    if (!quizTitle.trim()) {
      toast.error("Quiz title is required");
      return;
    }
    if (quizQuestions.length === 0) {
      toast.error("Please add at least one question before publishing");
      return;
    }
    if (selectedSections.length === 0) {
      toast.error("Please select at least one class section");
      return;
    }
    // Determine rumbled state from localStorage. Default to true.
    let isRumbled = true;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("randomize_questions");
      if (stored === "false") isRumbled = false;
    }
    setIsPublishing(true);
    try {
      const invitation_code = makeCode();
      // NOTE: cast supabase to any + select only safe columns so TS doesn't complain
      const { data: quizInsert, error: quizErr } = await (supabase as any)
        .from("quizzes")
        .insert({
          user_id: user.id,
          title: quizTitle,
          description: quizDescription || null,
          invitation_code,
          published: true,
          quiz_duration_seconds: quizDurationSeconds ?? null,
          difficulty: (() => {
            if (typeof window !== "undefined") {
              return localStorage.getItem("quiz_difficulty") || "Intermediate";
            }
            return "Intermediate";
          })(),
          is_code_active: false,
          is_rumbled: isRumbled,
        })
        .select("id, invitation_code")
        .single();

      if (quizErr || !quizInsert?.id) {
        console.error("Quiz insert error:", quizErr);
        toast.error("Publishing failed while saving the quiz.");
        setIsPublishing(false);
        return;
      }

      // Insert questions
      const rows = quizQuestions.map((q, i) =>
        mapQuestionToDBRow(q as any, quizInsert.id, i)
      );
      const { error: questionsErr } = await supabase
        .from("quiz_questions")
        .insert(rows);
      if (questionsErr) {
        console.error("Questions insert error:", questionsErr);
        toast.error(
          "Quiz saved, but questions failed to save. Check Row Level Security policies."
        );
        setIsPublishing(false);
        return;
      }

      // Sync class sections via RPC
      try {
        const { error: syncErr } = await (supabase as any).rpc(
          "sync_quiz_sections",
          {
            p_quiz_id: quizInsert.id,
            p_section_codes: selectedSections,
          }
        );
        if (syncErr) {
          console.error("Sync sections error:", syncErr);
          toast.error("Quiz saved, but failed to link to class sections.");
        }
      } catch (err: any) {
        console.error("RPC call failed:", err);
        toast.error("Quiz saved, but failed to link to class sections.");
      }

      toast.success(`Quiz published! Code: ${quizInsert.invitation_code}`);
      if (onPublish) onPublish(quizInsert);
      navigate("/dashboard");
    } catch (e: any) {
      console.error(e);
      toast.error(`Publishing failed, please try again. ${e?.message || ""}`);
    } finally {
      setIsPublishing(false);
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
          <p className="text-muted-foreground mt-1">
            Create AI-powered quizzes from your teaching materials
          </p>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="upload">Upload Content</TabsTrigger>
          <TabsTrigger value="customize" disabled={!selectedFile}>
            Customize Quiz
          </TabsTrigger>
          <TabsTrigger value="preview" disabled={!quizGenerated}>
            Preview &amp; Save
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
            selectedSections={selectedSections}
            setSelectedSections={setSelectedSections}
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
            initialDurationSeconds={
              quizDurationSeconds !== null ? quizDurationSeconds : undefined
            }
            onDurationUpdated={(sec: number) =>
              setQuizDurationSeconds(sec || null)
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QuizGenerator;
