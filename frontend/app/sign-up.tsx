import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Sign-up screen removed — auth is unified into Sign-in (OTP auto-creates
 * new users). This route is kept only as a redirect so any existing deep
 * link `/sign-up` still works.
 */
export default function SignUp() {
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const href = params.returnTo ? `/sign-in?returnTo=${encodeURIComponent(String(params.returnTo))}` : "/sign-in";
  return <Redirect href={href as any} />;
}
