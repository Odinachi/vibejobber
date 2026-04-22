import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
    <div className="text-center space-y-4 max-w-md">
      <p className="text-7xl font-display font-extrabold bg-gradient-primary bg-clip-text text-transparent">
        404
      </p>
      <h1 className="text-2xl font-display font-bold">Page not found</h1>
      <p className="text-muted-foreground">That page took an indefinite leave of absence.</p>
      <Button asChild className="bg-gradient-primary text-primary-foreground hover:opacity-95">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  </div>
);

export default NotFound;

