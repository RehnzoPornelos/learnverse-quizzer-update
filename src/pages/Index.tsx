import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';
import { Github, Linkedin } from 'lucide-react';

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
                    <div className="flex items-center gap-2">
                      <a
                        href="https://www.facebook.com/rehnzo.panergo.pornelos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors text-muted-foreground hover:text-primary"
                      >
                        Pornelos, Rehnzo
                      </a>
                      <a
                        href="https://github.com/RehnzoPornelos"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Rehnzo Pornelos GitHub"
                        className="inline-flex p-1 rounded hover:text-primary text-muted-foreground"
                        title="Rehnzo Pornelos' GitHub"
                      >
                        <Github className="w-5 h-5" />
                      </a>
                      <a
                        href="https://www.linkedin.com/in/pornelos-rehnzo-p-b3532730b/"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Rehnzo Pornelos LinkedIn"
                        className="inline-flex p-1 rounded hover:text-primary text-muted-foreground"
                        title="Rehnzo Pornelos' LinkedIn"
                      >
                        <Linkedin className="w-5 h-5" />
                      </a>
                    </div>
                  </li>
                  <li>
                    <a
                      href="https://www.facebook.com/MarkFrancisValerio"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors text-muted-foreground hover:text-primary"
                    >
                      Valerio, Mark Francis
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.facebook.com/chxx4#"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors text-muted-foreground hover:text-primary"
                    >
                      Estrada, Jamaine
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.facebook.com/matthewmopesmo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors text-muted-foreground hover:text-primary"
                    >
                      Acuba, Matthew Blair
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.facebook.com/onsen.lim12"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors text-muted-foreground hover:text-primary"
                    >
                      Lim, Onsen Ronald
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-medium">Contact</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a
                      className="transition-colors text-muted-foreground hover:text-primary"
                      href="https://mail.google.com/mail/?view=cm&fs=1&to=mfvalerio0226@gmail.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Email: mfvalerio0226@gmail.com
                    </a>
                  </li>
                  <li>
                    <a
                      className="transition-colors text-muted-foreground hover:text-primary"
                      href="https://mail.google.com/mail/?view=cm&fs=1&to=rehnzopornelos@gmail.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Email: rehnzopornelos@gmail.com
                    </a>
                  </li>
                  <li>
                    <a
                      className="transition-colors text-muted-foreground hover:text-primary"
                      href="tel:09270125702"
                    >
                      Phone: 0927 012 5702
                    </a>
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