export default function FAQSection({ faqs }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {faqs.map((f, i) => (
        <div key={i} className="p-6 rounded-[24px] bg-white border border-[#E7E0D2]">
          <strong className="block text-lg tracking-[-0.04em] mb-2">{f.q}</strong>
          <p className="text-[#6E675C] leading-relaxed">{f.a}</p>
        </div>
      ))}
    </div>
  )
}
