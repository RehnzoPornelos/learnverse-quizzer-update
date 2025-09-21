import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/** helper: rudimentary UUID check so we only treat true DB ids as existing */
const isUuid = (v: unknown) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v as string);

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

//Flip the activation state of a quiz from false to true.
export async function setQuizActivation(quizId: string, active: boolean) {
  const { data, error } = await supabase
    .from('quizzes')
    .update({ is_code_active: active, updated_at: new Date().toISOString() })
    .eq('id', quizId)
    .select('id, is_code_active')
    .single();

  if (error) {
    throw error;
  }
  return data;
}

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
export async function saveQuiz(
  quizMeta: {
    id: string;
    title: string;
    description?: string | null;
    published?: boolean;
    quiz_duration_seconds?: number | null;
    is_code_active?: boolean;
  },
  questions: Array<{
    id?: string; // may be local temp id for new questions
    text: string;
    type: 'mcq' | 'true_false' | 'short_answer' | string;
    order_position: number;
    options: any[] | null;
    correct_answer: any;
  }>
) {
  if (!quizMeta?.id) throw new Error('Missing quiz id');

  // 1) update quiz metadata
  const updatePayload: Record<string, any> = {
    title: quizMeta.title,
    description: quizMeta.description ?? null,
    published: quizMeta.published ?? true,
    updated_at: new Date().toISOString(),
  };
  if (quizMeta.quiz_duration_seconds !== undefined) {
    updatePayload.quiz_duration_seconds = quizMeta.quiz_duration_seconds ?? null;
  }
  if (quizMeta.is_code_active !== undefined) {
    updatePayload.is_code_active = !!quizMeta.is_code_active;
  }
  const { error: quizErr } = await supabase
    .from('quizzes')
    .update(updatePayload)
    .eq('id', quizMeta.id);
  if (quizErr) throw quizErr;

  // 2) fetch existing DB ids to compute deletions
  const { data: existingRows, error: existingErr } = await supabase
    .from('quiz_questions')
    .select('id')
    .eq('quiz_id', quizMeta.id);
  if (existingErr) throw existingErr;

  const existingIds = new Set((existingRows ?? []).map((r: any) => r.id));
  const incomingDbIds = new Set(
    (questions ?? [])
      .map((q) => (isUuid(q.id) ? (q.id as string) : null))
      .filter(Boolean) as string[]
  );
  const toDelete = [...existingIds].filter((id) => !incomingDbIds.has(id));

  // 3) normalize rows for DB, split into "existing" (with uuid) and "new" (without uuid)
  const normalize = (q: any) => {
    // keep DB values consistent
    let dbType = q.type;
    if (dbType === 'multiple_choice') dbType = 'mcq';
    const allowed = ['mcq', 'true_false', 'short_answer'];
    if (!allowed.includes(dbType)) dbType = 'mcq';

    let options = q.options;
    let correct = q.correct_answer;

    if (dbType === 'mcq') {
      options = Array.isArray(options) ? options : [];
      // correct stays as the chosen string
    } else if (dbType === 'true_false') {
      options = null;
      correct = typeof correct === 'string' ? correct.toLowerCase() === 'true' : !!correct;
    } else {
      options = null; // short_answer
      // correct stays as string
    }

    const base: any = {
      quiz_id: quizMeta.id,
      text: q.text ?? '',
      type: dbType,
      order_position: q.order_position ?? 0,
      options,
      correct_answer: correct,
    };
    if (isUuid(q.id)) base.id = q.id; // include id only for real DB rows
    return base;
  };

  const normalized = (questions ?? []).map(normalize);
  const existingUpserts = normalized.filter((r: any) => !!r.id);
  const newInserts = normalized.filter((r: any) => !r.id);

  // 4) upsert existing rows
  if (existingUpserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from('quiz_questions')
      .upsert(existingUpserts, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
  }

  // 5) insert new rows (omit id so DB generates)
  if (newInserts.length > 0) {
    const { error: insertErr } = await supabase
      .from('quiz_questions')
      .insert(newInserts);
    if (insertErr) throw insertErr;
  }

  // 6) delete removed rows (only DB ids)
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('quiz_questions')
      .delete()
      .in('id', toDelete);
    if (delErr) throw delErr;
  }

  return { id: quizMeta.id };
}

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