import Link from 'next/link';

const DEMOS = [
  {
    href: '/claims',
    title: 'Claims List',
    description: 'Browse existing claims using the <ClaimsList> component.',
    component: 'ClaimsList',
  },
  {
    href: '/submit',
    title: 'Submit Claim',
    description: 'Walk through the claim submission flow with <ClaimSubmission>.',
    component: 'ClaimSubmission',
  },
  {
    href: '/portal',
    title: 'Full Portal',
    description: 'The all-in-one <PhoenixPortal> with internal navigation.',
    component: 'PhoenixPortal',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Phoenix SDK Demo
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          This Next.js app simulates a partner website embedding the Phoenix React SDK.
          Pink-bordered zones indicate SDK components. The event log sidebar shows
          real-time SDK events.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEMOS.map((demo) => (
          <Link
            key={demo.href}
            href={demo.href}
            className="group rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 inline-block rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
              &lt;{demo.component}&gt;
            </div>
            <h2 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600">
              {demo.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{demo.description}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Quick Start</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
{`import { PhoenixProvider, ClaimsList } from '@papaya/phoenix-react';

function App() {
  return (
    <PhoenixProvider
      config={{ baseUrl: 'https://phoenix.papaya.asia' }}
      policyNumbers={['287686']}
    >
      <ClaimsList onClaimSelect={(c) => console.log(c)} />
    </PhoenixProvider>
  );
}`}
        </pre>
      </div>
    </div>
  );
}
