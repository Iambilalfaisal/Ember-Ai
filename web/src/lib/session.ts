import { create } from "zustand";
import { persist } from "zustand/middleware";

// Who is signed in. In the demo this is also the role switcher: changing the user changes what the
// API returns, because the client sends the user id with every request.

type SessionState = {
  userId: string | null;
  signIn: (userId: string) => void;
  signOut: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      signIn: (userId) => set({ userId }),
      signOut: () => set({ userId: null }),
    }),
    { name: "ember.session", skipHydration: true },
  ),
);
