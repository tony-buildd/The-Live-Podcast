import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <SignUp
        path="/auth/signup"
        routing="path"
        signInUrl="/auth/signin"
        fallbackRedirectUrl="/library"
      />
    </main>
  );
}
