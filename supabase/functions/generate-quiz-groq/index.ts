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
    const { text, numQuestions, difficulty, questionTypes, fileType } = await req.json();
    
    console.log('Generating quiz with Groq AI...');
    console.log('Text length:', text.length);
    console.log('Number of questions:', numQuestions);
    console.log('Difficulty:', difficulty);
    console.log('Question types:', questionTypes);
    
    // Process text based on file type
    let processedText = text;
    
    // If the text appears to be base64 encoded (binary file), try to extract readable content
    if (text.length > 1000 && isBase64(text)) {
      console.log('Processing binary file content...');
      try {
        // For now, we'll create a simple text extraction approach
        // In a production system, you'd use proper PDF/DOCX parsing libraries
        const decodedText = atob(text);
        
        // Extract readable text patterns from the decoded content
        const textMatches = decodedText.match(/[a-zA-Z\s]{20,}/g);
        if (textMatches && textMatches.length > 0) {
          processedText = textMatches.join(' ').substring(0, 8000);
          console.log('Extracted text from binary file, length:', processedText.length);
        } else {
          // If we can't extract meaningful text, create a fallback
          processedText = `This appears to be a ${fileType || 'document'} file. Please generate relevant questions about common topics in educational materials.`;
        }
      } catch (error) {
        console.log('Could not decode binary content, using fallback');
        processedText = `This appears to be a ${fileType || 'document'} file. Please generate relevant questions about common educational topics.`;
      }
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    // Prepare the prompt for Groq
    const prompt = createQuizPrompt(processedText, numQuestions, difficulty, questionTypes);
    
    // Call Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator creating high-quality quiz questions. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', errorText);
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    const generatedContent = groqData.choices[0].message.content;
    
    console.log('Raw Groq response:', generatedContent);

    // Parse the JSON response
    let questions;
    try {
      // Extract JSON from the response if it's wrapped in markdown or other text
      const jsonMatch = generatedContent.match(/```json\n?(.*?)\n?```/s) || 
                       generatedContent.match(/\[.*\]/s);
      const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : generatedContent;
      questions = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse Groq response as JSON:', parseError);
      console.error('Raw response:', generatedContent);
      
      // Fallback: generate basic questions
      questions = generateFallbackQuestions(numQuestions, questionTypes, difficulty);
    }

    // Ensure questions have proper structure
    questions = questions.map((q: any, index: number) => ({
      id: crypto.randomUUID(),
      text: q.text || q.question || 'Generated question',
      type: q.type || questionTypes[index % questionTypes.length],
      options: q.options || (q.type === 'essay' ? [] : [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
        { id: 'c', text: 'Option C' },
        { id: 'd', text: 'Option D' }
      ]),
      correct_answer: q.correct_answer || 'a',
      order_position: index
    }));

    console.log(`Successfully generated ${questions.length} questions with Groq`);

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-quiz-groq function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function createQuizPrompt(text: string, numQuestions: number, difficulty: string, questionTypes: string[]): string {
  const typeDistribution = questionTypes.reduce((acc: any, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return `Based on the following content, create exactly ${numQuestions} quiz questions with ${difficulty} difficulty.

Content:
${text.substring(0, 8000)}

Requirements:
- Generate ${typeDistribution.multiple_choice || 0} multiple choice questions
- Generate ${typeDistribution.true_false || 0} true/false questions  
- Generate ${typeDistribution.essay || 0} essay questions
- Difficulty level: ${difficulty}
- Questions should be directly related to the content provided
- For multiple choice: provide 4 options (a, b, c, d) with exactly one correct answer
- For true/false: provide 2 options (a: True, b: False)
- For essay: provide no options (empty array)

Return ONLY a JSON array in this exact format:
[
  {
    "text": "Question text here?",
    "type": "multiple_choice",
    "options": [
      {"id": "a", "text": "Option A text"},
      {"id": "b", "text": "Option B text"},
      {"id": "c", "text": "Option C text"},
      {"id": "d", "text": "Option D text"}
    ],
    "correct_answer": "a"
  },
  {
    "text": "True or false question?",
    "type": "true_false",
    "options": [
      {"id": "a", "text": "True"},
      {"id": "b", "text": "False"}
    ],
    "correct_answer": "a"
  },
  {
    "text": "Essay question prompt?",
    "type": "essay",
    "options": [],
    "correct_answer": null
  }
]`;
}

function generateFallbackQuestions(numQuestions: number, questionTypes: string[], difficulty: string): any[] {
  const questions = [];
  
  for (let i = 0; i < numQuestions; i++) {
    const type = questionTypes[i % questionTypes.length];
    
    if (type === 'multiple_choice') {
      questions.push({
        text: `Multiple choice question ${i + 1} (${difficulty} level)`,
        type: 'multiple_choice',
        options: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
          { id: 'c', text: 'Option C' },
          { id: 'd', text: 'Option D' }
        ],
        correct_answer: 'a'
      });
    } else if (type === 'true_false') {
      questions.push({
        text: `True or false question ${i + 1} (${difficulty} level)`,
        type: 'true_false',
        options: [
          { id: 'a', text: 'True' },
          { id: 'b', text: 'False' }
        ],
        correct_answer: 'a'
      });
    } else {
      questions.push({
        text: `Essay question ${i + 1} (${difficulty} level)`,
        type: 'essay',
        options: [],
        correct_answer: null
      });
    }
  }
  
  return questions;
}

// Helper function to check if a string is base64 encoded
function isBase64(str: string): boolean {
  if (str === '' || str.trim() === '') {
    return false;
  }
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}