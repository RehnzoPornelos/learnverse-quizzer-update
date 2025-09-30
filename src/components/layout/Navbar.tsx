import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BookOpen, Menu, X, BarChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import UserProfileButton from '@/components/auth/UserProfileButton';
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navLinks = [
    { name: 'Home', path: '/' },,
    { name: 'Professor', path: '/dashboard?role=professor' },
    { name: 'Students', path: '/analytics' },
  ];

  return (
    <nav
      className={cn(
        'fixed w-full z-50 transition-all duration-300',
        isScrolled ? 'py-3 bg-background/80 backdrop-blur-md shadow-sm' : 'py-5'
      )}
    >
      <div className="container-content">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
          <img src="/udm-logo.png" alt="Logo" className="w-8 h-8 text-primary" />
            <span className="text-xl font-medium">LearnVerse</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="items-center hidden space-x-8 md:flex">
            <div className="flex space-x-6">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-primary',
                    location.pathname === link.path ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {link.name}
                </Link>
              ))}
            </div>
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              {!loading && (
                user ? (
                  <UserProfileButton />
                ) : (
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/login">Login</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link to="/register">Register</Link>
                    </Button>
                  </>
                )
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center space-x-2 md:hidden">
            <ThemeToggle />
            <button
              className="p-2 rounded-md text-muted-foreground hover:text-foreground focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t shadow-lg md:hidden bg-background border-border"
          >
            <div className="container py-4 space-y-4">
              <div className="flex flex-col space-y-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    className={cn(
                      'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      location.pathname === link.path
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-muted-foreground'
                    )}
                  >
                    {link.name}
                  </Link>
                ))}
                <Link
                  to="/join"
                  className="px-3 py-2 text-sm font-medium transition-colors rounded-md hover:bg-muted text-muted-foreground"
                >
                  Join a Quiz
                </Link>
              </div>
              <div className="flex flex-col pt-2 space-y-2 border-t border-border">
                {!loading && (
                  user ? (
                    <Link to="/account-settings" className="w-full">
                      <Button variant="outline" size="sm" className="w-full">
                        Account Settings
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/login">Login</Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link to="/register">Register</Link>
                      </Button>
                    </>
                  )
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;