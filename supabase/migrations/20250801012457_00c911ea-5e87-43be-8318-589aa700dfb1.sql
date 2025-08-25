-- Add RLS policy to allow anyone to view published quizzes with invitation code
CREATE POLICY "Anyone can view published quizzes with invitation code" 
ON public.quizzes 
FOR SELECT 
USING (published = true AND invitation_code IS NOT NULL);