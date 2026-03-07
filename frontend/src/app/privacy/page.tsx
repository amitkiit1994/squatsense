import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | FreeForm Fitness",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-6 max-w-3xl mx-auto">
      <Link
        href="/"
        className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-block"
      >
        &larr; Back to FreeForm Fitness
      </Link>

      <h1 className="text-3xl font-bold text-zinc-50 mb-6">Privacy Policy</h1>
      <p className="text-sm text-zinc-400 mb-8">Last updated: March 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            1. Data We Collect
          </h2>
          <ul className="list-disc list-inside space-y-1 text-zinc-300">
            <li>
              <strong>Account data:</strong> Email address, name, and hashed
              password when you register.
            </li>
            <li>
              <strong>Profile data:</strong> Experience level, training goals,
              injury history, and training maxes you provide during onboarding.
            </li>
            <li>
              <strong>Workout data:</strong> Video frames processed in real-time
              for pose estimation (not stored), rep scores, session metrics,
              coaching feedback.
            </li>
            <li>
              <strong>Uploaded videos:</strong> Temporarily stored for batch
              analysis, then deleted after processing.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            2. How We Use Your Data
          </h2>
          <ul className="list-disc list-inside space-y-1 text-zinc-300">
            <li>Provide real-time movement analysis and form scoring.</li>
            <li>Generate personalized coaching recommendations.</li>
            <li>Track your training progress over time.</li>
            <li>Improve our movement analysis algorithms (aggregated, anonymised data only).</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            3. Cookies &amp; Local Storage
          </h2>
          <p className="text-zinc-300">
            We use essential cookies (JWT authentication tokens stored as
            httpOnly cookies or in local storage) and your cookie consent
            preference. We do not use third-party tracking cookies or analytics
            scripts.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            4. Data Sharing
          </h2>
          <p className="text-zinc-300">
            We do not sell or share your personal data with third parties. If AI
            coaching is enabled, anonymised session summaries may be sent to an
            LLM provider (OpenAI or Anthropic) to generate coaching feedback.
            No personally identifiable information is included in these requests.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            5. Your Rights
          </h2>
          <ul className="list-disc list-inside space-y-1 text-zinc-300">
            <li>
              <strong>Export:</strong> Download all your data via Settings &gt;
              Export Data.
            </li>
            <li>
              <strong>Delete:</strong> Permanently delete your account and all
              associated data via Settings &gt; Delete Account.
            </li>
            <li>
              <strong>Access:</strong> View all stored data through the app
              interface.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            6. Data Retention
          </h2>
          <p className="text-zinc-300">
            Uploaded videos are deleted immediately after analysis. Account and
            workout data are retained until you delete your account. Refresh
            tokens expire after 7 days.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            7. Security
          </h2>
          <p className="text-zinc-300">
            Passwords are hashed using bcrypt. All API communication uses HTTPS.
            JWT tokens are signed with a server-side secret. Rate limiting
            protects against abuse.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-50 mb-2">
            8. Contact
          </h2>
          <p className="text-zinc-300">
            For privacy-related questions, contact us at{" "}
            <span className="text-blue-400">privacy@freeformfitness.ai</span>.
          </p>
        </div>
      </section>
    </div>
  );
}
