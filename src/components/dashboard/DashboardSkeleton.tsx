/**
 * What a dashboard shows while the session is being read back.
 *
 * The shell used to print one line of text on an empty page while it waited,
 * which tells a person nothing about what is coming (9.2). The blocks below
 * follow the real layout, so the page settles rather than jumps, and reduced
 * motion hands back a still version of the same shapes.
 */

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[20px] bg-charcoal/10 motion-reduce:animate-none ${className}`} />;
}

function Line({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-charcoal/10 motion-reduce:animate-none ${className}`} />;
}

export default function DashboardSkeleton() {
  return (
    <section className="min-h-screen bg-cream pb-[80px] pt-[120px]" role="status" aria-live="polite">
      <span className="sr-only">Loading your dashboard</span>

      <div className="mx-auto max-w-[1000px] px-5 md:px-6">
        <Block className="h-[168px] bg-deep-green/20" />

        <div className="mt-6 grid grid-cols-1 gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="rounded-[20px] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:px-8 md:py-8">
              <Line className="h-3 w-24" />
              <Line className="mt-4 h-6 w-3/4" />
              <Line className="mt-3 h-4 w-full" />
              <Line className="mt-4 h-12 w-full" />
            </div>

            <div className="rounded-[20px] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:px-8 md:py-8">
              <Line className="h-5 w-40" />
              <div className="mt-5 flex items-start justify-between gap-1">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index} className="flex flex-1 flex-col items-center">
                    <div className="h-7 w-7 animate-pulse rounded-full bg-charcoal/10 motion-reduce:animate-none" />
                    <Line className="mt-2 h-3 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[20px] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:px-8 md:py-8">
            <Line className="h-5 w-32" />
            <div className="mt-5 flex flex-col gap-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index}>
                  <Line className="h-3 w-20" />
                  <Line className="mt-2 h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
