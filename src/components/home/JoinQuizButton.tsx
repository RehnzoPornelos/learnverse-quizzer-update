import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const JoinQuizButton = () => {
  const { user } = useAuth();
  
  return (
    <Link to="/join">
      <Button size="lg" variant="outline" className="group">
        {user ? "Start Quiz" : "Join a Quiz"}
        <ArrowRight className="w-4 h-4 ml-2 transition-transform transform group-hover:translate-x-1" />
      </Button>
    </Link>
  );
};

export default JoinQuizButton;
