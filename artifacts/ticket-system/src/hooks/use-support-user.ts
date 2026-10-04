import { getApiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface SupportUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  profileImageUrl?: string | null;
}

export function useSupportUser() {
  // 1. Read token directly from storage on render (checking "userToken" first)
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("userToken") ||
        localStorage.getItem("auth_token") ||
        localStorage.getItem("token")
      : null;
  const hasToken = Boolean(token);

  // 2. Execute hook unconditionally at the top level
  const query = useQuery({
    queryKey: ["/api/auth/user", token],
    queryFn: async (): Promise<SupportUser | null> => {
      const res = await fetch(getApiUrl("/api")/auth/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Auth failed with status ${res.status}`);
      }

      const data = await res.json();
      // Handle both direct object { id, email } and wrapped { user: { id, email } }
      return data?.user ?? (data?.id || data?.email ? data : null);
    },
    enabled: hasToken,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // 3. Handle unauthenticated / guard return safely AFTER hooks run
  if (!hasToken) {
    return {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      accessDenied: false,
    };
  }

  const user = query.data ?? null;

  return {
    user,
    isLoading: query.isLoading || query.isFetching,
    isAuthenticated: Boolean(user),
    accessDenied: Boolean(query.isError && !query.isLoading),
  };
}