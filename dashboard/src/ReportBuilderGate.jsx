import { useAuth } from './contexts/AuthContext'
import ReportBuilderMarketing from './pages/ReportBuilderMarketing'
import ReportBuilder from './pages/ReportBuilder'
import Layout from './components/Layout'

export default function ReportBuilderGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!user) {
    return <ReportBuilderMarketing />
  }

  return <Layout><ReportBuilder /></Layout>
}
