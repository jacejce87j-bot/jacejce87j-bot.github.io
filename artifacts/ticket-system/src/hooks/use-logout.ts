import { getApiUrl } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function useLogout() {
  const queryClient = useQueryClient();

  const logout = async () => {
    // 1. Optional: Notify backend if logout route exists
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("token");
      if (token) {
        await fetch(getApiUrl("/api")/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      }
    } catch (err) {
      console.warn("Backend logout failed or route not present:", err);
    } finally {
      // 2. Remove ALL auth token keys from local storage
      localStorage.removeItem("auth_token");
      localStorage.removeItem("token");

      // 3. Clear the entire TanStack Query cache to purge user data
      queryClient.clear();

      // 4. Force hard reload to /login to guarantee clean memory state
      window.location.href = "/login";
    }
  };

  return { logout };
}