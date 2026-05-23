import { useAuth } from '../contexts/AuthContext'

export default function AuthCallback() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-[#2B302F]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-[#2B302F]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
    </div>
  )
}
