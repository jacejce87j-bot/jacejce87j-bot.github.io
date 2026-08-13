import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

// ✅ Import universal storage helper
import { tokenStorage } from "@/lib/storage";

// Storage keys used across the app
const AUTH_KEYS = ["auth_token", "jwt", "session_id", "user_data", "userToken"];

async function removeStoredItem(key: string) {
  try {
    // Tries universal tokenStorage (handles web vs native SecureStore)
    await tokenStorage.deleteItem(key);
  } catch {
    // Fallback to AsyncStorage
    await AsyncStorage.removeItem(key);
  }
}

export function useMobileLogout() {
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      // 1. Fire-and-forget call to backend to invalidate cookie/session
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        // Ignore network errors on logout—clearing client state is priority
      });

      // 2. Wipe stored tokens & credentials locally
      await Promise.all(AUTH_KEYS.map((key) => removeStoredItem(key)));

      // 3. Purge TanStack Query cache so stale user data disappears instantly
      queryClient.clear();

      // 4. Force router stack back to unauthenticated sign-in screen
      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error("Error during sign-out:", error);
      // Hard fallback navigation if storage wipe fails
      router.replace("/(auth)/sign-in");
    }
  };

  return { handleLogout };
}