import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Auth disabled - always return authenticated
  // This is a single-user app, no login required
  return {
    user: user || { id: "owner", name: "Owner" },
    isLoading: false,
    isAuthenticated: true,
  };
}