// Shared Chart.js scriptable `backgroundColor` for the lime area fill.
// 3-stop vertical gradient: solid #CCF03F at the top → 18% mid → transparent at
// the baseline. Returns a flat fallback before the chart area is laid out on the
// first render (chartArea is undefined then). Pair with a dark `borderColor` so
// the line stays readable over the fade.
export function limeAreaGradient(ctx) {
  const { ctx: canvas, chartArea } = ctx.chart
  if (!chartArea) return 'rgba(204,240,63,0.18)'
  const g = canvas.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  g.addColorStop(0, '#CCF03F')
  g.addColorStop(0.5, 'rgba(204,240,63,0.18)')
  g.addColorStop(1, 'rgba(204,240,63,0)')
  return g
}

export default limeAreaGradient
