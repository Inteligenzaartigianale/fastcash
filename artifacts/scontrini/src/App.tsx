import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import HomePage from '@/pages/home';
import LoginPage from '@/pages/login';
import RisultatoPage from '@/pages/risultato';
import AdminPage from '@/pages/admin';
import StoricoPage from '@/pages/storico';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  }
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/risultato" component={RisultatoPage} />
      <Route path="/storico" component={StoricoPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Supporta sia il percorso attuale "/" sia la pubblicazione su
  // https://scontrinipro.it/fiscale. L'API resta sull'origine /api.
  const path = window.location.pathname;
  const fiscaleBase =
    path === "/fiscale" || path.startsWith("/fiscale/")
      ? "/fiscale"
      : "";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={fiscaleBase || import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
