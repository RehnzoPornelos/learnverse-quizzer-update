
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, numQuestions, difficulty, questionTypes } = await req.json();
    
    console.log('Generating quiz with Natural Language Processing...');
    console.log('Text length:', text.length);
    console.log('Number of questions:', numQuestions);
    console.log('Difficulty:', difficulty);
    console.log('Question types:', questionTypes);

    // Extract and process readable content
    const processedContent = extractReadableContent(text);
    
    if (!processedContent || processedContent.length < 50) {
      console.log('Insufficient readable content, generating general questions');
      const questions = generateGeneralQuestions(numQuestions, questionTypes, difficulty);
      return new Response(JSON.stringify({ questions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processed content preview:', processedContent.substring(0, 200));

    // Generate questions using the processed content
    const questions = generateQuestionsFromContent(
      processedContent, 
      numQuestions, 
      difficulty, 
      questionTypes
    );

    console.log(`Successfully generated ${questions.length} questions`);

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-quiz-from-text function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function extractReadableContent(text: string): string {
  console.log('Extracting readable content...');
  
  // Clean the text and extract meaningful content
  let cleanText = text
    // Remove PDF artifacts and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    // Remove common PDF stream markers
    .replace(/stream\s+.*?endstream/gs, ' ')
    .replace(/obj\s+.*?endobj/gs, ' ')
    // Remove page references and PDF structure
    .replace(/\d+\s+0\s+obj/g, ' ')
    .replace(/\/Type\s*\/\w+/g, ' ')
    .replace(/\/Length\s*\d+/g, ' ')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Extract sentences that look like actual content
  const sentences = cleanText
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(sentence => {
      return sentence.length > 15 && 
             sentence.length < 500 &&
             /[a-zA-Z]/.test(sentence) &&
             !isGarbledText(sentence) &&
             !isPDFArtifact(sentence);
    });

  const result = sentences.join('. ').trim();
  console.log(`Extracted ${sentences.length} valid sentences from content`);
  return result;
}

function isGarbledText(text: string): boolean {
  // Check if text contains too many non-alphabetic characters
  const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalCount = text.length;
  const alphaRatio = alphaCount / totalCount;
  
  // If less than 60% alphabetic characters, consider it garbled
  return alphaRatio < 0.6;
}

function isPDFArtifact(text: string): boolean {
  const pdfPatterns = [
    /^\d+$/,  // Just numbers
    /^[A-Z]{1,3}$/,  // Short uppercase sequences
    /endobj|stream|xref/i,  // PDF keywords
    /\/\w+/,  // PDF commands
    /^obj\s/,  // Object references
    /^\s*\d+\s+\d+\s+R\s*$/  // PDF references
  ];
  
  return pdfPatterns.some(pattern => pattern.test(text.trim()));
}

function generateQuestionsFromContent(
  content: string, 
  numQuestions: number, 
  difficulty: string, 
  questionTypes: string[]
): any[] {
  console.log('Generating questions from content...');
  
  const questions = [];
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const keyTerms = extractKeyTerms(content);
  const topics = extractTopics(content);
  
  console.log(`Found ${keyTerms.length} key terms and ${topics.length} topics`);
  
  for (let i = 0; i < numQuestions; i++) {
    const type = questionTypes[i % questionTypes.length];
    let question;
    
    if (type === 'multiple_choice') {
      question = generateMultipleChoiceFromContent(sentences, keyTerms, topics, difficulty, i);
    } else if (type === 'true_false') {
      question = generateTrueFalseFromContent(sentences, keyTerms, difficulty, i);
    } else {
      question = generateEssayFromContent(content, keyTerms, topics, difficulty, i);
    }
    
    questions.push(question);
  }
  
  return questions;
}

function extractKeyTerms(content: string): string[] {
  // Extract important terms from the content
  const words = content.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 4 && word.length < 20);
  
  // Count word frequency
  const wordCount: { [key: string]: number } = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Get most frequent meaningful words
  return Object.entries(wordCount)
    .filter(([word, count]) => count > 1 && !isCommonWord(word))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

function extractTopics(content: string): string[] {
  // Look for potential topic indicators
  const topicIndicators = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  
  // Filter and deduplicate topics
  const topics = [...new Set(topicIndicators)]
    .filter(topic => topic.length > 3 && topic.length < 30)
    .slice(0, 5);
    
  return topics;
}

function isCommonWord(word: string): boolean {
  const commonWords = [
    'that', 'this', 'with', 'from', 'they', 'been', 'have', 'their', 'said',
    'each', 'which', 'them', 'many', 'some', 'time', 'very', 'when', 'much',
    'also', 'than', 'only', 'other', 'after', 'first', 'well', 'work', 'will',
    'about', 'would', 'there', 'could', 'more', 'these', 'what', 'such'
  ];
  return commonWords.includes(word);
}

function generateMultipleChoiceFromContent(
  sentences: string[], 
  keyTerms: string[], 
  topics: string[],
  difficulty: string, 
  index: number
): any {
  const sentence = sentences[index % sentences.length] || "The content discusses important concepts.";
  const term = keyTerms[index % keyTerms.length] || topics[index % topics.length] || "concept";
  
  // Create question based on content
  let questionText;
  if (difficulty === 'easy') {
    questionText = `What is the main focus regarding ${term} in the material?`;
  } else if (difficulty === 'hard') {
    questionText = `How does ${term} relate to the broader concepts discussed in the content?`;
  } else {
    questionText = `Based on the content, what can be concluded about ${term}?`;
  }
  
  return {
    text: questionText,
    type: 'multiple_choice',
    options: [
      { id: 'a', text: `It is a key concept that is thoroughly explained in the material` },
      { id: 'b', text: `It is mentioned only briefly without detailed explanation` },
      { id: 'c', text: `It is not discussed in the provided content` },
      { id: 'd', text: `It is presented as a contradictory viewpoint` }
    ],
    correct_answer: 'a',
    order_position: index
  };
}

function generateTrueFalseFromContent(
  sentences: string[], 
  keyTerms: string[],
  difficulty: string, 
  index: number
): any {
  const term = keyTerms[index % keyTerms.length] || "the main topic";
  const isTrue = Math.random() > 0.3; // Bias toward true statements about actual content
  
  let questionText;
  if (isTrue) {
    questionText = `True or False: The content provides information about ${term}.`;
  } else {
    questionText = `True or False: ${term} is completely irrelevant to the material discussed.`;
  }
  
  return {
    text: questionText,
    type: 'true_false',
    options: [
      { id: 'a', text: 'True' },
      { id: 'b', text: 'False' }
    ],
    correct_answer: isTrue ? 'a' : 'b',
    order_position: index
  };
}

function generateEssayFromContent(
  content: string, 
  keyTerms: string[], 
  topics: string[],
  difficulty: string, 
  index: number
): any {
  const term = keyTerms[index % keyTerms.length] || topics[index % topics.length] || "the main concepts";
  
  let questionText;
  if (difficulty === 'easy') {
    questionText = `Summarize what the material says about ${term}.`;
  } else if (difficulty === 'hard') {
    questionText = `Critically analyze the presentation of ${term} in the material and discuss its implications.`;
  } else {
    questionText = `Explain the significance of ${term} as discussed in the material and provide your analysis.`;
  }
  
  return {
    text: questionText,
    type: 'essay',
    options: [],
    order_position: index
  };
}

function generateGeneralQuestions(
  numQuestions: number, 
  questionTypes: string[], 
  difficulty: string
): any[] {
  console.log('Generating general fallback questions...');
  
  const questions = [];
  const topics = [
    'learning objectives', 'key concepts', 'main principles', 'important theories',
    'fundamental ideas', 'core topics', 'essential knowledge', 'primary focus'
  ];
  
  for (let i = 0; i < numQuestions; i++) {
    const type = questionTypes[i % questionTypes.length];
    const topic = topics[i % topics.length];
    
    let question;
    
    if (type === 'multiple_choice') {
      question = {
        text: `What is the main focus of ${topic} in educational content?`,
        type: 'multiple_choice',
        options: [
          { id: 'a', text: 'Understanding fundamental principles' },
          { id: 'b', text: 'Memorizing specific details' },
          { id: 'c', text: 'Avoiding complex topics' },
          { id: 'd', text: 'Ignoring practical applications' }
        ],
        correct_answer: 'a',
        order_position: i
      };
    } else if (type === 'true_false') {
      question = {
        text: `Educational materials should focus on ${topic}.`,
        type: 'true_false',
        options: [
          { id: 'a', text: 'True' },
          { id: 'b', text: 'False' }
        ],
        correct_answer: 'a',
        order_position: i
      };
    } else {
      question = {
        text: `Discuss the importance of ${topic} in educational contexts.`,
        type: 'essay',
        options: [],
        order_position: i
      };
    }
    
    questions.push(question);
  }
  
  return questions;
}
