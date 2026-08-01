import { Link } from 'react-router-dom'

export default function FinalCTA({ h2 = "Start seeing what creates revenue.", sub = "Install SourceTrack, track your first conversion, and build a dashboard around the metrics that matter.", primaryCta = 'Start free', primaryHref = '/signup', secondaryCta = 'See pricing', secondaryHref = '/pricing' }) {
  return (
    <section className="py-[100px]" style={{ background: 'linear-gradient(135deg, #D2EC2A, #E4FF73)' }}>
      <div className="max-w-[1320px] mx-auto px-8">
        <div className="relative overflow-hidden grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-7 items-center min-h-[360px] p-[54px] rounded-[40px] bg-st-black text-white shadow-[0_28px_90px_rgba(18,16,12,.22)]">
          <div className="absolute right-[-38px] bottom-[-72px] text-white/5 text-[286px] leading-none font-black tracking-[-0.1em] select-none">Aa</div>
          <div className="relative z-10">
            <h2 className="text-[clamp(38px,5vw,74px)] leading-[0.94] tracking-[-0.07em] font-black">{h2}</h2>
            <p className="mt-[18px] max-w-[620px] text-[#CBD4D4] text-lg leading-[1.55]">{sub}</p>
          </div>
          <div className="relative z-10 flex justify-end flex-wrap gap-3">
            <Link to={primaryHref} className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(210,236,42,0.28)] hover:bg-[#BCD41C] transition-all hover:-translate-y-px">
              {primaryCta}
            </Link>
            <Link to={secondaryHref} className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full border border-white/20 bg-white/5 text-white text-[15px] font-extrabold tracking-[-0.025em] hover:bg-white/10 transition-all hover:-translate-y-px">
              {secondaryCta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
