import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { BookOpen, FileText, FilePlus, Plus, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface TabUploadContentProps {
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  quizTitle: string;
  setQuizTitle: (title: string) => void;
  quizDescription: string;
  setQuizDescription: (description: string) => void;
  onContinue: () => void;
}

const TabUploadContent = ({
  selectedFile,
  setSelectedFile,
  quizTitle,
  setQuizTitle,
  quizDescription,
  setQuizDescription,
  onContinue,
}: TabUploadContentProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedExtensions = ['.pdf', '.docx', '.pptx', '.txt'];
      
      // Check file extension
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        toast.error(`Invalid file type. Please upload one of the following: ${allowedExtensions.join(', ')}`);
        return;
      }
      
      // Check file size (20MB max)
      if (file.size > 20 * 1024 * 1024) {
        toast.error('File is too large. Maximum size is 20MB.');
        return;
      }
      
      setSelectedFile(file);
      
      // If no title yet, suggest a title based on the filename
      if (!quizTitle) {
        const suggestedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
        setQuizTitle(suggestedTitle);
      }
    }
  };

    const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first');
      return;
    }

    if (!quizTitle.trim()) {
      toast.error('Please enter a quiz title');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("mcq_count", "3");
    formData.append("sa_count", "3");
    formData.append("tf_count", "4");

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      const response = await fetch(`${backendUrl}/generate-quiz/`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate quiz.");
      }

      const quizData = await response.json();
      console.log("✅ Quiz Generated:", quizData);
      toast.success("Quiz successfully generated!");
      onContinue();

    } catch (error: any) {
      console.error("❌ Network or server error:", error);
      toast.error(`Error: ${error.message}`);
    }
  };


  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const allowedExtensions = ['.pdf', '.docx', '.pptx', '.txt'];
      
      // Check file extension
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        toast.error(`Invalid file type. Please upload one of the following: ${allowedExtensions.join(', ')}`);
        return;
      }
      
      // Check file size (20MB max)
      if (file.size > 20 * 1024 * 1024) {
        toast.error('File is too large. Maximum size is 20MB.');
        return;
      }
      
      setSelectedFile(file);
      
      // If no title yet, suggest a title based on the filename
      if (!quizTitle) {
        const suggestedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
        setQuizTitle(suggestedTitle);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Upload Course Material</h2>
                <div className="bg-primary/10 px-2 py-1 rounded-full">
                  <span className="text-xs font-medium text-primary">AI-Powered</span>
                </div>
              </div>
              <p className="text-muted-foreground">
                Upload your lecture notes, research papers, or textbook chapters. Our AI will analyze the content and generate intelligent quiz questions using HuggingFace's advanced PDF-to-Quiz model.
              </p>

              <div>
                <Label htmlFor="quizTitle">Quiz Title</Label>
                <Input
                  id="quizTitle"
                  placeholder="Enter quiz title"
                  className="mt-1"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="quizDescription">Quiz Description (Optional)</Label>
                <Input
                  id="quizDescription"
                  placeholder="Enter quiz description"
                  className="mt-1"
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                />
              </div>

              <div className="mt-4">
                <label
                  htmlFor="file-upload"
                  className={`block w-full cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    selectedFile ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center">
                    {selectedFile ? (
                      <>
                        <FileText className="h-10 w-10 text-primary mb-2" />
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedFile(null);
                          }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">
                          Drag and drop your file here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supports PDF, DOCX, PPTX, and TXT files up to 20MB
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    accept=".pdf,.docx,.pptx,.txt"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing with AI...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              <div className="pt-4">
                <Button
                  onClick={handleFileUpload}
                  disabled={!selectedFile || uploading || !quizTitle.trim()}
                  className="w-full"
                >
                  {uploading ? 'Processing with AI...' : 'Upload and Continue'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">AI-Powered Quiz Generation</h2>
                <div className="bg-green-100 p-1 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <p className="text-muted-foreground">
                Using HuggingFace's advanced PDF-to-Quiz model for intelligent question generation:
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <FilePlus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">Smart Content Analysis</h3>
                    <p className="text-xs text-muted-foreground">
                      AI analyzes your documents to identify key concepts and learning objectives.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">Contextual Questions</h3>
                    <p className="text-xs text-muted-foreground">
                      Questions are generated based on the actual content and difficulty level you specify.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">Multiple Question Types</h3>
                    <p className="text-xs text-muted-foreground">
                      Supports multiple choice, true/false, and essay questions automatically.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-3">Supported File Types</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.pdf</span>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.docx</span>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.pptx</span>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-secondary">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-xs">.txt</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default TabUploadContent;
