import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-2xl font-bold text-gray-900">Pagina non trovata</h1>
          <p className="text-sm text-gray-500">
            La pagina che stai cercando non esiste o è stata rimossa.
          </p>
          <Link href="/" className="text-primary hover:underline font-medium">
            Torna alla pagina principale
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
