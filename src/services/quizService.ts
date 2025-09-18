import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export interface QuizQuestion {
  id?: string;
  text: string;
  type: string;
  options: any;
  order_position: number;
  correct_answer?: any;
  // Additional extension fields can be added here; note: `user_id` is not part of the
  // quiz_questions schema since ownership is enforced via a join with the quizzes table.
}

export interface Quiz {
  id?: string;
  title: string;
  description?: string;
  published: boolean;
  invitation_code?: string;
  questions?: QuizQuestion[];
  created_at?: string;
  user_id?: string;
  // Duration of the quiz in seconds; optional
  quiz_duration_seconds?: number;
}

// Get a list of quizzes for the current user
export const getUserQuizzes = async () => {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('user_id', auth.user.id)   // fetch only my quizzes
    .eq('published', true)         // show only published (i.e., not soft-deleted)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};


// Get a specific quiz with its questions
export const getQuizWithQuestions = async (quizId: string) => {
  // Fetch the quiz
  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .single();
    
  if (quizError) {
    console.error("Error fetching quiz:", quizError);
    throw quizError;
  }
  
  // Fetch the questions for this quiz
  const { data: questions, error: questionsError } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('order_position', { ascending: true });
    
  if (questionsError) {
    console.error("Error fetching questions:", questionsError);
    throw questionsError;
  }
  
  return { ...quiz, questions };
};

// Delete a quiz and its associated questions
export const deleteQuiz = async (quizId: string) => {
  if (!quizId) throw new Error('Missing quiz id');

  // Ensure user is authenticated
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error('Not authenticated');

  // Soft delete the quiz by setting published = false. Restrict update to the
  // current user via user_id filter. If no matching row exists or the user
  // doesn't own the quiz, supabase will return an error via RLS.
  const { error } = await supabase
    .from('quizzes')
    .update({ published: false })
    .eq('id', quizId)
    .eq('user_id', auth.user.id);

  if (error) throw error;
  return true;
};

// Enhanced file processing for better text extraction
export const generateQuestionsFromFile = async (file: File, numQuestions: number, difficulty: string, questionTypes: string[]): Promise<QuizQuestion[]> => {
  try {
    console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);
    
    // Extract text from the file based on file type
    const text = await extractTextFromFile(file);
    
    if (!text || text.length < 50) {
      console.log('Insufficient text extracted, using demo questions');
      return generateDemoQuestions(numQuestions, difficulty, questionTypes);
    }
    
    console.log('Extracted text length:', text.length);
    console.log('Text preview:', text.substring(0, 200));
    
    // Determine file type for better processing
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    // Call the Groq-powered edge function
    const { data, error } = await supabase.functions.invoke('generate-quiz-groq', {
      body: {
        text: text,
        numQuestions: numQuestions,
        difficulty: difficulty,
        questionTypes: questionTypes.filter(type => type !== ''),
        fileType: fileExtension
      }
    });
    
    if (error) {
      console.error('Error calling quiz generation function:', error);
      throw error;
    }
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    console.log('Generated questions:', data.questions?.length || 0);
    
    // Ensure all questions have proper UUIDs
    const questionsWithUUIDs = (data.questions || []).map((question: any, index: number) => ({
      ...question,
      id: uuidv4(), // Generate proper UUID for each question
      order_position: index
    }));
    
    return questionsWithUUIDs;
    
  } catch (error) {
    console.error('Error generating questions from file:', error);
    // Fallback to demo implementation
    return generateDemoQuestions(numQuestions, difficulty, questionTypes);
  }
};

// Enhanced text extraction with proper file type handling
const extractTextFromFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        let text = '';
        
        if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
          // Handle text files
          text = reader.result as string;
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          // For PDF files, we need special handling
          // Since we can't parse PDF properly in browser, we'll send the file data
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to base64 for transmission
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          text = btoa(binary);
        } else if (file.name.toLowerCase().endsWith('.docx') || 
                   file.name.toLowerCase().endsWith('.pptx')) {
          // For Office documents, also send as binary data
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to base64 for transmission
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          text = btoa(binary);
        } else {
          // Default: try to read as text
          text = reader.result as string;
        }
        
        // For text files, validate content
        if ((file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) && text && text.length > 10) {
          resolve(text);
        } else if (text && text.length > 100) {
          // For binary files converted to base64, ensure we have substantial content
          resolve(text);
        } else {
          console.log('No readable text found in file or file too small');
          resolve('');
        }
      } catch (error) {
        console.error('Error processing file content:', error);
        resolve('');
      }
    };
    
    reader.onerror = () => {
      console.error('Error reading file');
      reject(new Error('Failed to read file'));
    };
    
    // Read file based on type
    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      reader.readAsText(file, 'UTF-8');
    } else {
      // For binary files (PDF, DOCX, PPTX), read as ArrayBuffer
      reader.readAsArrayBuffer(file);
    }
  });
};

// Fallback demo function with proper UUIDs
const generateDemoQuestions = async (numQuestions: number, difficulty: string, questionTypes: string[]): Promise<QuizQuestion[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const questions: QuizQuestion[] = [];
      
      const topics = [
        "Neural Networks", "Deep Learning", "Machine Learning", 
        "Artificial Intelligence", "Data Science", "Natural Language Processing",
        "Computer Vision", "Reinforcement Learning", "Statistical Analysis",
        "Big Data", "Quantum Computing", "Blockchain"
      ];
      
      for (let i = 0; i < numQuestions; i++) {
        const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        
        let question: QuizQuestion;
        
        if (type === 'multiple_choice') {
          question = {
            id: uuidv4(), // Proper UUID generation
            text: generateQuestionText(topic, difficulty),
            type: 'multiple_choice',
            options: generateOptions(topic, difficulty),
            correct_answer: 'a',
            order_position: i
          };
        } else if (type === 'true_false') {
          question = {
            id: uuidv4(), // Proper UUID generation
            text: generateTrueFalseQuestion(topic, difficulty),
            type: 'true_false',
            options: [
              { id: 'a', text: 'True' },
              { id: 'b', text: 'False' }
            ],
            correct_answer: Math.random() > 0.5 ? 'a' : 'b',
            order_position: i
          };
        } else {
          question = {
            id: uuidv4(), // Proper UUID generation
            text: generateEssayQuestion(topic, difficulty),
            type: 'essay',
            options: [],
            order_position: i
          };
        }
        
        questions.push(question);
      }
      
      resolve(questions);
    }, 2000);
  });
};

// Helper function to generate question text
const generateQuestionText = (topic: string, difficulty: string): string => {
  const easyPrefixes = ["What is", "Define", "Explain", "Describe"];
  const mediumPrefixes = ["How does", "Compare and contrast", "Analyze"];
  const hardPrefixes = ["Critically evaluate", "Synthesize", "Hypothesize about"];
  
  let prefixes;
  switch (difficulty) {
    case 'easy':
      prefixes = easyPrefixes;
      break;
    case 'hard':
      prefixes = hardPrefixes;
      break;
    default:
      prefixes = mediumPrefixes;
  }
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${prefix} ${topic}?`;
};

// Helper function to generate true/false question
const generateTrueFalseQuestion = (topic: string, difficulty: string): string => {
  const statements = [
    `${topic} is a fundamental concept in computer science.`,
    `${topic} can only be implemented using Python.`,
    `${topic} has applications in healthcare.`,
    `${topic} requires specialized hardware.`,
    `${topic} was invented in the 1950s.`
  ];
  
  return statements[Math.floor(Math.random() * statements.length)];
};

// Helper function to generate essay question
const generateEssayQuestion = (topic: string, difficulty: string): string => {
  const templates = [
    `Explain the importance of ${topic} in modern technology.`,
    `Discuss the ethical implications of ${topic}.`,
    `How might ${topic} evolve over the next decade?`,
    `Compare the approaches to ${topic} in different industries.`,
    `What are the limitations of current ${topic} technologies?`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
};

// Helper function to generate options for multiple choice
const generateOptions = (topic: string, difficulty: string): any[] => {
  return [
    { id: 'a', text: `The primary framework for implementing ${topic}` },
    { id: 'b', text: `A methodology for analyzing ${topic} systems` },
    { id: 'c', text: `The process of optimizing ${topic} algorithms` },
    { id: 'd', text: `An application of ${topic} in real-world scenarios` }
  ];
};

// Save a quiz with its questions
export const saveQuiz = async (quiz: Quiz, questions: QuizQuestion[]) => {
  try {
    // Get the current user's ID
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error("User must be authenticated to save a quiz");
    }
    
    console.log('Saving quiz:', quiz.title, 'with', questions.length, 'questions');
    
    // Generate invitation code if the quiz is published
    const invitationCode = quiz.published ? generateInvitationCode() : null;
    
    // Insert/update the quiz
    const { data: savedQuiz, error: quizError } = await supabase
      .from('quizzes')
      .upsert({
        id: quiz.id || undefined,
        title: quiz.title,
        description: quiz.description,
        published: quiz.published,
        invitation_code: invitationCode,
        user_id: user.id,
        // persist quiz duration seconds when provided
        quiz_duration_seconds: quiz.quiz_duration_seconds ?? null,
      })
      .select()
      .single();
      
    if (quizError) {
      console.error("Error saving quiz:", quizError);
      throw quizError;
    }
    
    console.log('Quiz saved successfully:', savedQuiz.id);
    
    if (questions && questions.length > 0) {
      // Prepare questions with proper UUIDs.  Ownership will be enforced via RLS based on quiz_id.
      // Helper to test UUID format. We consider a simple regex match: 8-4-4-4-12 hex characters.
      const isValidUuid = (val: string) => {
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
      };

      const questionsToSave = questions.map((question, index) => {
        // Normalize the question type from UI to database values.  The DB accepts
        // `multiple_choice`, `true_false`, and `essay` (for short/essay questions).
        // Incoming UI types may be "mcq" (for multiple choice) or other strings,
        // so convert accordingly before inserting.  Unsupported types fall back to
        // their original value.
        let dbType: string = question.type;
        if (dbType === 'mcq') {
          dbType = 'multiple_choice';
        } else if (dbType === 'essay' || dbType === 'short') {
          // Treat both essay and short-answer UI types as the same DB type
          dbType = 'essay';
        }

        // Determine a valid UUID for the question.  Existing questions should have
        // valid UUIDs; new questions created in the editor may have placeholder
        // identifiers like "new-0".  If the provided id is not a valid UUID,
        // generate a fresh one.  Using our own UUID here ensures that the
        // database does not reject invalid UUIDs on insert.
        let finalId: string;
        if (question.id && typeof question.id === 'string' && isValidUuid(question.id)) {
          finalId = question.id;
        } else {
          finalId = uuidv4();
        }

        return {
          id: finalId,
          quiz_id: savedQuiz.id,
          text: question.text,
          type: dbType,
          options: question.options,
          correct_answer: question.correct_answer,
          order_position: question.order_position !== undefined ? question.order_position : index,
        };
      });

      console.log('Saving questions:', questionsToSave.length);

      // Delete existing questions for this quiz first (in case of update)
      // Use match on quiz_id to avoid deep generic instantiation. RLS ensures only
      // questions belonging to this user's quiz are visible for deletion.
      const { error: deleteError } = await supabase
        .from('quiz_questions')
        .delete()
        .match({ quiz_id: savedQuiz.id });

      if (deleteError) {
        console.error('Error deleting existing questions:', deleteError);
      }

      // Insert new questions
      const { data: savedQuestions, error: questionsError } = await supabase
        .from('quiz_questions')
        .insert(questionsToSave)
        .select();

      if (questionsError) {
        console.error('Error saving questions:', questionsError);
        throw questionsError;
      }

      console.log('Questions saved successfully:', savedQuestions?.length);
      return { ...savedQuiz, questions: savedQuestions };
    }
    
    return savedQuiz;
  } catch (error) {
    console.error('Error in saveQuiz:', error);
    throw error;
  }
};

// Publish a quiz
export const publishQuiz = async (quizId: string) => {
  const invitationCode = generateInvitationCode();
  
  const { data, error } = await supabase
    .from('quizzes')
    .update({ published: true, invitation_code: invitationCode })
    .eq('id', quizId)
    .select()
    .single();
    
  if (error) {
    console.error("Error publishing quiz:", error);
    throw error;
  }
  
  return data;
};

// Generate a random invitation code
export const generateInvitationCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};