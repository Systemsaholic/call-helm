import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { CallProvider } from '@/lib/contexts/CallContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <CallProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </CallProvider>
  )
}