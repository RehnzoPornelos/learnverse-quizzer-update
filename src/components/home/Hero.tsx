import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import JoinQuizButton from './JoinQuizButton';

const Hero = () => {
  return (
    <div className="relative pt-20 pb-16 overflow-hidden md:pt-28 md:pb-24">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden -z-10">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative container-content">
        <div className="max-w-3xl mx-auto space-y-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-primary/10 text-primary">
              Advanced Learning Technology
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Transform Assessment with <span className="text-primary">Intelligent Quiz Generation</span>
            </h1>
            <p className="max-w-2xl mx-auto mt-6 text-lg text-muted-foreground">
              Automatically create quizzes from your course materials, track student progress, and deliver personalized learning experiences  .
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col justify-center gap-4 pt-4 sm:flex-row"
          >
            <Button asChild size="lg" className="px-8 rounded-full">
              <Link to="/dashboard?role=professor">Try as Professor</Link>
            </Button>
            <JoinQuizButton />
          </motion.div>
        </div>

        {/* Hero Image */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-12 sm:mt-16"
        >
          <div className="overflow-hidden glass-card">
            <img
              src="https://images.unsplash.com/photo-1581089781785-603411fa81e5?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
              alt="LearnVerse Dashboard"
              className="w-full shadow-lg rounded-xl"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Hero;
