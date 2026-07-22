import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLogin } from "@workspace/api-client-react";
import { Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codiceFiscale || !password || !pin) {
      toast({
        title: "Errore",
        description: "Compila tutti i campi.",
        variant: "destructive"
      });
      return;
    }

    loginMutation.mutate({
      data: { codiceFiscale, password, pin }
    }, {
      onSuccess: (res) => {
        if (res.success) {
          setLocation("/");
        } else {
          toast({
            title: "Accesso negato",
            description: "Credenziali non valide o errore di sistema.",
            variant: "destructive"
          });
        }
      },
      onError: (err) => {
        toast({
          title: "Errore di connessione",
          description: err.error || "Impossibile connettersi al servizio.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg border-primary/20">
        <CardHeader className="space-y-3 pb-6 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mx-auto mb-2">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-center text-xl text-primary font-semibold">App Scontrini Fiscali</CardTitle>
          <CardDescription className="text-center text-sm">
            Accesso tramite Fisconline per l'emissione di Documenti Commerciali Online
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="cf">Codice Fiscale</Label>
              <Input
                id="cf"
                type="text"
                placeholder="Inserisci il codice fiscale"
                value={codiceFiscale}
                onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())}
                disabled={loginMutation.isPending}
                data-testid="input-login-cf"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Inserisci la password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-login-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="password"
                placeholder="Inserisci il PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-login-pin"
              />
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs p-3 rounded border border-blue-100 dark:border-blue-900 mt-4">
              <p>Nota: Il sistema si connette al portale dell'Agenzia delle Entrate in tempo reale. L'operazione potrebbe richiedere alcuni secondi.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col border-t border-border/50 bg-muted/20 pt-6">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loginMutation.isPending}
              data-testid="button-login-submit"
            >
              {loginMutation.isPending ? "Connessione in corso..." : "Accedi"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
