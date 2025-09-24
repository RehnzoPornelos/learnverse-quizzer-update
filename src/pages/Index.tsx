
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
        <footer className="py-12 bg-secondary/50">
          <div className="container-content">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div>
                <h3 className="mb-4 text-lg font-medium">LearnVerse</h3>
                <p className="text-sm text-muted-foreground">
                  Advance Technology quiz generation platform for professors to assess student learning.
                </p>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-medium">Developer</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="#" className="transition-colors text-muted-foreground hover:text-primary">
                      Pornelos, Rehnzo
                    </a>
                  </li>
                  <li>
                    <a href="#" className="transition-colors text-muted-foreground hover:text-primary">
                      Valerio, Mark Francis
                    </a>
                  </li>
                  <li>
                    <a href="#" className="transition-colors text-muted-foreground hover:text-primary">
                      Estrada, Jamaine
                    </a>
                  </li>
                  <li>
                    <a href="#" className="transition-colors text-muted-foreground hover:text-primary">
                      Acuba, Matthew Blair
                    </a>
                  </li>
                  <li>
                    <a href="#" className="transition-colors text-muted-foreground hover:text-primary">
                      Lim, Onsen Ronald
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-medium">Contact</h3>
                <ul className="space-y-2 text-sm">
                  <li className="text-muted-foreground">
                    Email: mfvalerio0226@gmail.com
                  </li>
                  <li className="text-muted-foreground">
                    Phone: (123) 456-7890
                  </li>
                </ul>
              </div>
            </div>
            <div className="pt-8 mt-12 text-sm text-center border-t border-border text-muted-foreground">
              <p>© {new Date().getFullYear()} LearnVerse. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </motion.div>
  );
};

export default Index;
