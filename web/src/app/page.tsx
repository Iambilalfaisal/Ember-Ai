import { APP_NAME } from "@ember/ui";

// A blank shell. The app shell, navigation and screens arrive in FE3 and later.
export default function Home() {
  return (
    <main className="min-h-screen">
      <h1 className="sr-only">{APP_NAME}</h1>
    </main>
  );
}
