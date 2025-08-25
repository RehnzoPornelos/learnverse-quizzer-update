
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const JoinQuizButton = () => {
  return (
    <Link to="/join">
      <Button size="lg" variant="outline" className="group">
        Join a Quiz
        <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
      </Button>
    </Link>
  );
};

export default JoinQuizButton;
