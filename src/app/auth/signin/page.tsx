import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <SignIn
        path="/auth/signin"
        routing="path"
        signUpUrl="/auth/signup"
        fallbackRedirectUrl="/library"
      />
    </main>
  );
}
