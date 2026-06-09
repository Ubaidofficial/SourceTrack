import { Link } from 'react-router-dom'

export default function HeroSection({
  kicker,
  h1,
  h1Gradient,
  sub,
  primaryCta,
  primaryHref = '/signup',
  secondaryCta,
  secondaryHref,
  proofs = ['Install in minutes', 'Track 30 attributed conversions free', 'Built for founders and marketers'],
  children,
}) {
  return (
    <section className="relative overflow-hidden py-[82px] md:pb-[100px]" style={{
      background: 'radial-gradient(circle at 88% 18%, rgba(204,240,63,.52), transparent 24%), radial-gradient(circle at 22% 6%, rgba(0,170,87,.12), transparent 26%), linear-gradient(180deg, #FFFFFF 0%, #F8FBFB 100%)',
    }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(31,35,35,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(31,35,35,.045) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,.5), transparent 70%)',
      }} />

      <div className="relative z-10 max-w-[1320px] mx-auto px-8">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-6 self-center">
            {kicker && (
              <span className="inline-flex items-center gap-2 rounded-full py-2 px-3 text-[13px] font-extrabold tracking-[-0.015em] text-st-black bg-[rgba(31,35,35,.055)] border border-[rgba(31,35,35,.07)]">
                <span className="w-2 h-2 rounded-full bg-[#00AA57] shadow-[0_0_0_6px_rgba(0,170,87,.12)]" />
                {kicker}
              </span>
            )}

            <h1 className="mt-[18px] max-w-[880px] text-st-black leading-[0.88] tracking-[-0.08em] font-black" style={{ fontSize: 'clamp(40px, 7.3vw, 104px)' }}>
              {h1}{' '}
              {h1Gradient && (
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #1F2323, #4E5A23 50%, #9FC20C)' }}>
                  {h1Gradient}
                </span>
              )}
            </h1>

            <p className="mt-7 max-w-[640px] text-[#586464] text-xl leading-[1.55] tracking-[-0.025em]">{sub}</p>

            <div className="flex flex-wrap gap-[14px] mt-[34px]">
              <Link to={primaryHref} className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                {primaryCta}
              </Link>
              {secondaryCta && (
                <Link to={secondaryHref} className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-black text-white text-[15px] font-extrabold tracking-[-0.025em] hover:bg-[#171B1B] transition-all hover:-translate-y-px">
                  {secondaryCta}
                </Link>
              )}
            </div>

            <div className="flex flex-wrap gap-x-[18px] gap-y-[14px] mt-[30px] text-[#586464] text-[13px] font-extrabold">
              {proofs.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-2 before:content-[''] before:w-[7px] before:h-[7px] before:rounded-full before:bg-st-lime">{p}</span>
              ))}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6 self-center">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
