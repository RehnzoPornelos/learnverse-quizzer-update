import { motion } from 'framer-motion';
import { BookOpen, Brain, Award, Clock, FileText, GraduationCap, LineChart, Upload, Users, Zap } from 'lucide-react';

const features = [
  {
    name: 'AI Quiz Generator',
    description: 'Upload PDFs and automatically generate quizzes from your course materials.',
    icon: Upload,
  },
  {
    name: 'Offline Accessibility',
    description: 'Students can take quizzes without an internet connection and sync results later.',
    icon: Zap,
  },
  {
    name: 'Performance Analytics',
    description: 'Track student progress and identify knowledge gaps with detailed analytics.',
    icon: LineChart,
  },
  {
    name: 'Instant Grading',
    description: 'AI instantly grades quizzes and provides personalized feedback.',
    icon: Clock,
  },
  {
    name: 'Adaptive Learning',
    description: 'AI personalizes quiz difficulty based on students\' previous performance.',
    icon: Brain,
  },
  {
    name: 'Certificate Generator',
    description: 'Automatically issue certificates upon successful quiz completion.',
    icon: Award,
  },
  {
    name: 'Comprehensive Dashboard',
    description: 'Intuitive interface for professors to create and manage quizzes.',
    icon: FileText,
  },
  {
    name: 'Student Progress Tracking',
    description: 'Students can view scores, track achievements, and receive study recommendations.',
    icon: GraduationCap,
  },
  {
    name: 'Multi-Format Questions',
    description: 'Support for multiple-choice, true/false, and short-answer questions.',
    icon: BookOpen,
  },
];

const FeatureCard = ({ feature, index }: { feature: typeof features[0]; index: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true, margin: "-100px" }}
      className="p-6 glass-card"
    >
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <feature.icon className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-medium">{feature.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
        </div>
      </div>
    </motion.div>
  );
};

const Features = () => {
  return (
    <div id="features" className="relative py-24">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden -z-10">
        <div className="absolute top-1/2 left-0 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-[500px] h-[500px] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="container-content">
        <div className="max-w-3xl mx-auto mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold sm:text-4xl">Everything you need to enhance learning</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Comprehensive tools designed specifically for professors and students to create
              an engaging and effective learning experience.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={feature.name} feature={feature} index={index} />
          ))}
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="max-w-3xl p-8 mx-auto glass-card">
            <Users className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-2xl font-medium">Ready to transform your teaching?</h3>
            <p className="mt-4 text-muted-foreground">
              Join thousands of professors using LearnVerse to create engaging assessments
              and personalized learning experiences for their students.
            </p>
            <div className="mt-6">
          
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Features;
