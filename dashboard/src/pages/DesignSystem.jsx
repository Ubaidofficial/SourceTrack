import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import FilterBar from '../components/FilterBar'
import MetricTile from '../components/MetricTile'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import OnboardingCard from '../components/OnboardingCard'
import OnboardingProgress from '../components/OnboardingProgress'
import { BarChart3, ArrowRight, Code, Download } from 'lucide-react'

const COLORS = [
  { name: 'Black', hex: '#1F2323', className: 'bg-st-black' },
  { name: 'Gray', hex: '#7D8090', className: 'bg-st-gray' },
  { name: 'Lime', hex: '#CCF03F', className: 'bg-st-lime' },
  { name: 'Green', hex: '#00AA57', className: 'bg-st-green' },
  { name: 'Orange', hex: '#FF8800', className: 'bg-st-orange' },
  { name: 'Red', hex: '#E54545', className: 'bg-st-red' }
]

const TYPO_SAMPLES = [
  { label: 'Heading (text-2xl font-bold)', className: 'text-2xl font-bold' },
  { label: 'Title (text-lg font-semibold)', className: 'text-lg font-semibold' },
  { label: 'Body (text-sm font-normal)', className: 'text-sm font-normal' },
  { label: 'Caption (text-xs)', className: 'text-xs' },
  { label: 'Small (text-xs text-gray-500)', className: 'text-xs text-gray-500' }
]

const TABLE_COLS = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={row.status} /> },
  { key: 'value', label: 'Value', render: (row) => row.value, cellClassName: 'text-right font-medium' }
]

const TABLE_ROWS = [
  { name: 'Google Ads', status: 'active', value: '$1,234' },
  { name: 'Facebook Ads', status: 'inactive', value: '$567' },
  { name: 'Email Campaign', status: 'success', value: '$890' }
]

export default function DesignSystem() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] p-8">
      <div className="st-container space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Design System</h1>
          <p className="text-sm text-gray-500 mt-1">SourceTrack token layer and shared primitives</p>
        </div>

        {/* Colors */}
        <DashboardCard title="Color Tokens" subtitle="Figma-mapped `st` namespace">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {COLORS.map((c) => (
              <div key={c.name} className="text-center">
                <div className={`h-12 rounded-lg ${c.className} mb-1.5 ring-1 ring-inset ring-black/10`} />
                <p className="text-xs font-medium text-gray-700">{c.name}</p>
                <p className="text-xs text-gray-400 font-mono">{c.hex}</p>
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Typography */}
        <DashboardCard title="Typography" subtitle="Inter (400–700) via Google Fonts">
          <div className="space-y-3">
            {TYPO_SAMPLES.map((t) => (
              <div key={t.label}>
                <p className={t.className + ' text-gray-900'}>
                  SourceTrack attribution analytics platform
                </p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{t.label}</p>
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Grid */}
        <DashboardCard title="Grid" subtitle="1320px wrapper (st-container), 12-column (grid-cols-12 gap-6)">
          <div className="grid grid-cols-12 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-8 bg-st-lime/20 rounded flex items-center justify-center text-xs font-medium text-st-black">
                {i + 1}
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Components */}
        <DashboardCard title="Shared Components" subtitle="DashboardCard, MetricTile, FilterBar, StatusBadge, EmptyState">

          <div className="space-y-6">
            {/* MetricTile */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">MetricTile</p>
              <div className="grid grid-cols-3 gap-3">
                <MetricTile label="Revenue" value="$12,345" delta={{ pct: 12 }} icon={BarChart3} />
                <MetricTile label="Leads" value="234" delta={{ pct: -5 }} icon={ArrowRight} />
                <MetricTile label="AI Revenue" value="$3,456" icon={Code} />
              </div>
            </div>

            {/* FilterBar */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">FilterBar</p>
              <FilterBar
                dateButtons={[
                  { key: '24h', label: 'Last 24 hours' },
                  { key: '7d', label: 'Last 7 days' },
                  { key: '30d', label: 'Last 30 days' }
                ]}
                activeDate="30d"
                onExport={() => {}}
              />
            </div>

            {/* StatusBadge */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">StatusBadge</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="success" label="Success" />
                <StatusBadge status="warning" label="Warning" />
                <StatusBadge status="error" label="Error" />
                <StatusBadge status="info" label="Info" />
                <StatusBadge status="neutral" label="Neutral" />
                <StatusBadge status="verified" label="Verified" />
                <StatusBadge status="active" label="Active" />
                <StatusBadge status="inactive" label="Inactive" />
              </div>
            </div>

            {/* EmptyState */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">EmptyState</p>
              <div className="border border-gray-200 rounded-xl">
                <EmptyState
                  icon={Download}
                  title="No data yet"
                  description="Events will appear here once your pixel starts receiving traffic."
                  action={{ label: 'View Snippet', onClick: () => {} }}
                />
              </div>
            </div>

            {/* DashboardTable */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">DashboardTable</p>
              <DashboardTable columns={TABLE_COLS} rows={TABLE_ROWS} />
            </div>

            {/* Onboarding */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">OnboardingProgress & OnboardingCard</p>
              <OnboardingProgress currentStep={3} totalSteps={5} />
              <div className="mt-4">
                <OnboardingCard
                  icon={Code}
                  title="Sample Onboarding Step"
                  subtitle="This is how onboarding cards render with the Figma design system."
                  cta={<button className="px-4 py-2 bg-black text-white rounded-lg text-sm">Continue</button>}
                >
                  <p className="text-sm text-gray-500">Card content goes here.</p>
                </OnboardingCard>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  )
}
