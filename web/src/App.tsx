import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./lib/auth";
import { api, ApiError, queryKeys } from "./lib/api";

const Today = lazy(() => import("./screens/Today"));
const Program = lazy(() => import("./screens/Program"));
const Log = lazy(() => import("./screens/Log"));
const Progress = lazy(() => import("./screens/Progress"));
const Profile = lazy(() => import("./screens/Profile"));
const Onboarding = lazy(() => import("./screens/Onboarding"));
const SignIn = lazy(() => import("./screens/SignIn"));
const ActiveWorkout = lazy(() => import("./screens/ActiveWorkout"));
const ExerciseDetail = lazy(() => import("./screens/ExerciseDetail"));

function FullScreenSpinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface">
      <div className="type-label text-on-surface-variant">Loading…</div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
    enabled: auth.status === "signed_in",
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  if (auth.status === "loading") return <FullScreenSpinner />;
  if (auth.status === "signed_out") {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <SignIn />
      </Suspense>
    );
  }

  if (me.isPending) return <FullScreenSpinner />;

  const notOnboarded =
    (me.isError && me.error instanceof ApiError && me.error.status === 404) ||
    (me.isSuccess && !me.data.onboardedAt);

  if (notOnboarded) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/program" element={<Program />} />
        <Route path="/log" element={<Log />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/workout/:id" element={<ActiveWorkout />} />
        <Route path="/exercise/:id" element={<ExerciseDetail />} />
        {/* Re-run the setup walkthrough on demand (Profile → "Redo setup"). */}
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
