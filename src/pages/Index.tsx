
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';

const Index = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen"
    >
      <Navbar />
      <main>
        <Hero />
        <Features />
        
        {/* Footer */}
        <footer className="bg-secondary/50 py-12">
          <div className="container-content">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-lg font-medium mb-4">LearnVerse</h3>
                <p className="text-sm text-muted-foreground">
                  AI-powered quiz generation platform for professors to assess student learning.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-4">Links</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                      About Us
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                      Pricing
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                      Contact
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-4">Contact</h3>
                <ul className="space-y-2 text-sm">
                  <li className="text-muted-foreground">
                    Email: hello@learnverse.io
                  </li>
                  <li className="text-muted-foreground">
                    Phone: (123) 456-7890
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} LearnVerse. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </motion.div>
  );
};

export default Index;
