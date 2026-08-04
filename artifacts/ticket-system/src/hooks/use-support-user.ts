import { useAuth as useClerkAuth } from "@clerk/react";
import {
  getGetCurrentAuthUserQueryKey,
  useGetCurrentAuthUser,
} from "@workspace/api-client-react";

export function useSupportUser() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const query = useGetCurrentAuthUser({
    query: {
      queryKey: getGetCurrentAuthUserQueryKey(),
      enabled: isLoaded && Boolean(isSignedIn),
      retry: false,
    },
  });

  return {
    user: query.data?.user ?? null,
    isLoading: !isLoaded || (Boolean(isSignedIn) && query.isLoading),
    isAuthenticated: Boolean(isSignedIn),
    accessDenied: Boolean(isSignedIn && query.isError && !query.isLoading),
  };
}