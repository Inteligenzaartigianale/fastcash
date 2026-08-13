import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetAuthStatus, getGetAuthStatusQueryKey } from "@workspace/api-client-react";

export function useRequireAuth() {
  const [location, setLocation] = useLocation();
  const { data, isLoading } = useGetAuthStatus({ 
    query: {
      queryKey: getGetAuthStatusQueryKey(),
      retry: false,
    } 
  });

  useEffect(() => {
    if (!isLoading && data && !data.authenticated) {
      setLocation("/login");
    }
  }, [isLoading, data, setLocation]);

  return { isAuthenticated: data?.authenticated, isLoading };
}
